import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { createServer } from "../../src/server/server";
import { openDatabase } from "../../src/db/sqlite";
import { sqliteStore } from "../../src/conversations/sqlite-store";
import type { ConversationStore } from "../../src/conversations/store";

let server: Server;
let store: ConversationStore;
let base: string;
let bare: Server;
let bareBase: string;

const listen = async (s: Server) => {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};

before(async () => {
  store = sqliteStore(openDatabase(":memory:"));
  server = createServer({ conversations: store });
  base = await listen(server);
  bare = createServer();
  bareBase = await listen(bare);
});
after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => bare.close(r));
});
afterEach(() => {
  delete process.env.CHAT_TOKEN;
});

const device = async () => ((await (await fetch(`${base}/api/devices`, { method: "POST" })).json()) as { id: string }).id;
const call = (method: string, path: string, dev?: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(dev ? { "x-device-id": dev } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const msgs = (text: string): MessageParam[] => [{ role: "user", content: text }, { role: "assistant", content: [{ type: "text", text: "ok" }] }];

const seed = async (dev: string, text: string) => (await store.create(dev, { title: text, messages: msgs(text) }))!;

test("flujo completo: device, list ordenado, get", async () => {
  const dev = await device();
  const a = await seed(dev, "primera");
  await new Promise((r) => setTimeout(r, 5));
  const b = await seed(dev, "segunda");
  const list = (await (await call("GET", "/api/conversations", dev)).json()) as { conversations: { id: string; title: string }[] };
  assert.deepEqual(list.conversations.map((c) => c.id), [b, a]);
  assert.equal(list.conversations[1].title, "primera");
  const got = await (await call("GET", `/api/conversations/${a}`, dev)).json();
  assert.deepEqual(got.messages, msgs("primera"));
});

test("aislamiento entre devices", async () => {
  const d1 = await device();
  const d2 = await device();
  const id = await seed(d1, "mía");
  assert.equal((await call("GET", `/api/conversations/${id}`, d2)).status, 404);
  const l = (await (await call("GET", "/api/conversations", d2)).json()) as { conversations: unknown[] };
  assert.equal(l.conversations.length, 0);
  assert.equal((await call("GET", `/api/conversations/${id}`, d1)).status, 200);
});

test("ya no hay POST ni PUT de conversaciones", async () => {
  const dev = await device();
  const id = await seed(dev, "x");
  assert.equal((await call("POST", "/api/conversations", dev, { messages: msgs("x") })).status, 404);
  assert.equal((await call("PUT", `/api/conversations/${id}`, dev, { messages: msgs("x") })).status, 404);
});

test("503 sin store", async () => {
  const r = await fetch(`${bareBase}/api/devices`, { method: "POST" });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "El historial no está disponible." });
});

test("400 sin x-device-id o inválido", async () => {
  assert.equal((await call("GET", "/api/conversations")).status, 400);
  assert.equal((await call("GET", "/api/conversations", "no-es-uuid")).status, 400);
});

test("401 con CHAT_TOKEN y sin header", async () => {
  process.env.CHAT_TOKEN = "secreto";
  const r = await fetch(`${base}/api/devices`, { method: "POST" });
  assert.equal(r.status, 401);
  const ok = await fetch(`${base}/api/devices`, { method: "POST", headers: { "x-chat-token": "secreto" } });
  assert.equal(ok.status, 201);
});

test("GET con :id inválido o inexistente da 404", async () => {
  const dev = await device();
  assert.equal((await call("GET", "/api/conversations/abc", dev)).status, 404);
  assert.equal((await call("GET", `/api/conversations/${crypto.randomUUID()}`, dev)).status, 404);
});
