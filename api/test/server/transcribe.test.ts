import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../../src/server/server";
import { elevenlabsTranscriber } from "../../src/transcribe/elevenlabs";
import { TranscribeError } from "../../src/transcribe/errors";
import type { TranscribeErrorKind } from "../../src/transcribe/errors";
import { KEYTERMS } from "../../src/transcribe/keyterms";
import type { Transcriber } from "../../src/transcribe/handler";

let server: Server;
let base: string;
let seen: { audio: Buffer; contentType: string } | null = null;
let behavior: Transcriber = async (audio, contentType) => {
  seen = { audio, contentType };
  return "dónde está el sapito";
};

before(async () => {
  server = createServer({ transcriber: (a, c) => behavior(a, c) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});
afterEach(() => {
  delete process.env.CHAT_TOKEN;
});

const post = (body: Uint8Array | undefined, headers: Record<string, string> = { "content-type": "audio/mp4" }) =>
  fetch(`${base}/api/transcribe`, { method: "POST", headers, body: body as BodyInit | undefined });

test("401 con CHAT_TOKEN puesto y sin header", async () => {
  process.env.CHAT_TOKEN = "secreto";
  const r = await post(new Uint8Array([1, 2, 3]));
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "No autorizado." });
  const ok = await post(new Uint8Array([1]), { "content-type": "audio/mp4", "x-chat-token": "secreto" });
  assert.equal(ok.status, 200);
});

test("400 sin content-type de audio", async () => {
  const r = await post(new Uint8Array([1, 2, 3]), { "content-type": "application/json" });
  assert.equal(r.status, 400);
});

test("400 con cuerpo vacío", async () => {
  const r = await post(new Uint8Array(0));
  assert.equal(r.status, 400);
});

test("413 sobre 2 MB", async () => {
  const r = await post(new Uint8Array(2 * 1024 * 1024 + 1));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { error: "El audio es muy largo." });
});

test("200 con texto; el transcriber recibe bytes y content-type intactos", async () => {
  const bytes = new Uint8Array([0, 255, 10, 13, 128, 7]);
  const r = await post(bytes, { "content-type": "audio/mp4" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: "dónde está el sapito" });
  assert.deepEqual([...seen!.audio], [...bytes]);
  assert.equal(seen!.contentType, "audio/mp4");
});

test("mapeo de errores del transcriber", async () => {
  const cases: [TranscribeErrorKind, number, string][] = [
    ["config", 500, "Falta ELEVENLABS_API_KEY en el servidor."],
    ["auth", 500, "La key de ElevenLabs no es válida o no tiene permiso de Speech to Text."],
    ["busy", 503, "El servicio de voz está ocupado. Inténtalo de nuevo."],
    ["upstream", 502, "No pude transcribir el audio. Inténtalo de nuevo."],
  ];
  const original = behavior;
  for (const [kind, status, error] of cases) {
    behavior = async () => {
      throw new TranscribeError(kind);
    };
    const r = await post(new Uint8Array([1]));
    assert.equal(r.status, status, kind);
    assert.deepEqual(await r.json(), { error }, kind);
  }
  behavior = original;
});

test("elevenlabs sin ELEVENLABS_API_KEY lanza TranscribeError config (sin red)", async () => {
  const saved = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    await assert.rejects(elevenlabsTranscriber(Buffer.from([1]), "audio/mp4"), (e) => e instanceof TranscribeError && e.kind === "config");
  } finally {
    if (saved !== undefined) process.env.ELEVENLABS_API_KEY = saved;
  }
});

test("keyterms: menos de 100, sin duplicados y dentro de los límites", () => {
  assert.ok(KEYTERMS.length > 14 && KEYTERMS.length < 100);
  assert.equal(new Set(KEYTERMS).size, KEYTERMS.length);
  assert.ok(KEYTERMS.every((t) => t.length <= 50 && t.split(/\s+/).length <= 5));
});
