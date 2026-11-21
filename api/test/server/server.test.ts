import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import http from "node:http";
import type { Server } from "node:http";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { createServer } from "../../src/server/server";
import type { Adapter } from "../../src/chat/orchestrator";

let server: Server;
let base: string;
let pingServer: Server;
let pingBase: string;
const adapter: Adapter = async function* () {
  return { stop_reason: "end_turn", content: [{ type: "text", text: "hola" }] } as Message;
};

const slowAdapter: Adapter = async function* ({ signal }) {
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 200);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      aborted = true;
      resolve();
    });
  });
  return { stop_reason: "end_turn", content: [{ type: "text", text: "hola" }] } as Message;
};
let aborted = false;

before(async () => {
  server = createServer({ adapter });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pingServer = createServer({ adapter: slowAdapter, heartbeatMs: 20 });
  await new Promise<void>((r) => pingServer.listen(0, "127.0.0.1", r));
  pingBase = `http://127.0.0.1:${(pingServer.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => pingServer.close(r));
});

const post = (body: unknown, raw?: string) =>
  fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

test("GET /api/health", async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test("7: missing messages responds 400", async () => {
  const r = await post({});
  assert.equal(r.status, 400);
  assert.equal(typeof ((await r.json()) as { error: unknown }).error, "string");
});

test("7: non-array messages, assistant last, >200 messages or unknown profile respond 400", async () => {
  assert.equal((await post({ messages: "x" })).status, 400);
  assert.equal((await post({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] })).status, 400);
  const many = Array.from({ length: 201 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" }));
  many.push({ role: "user", content: "x" });
  assert.equal((await post({ messages: many })).status, 400);
  assert.equal((await post({ profile_id: "nope", messages: [{ role: "user", content: "a" }] })).status, 400);
  assert.equal((await post(null, "{no json")).status, 400);
});

test("happy path: SSE with done", async () => {
  const r = await post({ messages: [{ role: "user", content: "hola" }] });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type")!, /text\/event-stream/);
  const t = await r.text();
  assert.match(t, /^event: done\ndata: \{.*\}\n\n$/s);
});

const userMsg = { messages: [{ role: "user", content: "hola" }] };

test("a body over 1 MB responds 413 and the client receives the status", async () => {
  const r = await post(null, JSON.stringify({ messages: [{ role: "user", content: "x".repeat(2 * 1024 * 1024) }] }));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { error: "El mensaje es demasiado grande." });
});

test("GET // responds 400 URL inválida", async () => {
  const r = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const url = new URL(base);
    http
      .request({ host: url.hostname, port: url.port, path: "//", method: "GET" }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      })
      .on("error", reject)
      .end();
  });
  assert.equal(r.status, 400);
  assert.deepEqual(JSON.parse(r.body), { error: "URL inválida" });
});

test("with CHAT_TOKEN set, a missing or wrong x-chat-token responds 401 and the right one passes", async () => {
  process.env.CHAT_TOKEN = "secreto";
  try {
    const send = (headers: Record<string, string>) =>
      fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(userMsg) });
    const missing = await send({});
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "No autorizado." });
    assert.equal((await send({ "x-chat-token": "otro" })).status, 401);
    assert.equal((await send({ "x-chat-token": "secreto" })).status, 200);
  } finally {
    delete process.env.CHAT_TOKEN;
  }
});

test("without CHAT_TOKEN no token is required", async () => {
  delete process.env.CHAT_TOKEN;
  assert.equal((await post(userMsg)).status, 200);
});

test("the stream sends : ping comments while open", async () => {
  const r = await fetch(`${pingBase}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(userMsg) });
  const t = await r.text();
  assert.match(t, /: ping\n\n/);
  assert.match(t, /event: done/);
});

test("a client disconnect aborts the signal passed to the adapter", async () => {
  aborted = false;
  const ac = new AbortController();
  const r = await fetch(`${pingBase}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(userMsg), signal: ac.signal });
  await r.body!.getReader().read();
  ac.abort();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(aborted, true);
});
