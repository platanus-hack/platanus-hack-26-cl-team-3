import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { ContentBlock, Message, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { DatabaseSync } from "node:sqlite";
import { createServer } from "../../src/server/server";
import type { Adapter, AdapterArgs } from "../../src/chat/orchestrator";
import { openDatabase } from "../../src/db/sqlite";
import { sqliteStore } from "../../src/conversations/sqlite-store";
import { sqliteRunLog } from "../../src/runlog/sqlite-runlog";

let server: Server;
let base: string;
let db: DatabaseSync;
let calls: AdapterArgs[] = [];

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 };

const adapter: Adapter = async function* (args) {
  calls.push(args);
  const last = args.messages.at(-1);
  const afterTool = Array.isArray(last?.content) && last.content.some((b) => b.type === "tool_result");
  if (!afterTool) {
    const content = [{ type: "tool_use", id: "t1", name: "lookup_fuses", input: { filter: "p/w" } }] as ContentBlock[];
    return { stop_reason: "tool_use", content, usage } as Message;
  }
  return { stop_reason: "end_turn", content: [{ type: "text", text: "Revisa el fusible." }], usage } as Message;
};

before(async () => {
  db = openDatabase(":memory:");
  server = createServer({ adapter, conversations: sqliteStore(db), runlog: sqliteRunLog(db) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});

const device = async () => ((await (await fetch(`${base}/api/devices`, { method: "POST" })).json()) as { id: string }).id;

async function chat(messages: MessageParam[], opts: { device?: string; conversation_id?: string; vehicle_id?: string } = {}) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.device ? { "x-device-id": opts.device } : {}) },
    body: JSON.stringify({ messages, ...(opts.conversation_id ? { conversation_id: opts.conversation_id } : {}), ...(opts.vehicle_id ? { vehicle_id: opts.vehicle_id } : {}) }),
  });
  if (res.status !== 200) return { status: res.status, done: null as null | Record<string, unknown>, body: await res.json() };
  const text = await res.text();
  const chunk = text.split("\n\n").find((c) => c.startsWith("event: done"));
  const done = chunk ? (JSON.parse(chunk.split("data: ")[1]) as Record<string, unknown>) : null;
  return { status: 200, done, body: null };
}

const rows = (sql: string, ...args: string[]) => db.prepare(sql).all(...args) as Record<string, unknown>[];

test("con device: guarda la conversación, la actualiza en el segundo turno y registra turnos y tools", async () => {
  const dev = await device();
  const first = await chat([{ role: "user", content: "se me quedó la ventana" }], { device: dev });
  const convId = first.done?.conversation_id as string;
  assert.ok(convId);
  assert.ok(first.done?.turn_id);

  const fresh = first.done?.messages as MessageParam[];
  const second = await chat(
    [{ role: "user", content: "se me quedó la ventana" }, ...fresh, { role: "user", content: "y ahora?" }],
    { device: dev, conversation_id: convId },
  );
  assert.equal(second.done?.conversation_id, convId);

  const list = (await (await fetch(`${base}/api/conversations`, { headers: { "x-device-id": dev } })).json()) as { conversations: { id: string }[] };
  assert.deepEqual(list.conversations.map((c) => c.id), [convId]);
  const conv = (await (await fetch(`${base}/api/conversations/${convId}`, { headers: { "x-device-id": dev } })).json()) as { messages: unknown[] };
  assert.equal(conv.messages.length, 4 + 1 + 3);

  const turns = rows("SELECT * FROM turns WHERE conversation_id = ? ORDER BY created_at", convId);
  assert.equal(turns.length, 2);
  for (const t of turns) {
    assert.equal(t.outcome, "done");
    assert.equal(t.rounds, 2);
    assert.equal(t.device_id, dev);
    assert.equal(t.input_tokens, 20);
    assert.equal(t.answer, "Revisa el fusible.");
  }
  assert.equal(turns[1].question, "y ahora?");
  assert.equal(turns[0].id, first.done?.turn_id);
  const tools = rows("SELECT * FROM tool_runs WHERE turn_id = ?", turns[0].id as string);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "lookup_fuses");
  assert.equal(tools[0].round, 1);
});

test("con conversation_id de otro device crea una conversación nueva", async () => {
  const a = await device();
  const b = await device();
  const first = await chat([{ role: "user", content: "hola" }], { device: a });
  const other = await chat([{ role: "user", content: "hola" }], { device: b, conversation_id: first.done?.conversation_id as string });
  assert.ok(other.done?.conversation_id);
  assert.notEqual(other.done?.conversation_id, first.done?.conversation_id);
});

test("sin device: el turno queda registrado sin conversación", async () => {
  const r = await chat([{ role: "user", content: "sin device" }]);
  assert.equal(r.done?.conversation_id, undefined);
  const turnId = r.done?.turn_id as string;
  assert.ok(turnId);
  const [t] = rows("SELECT * FROM turns WHERE id = ?", turnId);
  assert.equal(t.conversation_id, null);
  assert.equal(t.device_id, null);
  assert.equal(t.outcome, "done");
});

test("x-device-id mal formado se ignora y conversation_id mal formado da 400", async () => {
  const r = await chat([{ role: "user", content: "hola" }], { device: "no-es-uuid" });
  assert.equal(r.done?.conversation_id, undefined);
  const bad = await chat([{ role: "user", content: "hola" }], { conversation_id: "x" });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body, { error: "conversation_id inválido" });
});

test("el modelo recibe como máximo 30 mensajes y la conversación guarda la historia completa", async () => {
  const dev = await device();
  const history: MessageParam[] = [];
  for (let i = 0; i < 20; i++) history.push({ role: "user", content: `q${i}` }, { role: "assistant", content: [{ type: "text", text: `a${i}` }] });
  history.push({ role: "user", content: "final" });
  calls = [];
  const r = await chat(history, { device: dev });
  assert.ok(calls.length > 0);
  for (const c of calls) assert.ok(c.messages.length <= 30 + 2);
  assert.equal(calls[0].messages.length, 29);
  assert.equal(calls[0].messages.at(-1)?.content, "final");
  const [t] = rows("SELECT context_messages FROM turns WHERE id = ?", r.done?.turn_id as string);
  assert.equal(t.context_messages, 29);
  const conv = (await (await fetch(`${base}/api/conversations/${r.done?.conversation_id}`, { headers: { "x-device-id": dev } })).json()) as { messages: unknown[] };
  assert.equal(conv.messages.length, 41 + 3);
});

test("guarda vehicle_id en la conversación y en el turno, y GET lo devuelve", async () => {
  const dev = await device();
  const first = await chat([{ role: "user", content: "hola" }], { device: dev, vehicle_id: "swift" });
  const convId = first.done?.conversation_id as string;
  const conv = (await (await fetch(`${base}/api/conversations/${convId}`, { headers: { "x-device-id": dev } })).json()) as { vehicle_id: string | null };
  assert.equal(conv.vehicle_id, "swift");
  const list = (await (await fetch(`${base}/api/conversations`, { headers: { "x-device-id": dev } })).json()) as { conversations: { vehicle_id: string | null }[] };
  assert.equal(list.conversations[0].vehicle_id, "swift");
  assert.equal(rows("SELECT vehicle_id FROM turns WHERE id = ?", first.done?.turn_id as string)[0].vehicle_id, "swift");
  const legacy = await chat([{ role: "user", content: "hola" }], { device: dev });
  assert.equal(rows("SELECT vehicle_id FROM conversations WHERE id = ?", legacy.done?.conversation_id as string)[0].vehicle_id, "outback");
});
