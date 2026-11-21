import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "./server.js";

let server, base;
const adaptador = async function* () {
  return { stop_reason: "end_turn", content: [{ type: "text", text: "hola" }] };
};

before(async () => {
  server = crearServidor({ adaptador });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const post = (body, raw) =>
  fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

test("GET /api/salud", async () => {
  const r = await fetch(`${base}/api/salud`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test("7: sin mensajes responde 400", async () => {
  const r = await post({});
  assert.equal(r.status, 400);
  assert.equal(typeof (await r.json()).error, "string");
});

test("7: mensajes no array, último del asistente, >40 mensajes o perfil inexistente responden 400", async () => {
  assert.equal((await post({ mensajes: "x" })).status, 400);
  assert.equal((await post({ mensajes: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] })).status, 400);
  const muchos = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" }));
  muchos.push({ role: "user", content: "x" });
  assert.equal((await post({ mensajes: muchos })).status, 400);
  assert.equal((await post({ perfil_id: "nope", mensajes: [{ role: "user", content: "a" }] })).status, 400);
  assert.equal((await post(null, "{no json")).status, 400);
});

test("camino feliz: SSE con fin", async () => {
  const r = await post({ mensajes: [{ role: "user", content: "hola" }] });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/event-stream/);
  const t = await r.text();
  assert.match(t, /^event: fin\ndata: \{.*\}\n\n$/s);
});
