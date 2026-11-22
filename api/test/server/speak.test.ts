import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../../src/server/server";
import { SpeakError } from "../../src/speak/errors";
import type { SpeakErrorKind } from "../../src/speak/errors";
import type { Speaker } from "../../src/speak/handler";

let server: Server;
let base: string;
let seen: string | null = null;
let seenVoz: string | null = null;
let behavior: Speaker = async (texto, _signal, voz) => {
  seen = texto;
  seenVoz = voz;
  return new Response(new Uint8Array([73, 68, 51, 4, 0])).body!;
};

before(async () => {
  server = createServer({ speaker: (t, s, v) => behavior(t, s, v) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});
afterEach(() => {
  delete process.env.CHAT_TOKEN;
});

const get = (text: string | null, headers: Record<string, string> = {}, voz?: string) =>
  fetch(
    `${base}/api/speak${text === null ? "" : `?text=${encodeURIComponent(text)}`}${voz === undefined ? "" : `&voz=${encodeURIComponent(voz)}`}`,
    { headers },
  );

test("400 sin texto, con texto que queda vacío y con más de 500 caracteres", async () => {
  const sin = await get(null);
  assert.equal(sin.status, 400);
  assert.deepEqual(await sin.json(), { error: "Falta el texto." });
  const vacio = await get("**  **");
  assert.equal(vacio.status, 400);
  assert.deepEqual(await vacio.json(), { error: "Falta el texto." });
  const largo = await get("a".repeat(501));
  assert.equal(largo.status, 400);
  assert.deepEqual(await largo.json(), { error: "El texto es muy largo." });
  assert.equal((await get("a".repeat(500))).status, 200);
});

test("200 audio/mpeg con el cuerpo del stream y el texto limpio", async () => {
  const r = await get("**Hola** mundo");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [73, 68, 51, 4, 0]);
  assert.equal(seen, "Hola mundo");
});

test("mapeo de errores del speaker", async () => {
  const cases: [SpeakErrorKind, number, string][] = [
    ["config", 500, "Falta ELEVENLABS_API_KEY en el servidor."],
    ["auth", 500, "La key de ElevenLabs no es válida o no tiene permiso de Text to Speech."],
    ["busy", 503, "El servicio de voz está ocupado. Inténtalo de nuevo."],
    ["upstream", 502, "No pude generar la voz. Inténtalo de nuevo."],
  ];
  const original = behavior;
  for (const [kind, status, error] of cases) {
    behavior = async () => {
      throw new SpeakError(kind);
    };
    const r = await get("hola");
    assert.equal(r.status, status, kind);
    assert.deepEqual(await r.json(), { error }, kind);
  }
  behavior = original;
});

test("401 con CHAT_TOKEN puesto y sin header", async () => {
  process.env.CHAT_TOKEN = "secreto";
  const r = await get("hola");
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "No autorizado." });
  assert.equal((await get("hola", { "x-chat-token": "secreto" })).status, 200);
});

test("la voz por defecto es jorge y voz=luisa se pasa al speaker", async () => {
  seenVoz = null;
  assert.equal((await get("hola")).status, 200);
  assert.equal(seenVoz, "jorge");
  assert.equal((await get("hola", {}, "luisa")).status, 200);
  assert.equal(seenVoz, "luisa");
});

test("400 con una voz que no existe y el speaker no se llama", async () => {
  seenVoz = null;
  for (const voz of ["george", "toString"]) {
    const r = await get("hola", {}, voz);
    assert.equal(r.status, 400, voz);
    assert.deepEqual(await r.json(), { error: "La voz no existe." }, voz);
  }
  assert.equal(seenVoz, null);
});
