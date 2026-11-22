import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/db/sqlite";
import { sqliteRunLog } from "../../src/runlog/sqlite-runlog";
import { sqliteStore } from "../../src/conversations/sqlite-store";

const data = (title: string) => ({ title, messages: [{ role: "user" as const, content: title }], vehicle_id: null });

test("los datos sobreviven a cerrar y reabrir", async () => {
  const dir = mkdtempSync(join(tmpdir(), "historial-"));
  try {
    const path = join(dir, "h.sqlite");
    const a = sqliteStore(openDatabase(path));
    const dev = await a.createDevice();
    const id = await a.create(dev, data("hola"));
    assert.ok(id);
    const conv = await sqliteStore(openDatabase(path)).get(dev, id);
    assert.equal(conv?.title, "hola");
    assert.deepEqual(conv?.messages, data("hola").messages);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create con device desconocido devuelve null", async () => {
  assert.equal(await sqliteStore(openDatabase(":memory:")).create("nope", data("x")), null);
});

test("update de la conversación de otro device devuelve false y no la cambia", async () => {
  const s = sqliteStore(openDatabase(":memory:"));
  const a = await s.createDevice();
  const b = await s.createDevice();
  const id = (await s.create(a, data("original")))!;
  assert.equal(await s.update(b, id, data("hack")), false);
  assert.equal((await s.get(a, id))?.title, "original");
});

test("upgrading a pre-vehicle database keeps conversation identity, timestamps and messages", async () => {
  const db = openDatabase(":memory:");
  db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, device_id TEXT, title TEXT, messages TEXT, created_at TEXT, updated_at TEXT)");
  db.prepare("INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?)").run("old", "device", "Original", JSON.stringify(data("hello").messages), "then", "later");
  sqliteRunLog(db);
  db.exec("ALTER TABLE turns DROP COLUMN vehicle_id");
  db.exec("INSERT INTO turns (id, conversation_id, created_at, model, prompt_version, context_messages, outcome, rounds, duration_ms) VALUES ('turn', 'old', 'then', 'old-model', 'v1', 2, 'done', 1, 80)");
  const store = sqliteStore(db);
  sqliteRunLog(db);
  const turn = db.prepare("SELECT * FROM turns WHERE id = 'turn'").get();
  assert.equal(turn?.conversation_id, "old");
  assert.equal(turn?.vehicle_id, null);
  assert.deepEqual(await store.get("device", "old"), {
    id: "old", title: "Original", updated_at: "later", messages: data("hello").messages, vehicle_id: null,
  });
  assert.equal(store.complete("device", "old", 1, { ...data("Original"), messages: [...data("hello").messages, ...data("next").messages] }), "old");
  assert.equal((await store.get("device", "old"))?.messages.length, 2);
  db.close();
});
