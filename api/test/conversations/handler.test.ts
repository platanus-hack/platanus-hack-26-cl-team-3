import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../../src/server/server";
import { sqliteStore } from "../../src/conversations/sqlite-store";

let server: Server;
let base: string;
let bare: Server;
let bareBase: string;

const listen = async (s: Server) => {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};

before(async () => {
  server = createServer({ conversations: sqliteStore(":memory:") });
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
const msgs = (text: string) => [{ role: "user", content: text }, { role: "assistant", content: [{ type: "text", text: "ok" }] }];

test("flujo completo: device, create, list, get, put, list ordenado", async () => {
  const dev = await device();
  const a = ((await (await call("POST", "/api/conversations", dev, { messages: msgs("primera") })).json()) as { id: string }).id;
  const b = ((await (await call("POST", "/api/conversations", dev, { messages: msgs("segunda") })).json()) as { id: string }).id;
  let list = (await (await call("GET", "/api/conversations", dev)).json()) as { conversations: { id: string; title: string }[] };
  assert.deepEqual(list.conversations.map((c) => c.id), [b, a]);
  assert.equal(list.conversations[1].title, "primera");

  const got = await (await call("GET", `/api/conversations/${a}`, dev)).json();
  assert.deepEqual(got.messages, msgs("primera"));

  const put = await call("PUT", `/api/conversations/${a}`, dev, { messages: [...msgs("primera"), { role: "user", content: "más" }] });
  assert.equal(put.status, 204);
  list = (await (await call("GET", "/api/conversations", dev)).json()) as typeof list;
  assert.deepEqual(list.conversations.map((c) => c.id), [a, b]);
  assert.equal((await (await call("GET", `/api/conversations/${a}`, dev)).json()).messages.length, 3);
});

test("aislamiento entre devices", async () => {
  const d1 = await device();
  const d2 = await device();
  const id = ((await (await call("POST", "/api/conversations", d1, { messages: msgs("mía") })).json()) as { id: string }).id;
  assert.equal((await call("GET", `/api/conversations/${id}`, d2)).status, 404);
  assert.equal((await call("PUT", `/api/conversations/${id}`, d2, { messages: msgs("x") })).status, 404);
  const l = (await (await call("GET", "/api/conversations", d2)).json()) as { conversations: unknown[] };
  assert.equal(l.conversations.length, 0);
  assert.equal((await call("GET", `/api/conversations/${id}`, d1)).status, 200);
});

test("503 sin store", async () => {
  const r = await fetch(`${bareBase}/api/devices`, { method: "POST" });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "El historial no está disponible." });
});

test("400 sin x-device-id o inválido; 403 con device desconocido", async () => {
  assert.equal((await call("GET", "/api/conversations")).status, 400);
  assert.equal((await call("GET", "/api/conversations", "no-es-uuid")).status, 400);
  const r = await call("POST", "/api/conversations", crypto.randomUUID(), { messages: msgs("x") });
  assert.equal(r.status, 403);
});

test("401 con CHAT_TOKEN y sin header", async () => {
  process.env.CHAT_TOKEN = "secreto";
  const r = await fetch(`${base}/api/devices`, { method: "POST" });
  assert.equal(r.status, 401);
  const ok = await fetch(`${base}/api/devices`, { method: "POST", headers: { "x-chat-token": "secreto" } });
  assert.equal(ok.status, 201);
});

test("validación del body y :id", async () => {
  const dev = await device();
  assert.equal((await call("POST", "/api/conversations", dev, { messages: [] })).status, 400);
  assert.equal((await call("POST", "/api/conversations", dev, {})).status, 400);
  assert.equal((await call("POST", "/api/conversations", dev, { messages: Array(201).fill({ role: "user", content: "x" }) })).status, 400);
  const bad = await fetch(`${base}/api/conversations`, { method: "POST", headers: { "x-device-id": dev }, body: "{no" });
  assert.equal(bad.status, 400);
  assert.equal((await call("GET", "/api/conversations/abc", dev)).status, 404);
  assert.equal((await call("GET", `/api/conversations/${crypto.randomUUID()}`, dev)).status, 404);
});

test("las imágenes se reemplazan al guardar", async () => {
  const dev = await device();
  const image = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } };
  const id = ((await (await call("POST", "/api/conversations", dev, { messages: [{ role: "user", content: [image, { type: "text", text: "mira" }] }] })).json()) as { id: string }).id;
  const got = await (await call("GET", `/api/conversations/${id}`, dev)).json();
  assert.deepEqual(got.messages[0].content[0], { type: "text", text: "[foto del vano]" });
  assert.equal(got.title, "mira");
});

test("413 con body grande", async () => {
  const dev = await device();
  const r = await call("POST", "/api/conversations", dev, { messages: [{ role: "user", content: "x".repeat(1024 * 1024 + 10) }] });
  assert.equal(r.status, 413);
});
