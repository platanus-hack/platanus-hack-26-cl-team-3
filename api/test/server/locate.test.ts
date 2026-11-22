import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../../src/server/server";
import { normalizePoints, validateLocate } from "../../src/locate/contract";
import type { LocateInput, Locator, RawPoint } from "../../src/locate/contract";
import { ProviderError } from "../../src/llm/errors";

let raw: RawPoint[] = [];
let mode: "ok" | "fail" | "credit" = "ok";
let seen: LocateInput | undefined;
const locator: Locator = async (input) => {
  seen = input;
  if (mode === "fail") throw new Error("boom");
  if (mode === "credit") throw new ProviderError("sin crédito", "credit");
  return raw;
};

let server: Server;
let base: string;
before(async () => {
  server = createServer({ locator });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});

const post = (body: unknown, headers: Record<string, string> = {}, rawBody?: string) =>
  fetch(`${base}/api/locate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });

const valid = { image: "AAAA", width: 1000, height: 500 };

test("200: normaliza y descarta no visibles, fuera de rango y repetidos", async () => {
  mode = "ok";
  raw = [
    { part: "washer", visible: true, x: 500, y: 250 },
    { part: "dipstick", visible: false, x: 0, y: 0 },
    { part: "oil_cap", visible: true, x: 1200, y: 10 },
    { part: "brake_cap", visible: true, x: 10, y: 10 },
    { part: "brake_cap", visible: true, x: 20, y: 20 },
    { part: "radiator_cap", visible: true, x: Number.NaN, y: 5 },
    { part: "positive", visible: true, x: 100, y: 50 },
  ];
  const r = await post(valid);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    points: [
      { part: "washer", x: 0.5, y: 0.5 },
      { part: "positive", x: 0.1, y: 0.1 },
    ],
  });
  assert.deepEqual(seen?.parts, ["washer", "dipstick", "oil_cap", "brake_cap", "radiator_cap", "positive"]);
});

test("200: parts explícito llega al localizador", async () => {
  raw = [];
  const r = await post({ ...valid, parts: ["washer", "dipstick"] });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { points: [] });
  assert.deepEqual(seen?.parts, ["washer", "dipstick"]);
});

test("400: parts desconocido, vacío o repetido", async () => {
  assert.equal((await post({ ...valid, parts: ["washer", "nope"] })).status, 400);
  assert.equal((await post({ ...valid, parts: [] })).status, 400);
  assert.equal((await post({ ...valid, parts: ["washer", "washer"] })).status, 400);
});

test("400: width inválido, image vacía y JSON inválido", async () => {
  assert.equal((await post({ ...valid, width: 10 })).status, 400);
  assert.equal((await post({ ...valid, width: 100.5 })).status, 400);
  assert.equal((await post({ ...valid, height: 5000 })).status, 400);
  assert.equal((await post({ ...valid, image: "" })).status, 400);
  const r = await post(null, {}, "{no json");
  assert.equal(r.status, 400);
  assert.equal(typeof ((await r.json()) as { error: unknown }).error, "string");
});

test("401 con CHAT_TOKEN", async () => {
  process.env.CHAT_TOKEN = "secreto";
  try {
    assert.equal((await post(valid)).status, 401);
    assert.equal((await post(valid, { "x-chat-token": "otro" })).status, 401);
    raw = [];
    assert.equal((await post(valid, { "x-chat-token": "secreto" })).status, 200);
  } finally {
    delete process.env.CHAT_TOKEN;
  }
});

test("413 con cuerpo mayor a 1 MB", async () => {
  const r = await post({ ...valid, image: "A".repeat(1024 * 1024 + 10) });
  assert.equal(r.status, 413);
});

test("502 cuando el localizador lanza; 402 sin crédito", async () => {
  mode = "fail";
  const r = await post(valid);
  assert.equal(r.status, 502);
  assert.equal(typeof ((await r.json()) as { error: unknown }).error, "string");
  mode = "credit";
  assert.equal((await post(valid)).status, 402);
  mode = "ok";
});

test("500 sin localizador ni ANTHROPIC_API_KEY", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const bare = createServer();
  await new Promise<void>((r) => bare.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${(bare.address() as AddressInfo).port}/api/locate`, {
      method: "POST",
      body: JSON.stringify(valid),
    });
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "Falta ANTHROPIC_API_KEY" });
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    await new Promise((r) => bare.close(r));
  }
});

test("normalizePoints: función pura", () => {
  const out = normalizePoints(
    [
      { part: "washer", visible: true, x: 64, y: 32 },
      { part: "washer", visible: false, x: 0, y: 0 },
      { part: "dipstick", visible: true, x: 128, y: 64 },
      { part: "oil_cap", visible: true, x: -1, y: 5 },
      { part: "zzz", visible: true, x: 1, y: 1 },
    ],
    128,
    64,
  );
  assert.deepEqual(out, [{ part: "dipstick", x: 1, y: 1 }]);
});

test("validateLocate: valores por defecto", () => {
  const v = validateLocate(valid);
  assert.equal(v.error, undefined);
  assert.equal(v.input?.parts.length, 6);
});
