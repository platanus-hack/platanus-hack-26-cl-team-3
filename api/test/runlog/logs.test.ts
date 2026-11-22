import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../../src/server/server";
import { openDatabase } from "../../src/db/sqlite";
import { sqliteRunLog } from "../../src/runlog/sqlite-runlog";
import type { RunLogStore, TurnLog } from "../../src/runlog/store";

let server: Server;
let bare: Server;
let base: string;
let bareBase: string;
let store: RunLogStore;
const originalToken = process.env.LOGS_TOKEN;
const auth = { authorization: "Bearer secreto" };

const turn = (id: string, created_at: string, conversation_id: string | null, extra: Partial<TurnLog> = {}): TurnLog => ({
  id, conversation_id, device_id: null, created_at, model: "m", effort: null, mode: null, prompt_version: "v1",
  context_messages: 1, question: "q", answer: "a", fresh: null, outcome: "ok", rounds: 1, input_tokens: null,
  output_tokens: null, cache_read_tokens: null, cache_creation_tokens: null, duration_ms: 5, ...extra,
});

const listen = async (s: Server) => {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};

before(async () => {
  store = sqliteRunLog(openDatabase(":memory:"));
  store.saveTurn(turn("t1", "2026-01-01T00:00:01Z", "c1", { fresh: JSON.stringify([{ role: "user", content: "hola" }]) }), [
    { round: 2, tool_use_id: "u2", name: "b", input: '{"x":2}', output: null, is_error: true, duration_ms: 1 },
    { round: 1, tool_use_id: "u1", name: "a", input: '{"x":1}', output: '{"ok":true}', is_error: false, duration_ms: 2 },
  ]);
  store.saveTurn(turn("t2", "2026-01-01T00:00:02Z", "c2"), []);
  store.saveTurn(turn("t3", "2026-01-01T00:00:03Z", "c1"), []);
  store.saveTurn(turn("t4", "2026-01-01T00:00:04Z", "c1"), []);
  store.saveTurn(turn("t5", "2026-01-01T00:00:05Z", null), []);
  server = createServer({ runlog: store });
  bare = createServer();
  base = await listen(server);
  bareBase = await listen(bare);
});
after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => bare.close(r));
});
afterEach(() => {
  if (originalToken === undefined) delete process.env.LOGS_TOKEN;
  else process.env.LOGS_TOKEN = originalToken;
});

const get = (path: string, headers: Record<string, string> = auth, url = base) => fetch(`${url}${path}`, { headers });

test("sin LOGS_TOKEN las rutas responden 404", async () => {
  delete process.env.LOGS_TOKEN;
  assert.equal((await get("/api/logs/turns")).status, 404);
  assert.equal((await get("/api/logs/turns/t1")).status, 404);
});

test("otro método responde 404", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const res = await fetch(`${base}/api/logs/turns`, { method: "POST", headers: auth });
  assert.equal(res.status, 404);
});

test("sin header o con header malo responde 401", async () => {
  process.env.LOGS_TOKEN = "secreto";
  assert.equal((await get("/api/logs/turns", {})).status, 401);
  assert.equal((await get("/api/logs/turns", { authorization: "Bearer otro" })).status, 401);
  assert.equal((await get("/api/logs/turns", { authorization: "Bearer secretO" })).status, 401);
  assert.deepEqual(await (await get("/api/logs/turns", {})).json(), { error: "No autorizado." });
});

test("sin store responde 503", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const res = await get("/api/logs/turns", auth, bareBase);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Los logs no están disponibles." });
});

test("lista turnos del más nuevo al más viejo", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const body = (await (await get("/api/logs/turns")).json()) as { turns: { id: string; outcome: string }[]; next_cursor: unknown };
  assert.deepEqual(body.turns.map((t) => t.id), ["t5", "t4", "t3", "t2", "t1"]);
  assert.deepEqual(Object.keys(body.turns[0]!).sort(), ["conversation_id", "created_at", "id", "outcome"]);
  assert.equal(body.next_cursor, null);
});

test("limit=2 recorre todo sin repetir ni saltar", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const q: string = cursor ? `&cursor=${cursor}` : "";
    const body = (await (await get(`/api/logs/turns?limit=2${q}`)).json()) as { turns: { id: string }[]; next_cursor: string | null };
    seen.push(...body.turns.map((t) => t.id));
    cursor = body.next_cursor;
    pages++;
  } while (cursor);
  assert.deepEqual(seen, ["t5", "t4", "t3", "t2", "t1"]);
  assert.equal(pages, 3);
});

test("conversación completa en orden cronológico desde el último turno, con tools parseadas", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const body = (await (await get("/api/logs/turns/t4")).json()) as {
    conversation_id: string;
    turns: { id: string; messages: unknown; tools: Record<string, unknown>[]; fresh?: unknown }[];
    next_cursor: string | null;
  };
  assert.equal(body.conversation_id, "c1");
  assert.deepEqual(body.turns.map((t) => t.id), ["t1", "t3", "t4"]);
  assert.equal(body.next_cursor, null);
  const first = body.turns[0]!;
  assert.deepEqual(first.messages, [{ role: "user", content: "hola" }]);
  assert.equal("fresh" in first, false);
  assert.equal(body.turns[1]!.messages, null);
  assert.deepEqual(first.tools.map((t) => [t.round, t.name, t.input, t.output, t.is_error]), [
    [1, "a", { x: 1 }, { ok: true }, false],
    [2, "b", { x: 2 }, null, true],
  ]);
});

test("pagina la conversación con limit", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const one = (await (await get("/api/logs/turns/t4?limit=2")).json()) as { turns: { id: string }[]; next_cursor: string | null };
  assert.deepEqual(one.turns.map((t) => t.id), ["t1", "t3"]);
  assert.ok(one.next_cursor);
  const two = (await (await get(`/api/logs/turns/t4?limit=2&cursor=${one.next_cursor}`)).json()) as { turns: { id: string }[]; next_cursor: string | null };
  assert.deepEqual(two.turns.map((t) => t.id), ["t4"]);
  assert.equal(two.next_cursor, null);
});

test("turno sin conversación devuelve solo ese turno; id inexistente 404", async () => {
  process.env.LOGS_TOKEN = "secreto";
  const body = (await (await get("/api/logs/turns/t5")).json()) as { conversation_id: unknown; turns: { id: string }[] };
  assert.equal(body.conversation_id, null);
  assert.deepEqual(body.turns.map((t) => t.id), ["t5"]);
  assert.equal((await get("/api/logs/turns/nope")).status, 404);
});

test("limit y cursor inválidos responden 400", async () => {
  process.env.LOGS_TOKEN = "secreto";
  for (const path of ["/api/logs/turns", "/api/logs/turns/t1"]) {
    for (const limit of ["0", "101", "abc"]) {
      const res = await get(`${path}?limit=${limit}`);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "limit inválido" });
    }
    const res = await get(`${path}?cursor=basura`);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "cursor inválido" });
  }
});
