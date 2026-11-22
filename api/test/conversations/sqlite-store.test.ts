import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqliteStore } from "../../src/conversations/sqlite-store";

const data = (title: string) => ({ title, messages: [{ role: "user" as const, content: title }] });

test("los datos sobreviven a cerrar y reabrir", async () => {
  const dir = mkdtempSync(join(tmpdir(), "historial-"));
  try {
    const path = join(dir, "h.sqlite");
    const a = sqliteStore(path);
    const dev = await a.createDevice();
    const id = await a.create(dev, data("hola"));
    assert.ok(id);
    const conv = await sqliteStore(path).get(dev, id);
    assert.equal(conv?.title, "hola");
    assert.deepEqual(conv?.messages, data("hola").messages);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create con device desconocido devuelve null", async () => {
  assert.equal(await sqliteStore(":memory:").create("nope", data("x")), null);
});

test("update de la conversación de otro device devuelve false y no la cambia", async () => {
  const s = sqliteStore(":memory:");
  const a = await s.createDevice();
  const b = await s.createDevice();
  const id = (await s.create(a, data("original")))!;
  assert.equal(await s.update(b, id, data("hack")), false);
  assert.equal((await s.get(a, id))?.title, "original");
});
