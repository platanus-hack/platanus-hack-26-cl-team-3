import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { createServer } from "../../src/server/server";
import type { Adapter } from "../../src/chat/orchestrator";

let server: Server;
let base: string;
const adapter: Adapter = async function* () {
  return { stop_reason: "end_turn", content: [{ type: "text", text: "hola" }] } as Message;
};

before(async () => {
  server = createServer({ adapter });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise((r) => server.close(r)));

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

test("7: non-array messages, assistant last, >40 messages or unknown profile respond 400", async () => {
  assert.equal((await post({ messages: "x" })).status, 400);
  assert.equal((await post({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] })).status, 400);
  const many = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" }));
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
