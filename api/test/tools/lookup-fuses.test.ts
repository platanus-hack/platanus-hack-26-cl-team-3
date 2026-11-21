import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../../src/tools";

const { run } = tools.lookup_fuses;

test("1: filter p/w returns a search_result with 6 citable blocks with part_id", async () => {
  const { content, is_error } = await run({ filter: "p/w" });
  assert.notEqual(is_error, true);
  assert.equal(content.length, 1);
  const [sr] = content as any[];
  assert.equal(sr.type, "search_result");
  assert.equal(sr.source, "fusibles://outback-2016-3.6r/cabina");
  assert.match(sr.title, /tercero/i);
  assert.equal(sr.citations.enabled, true);
  assert.equal(sr.content.length, 6);
  for (const b of sr.content) {
    assert.equal(b.type, "text");
    assert.match(b.text, /part_id: fusible-cabina-\d+$/);
  }
  assert.equal(
    sr.content.find((b: { text: string }) => b.text.startsWith("Fusible 11 ")).text,
    "Fusible 11 — 30 A — P/W MAIN1 — caja de la cabina. part_id: fusible-cabina-11",
  );
});

test("2: filter radio returns the 'Sin resultados' text block", async () => {
  const { content } = await run({ filter: "radio" });
  assert.deepEqual(content, [{ type: "text", text: "Sin resultados en la tabla de fusibles." }]);
});

test("invalid input returns is_error", async () => {
  const r = await run({ filter: 5 });
  assert.equal(r.is_error, true);
  assert.equal((r.content as { type: string }[])[0].type, "text");
});

test("filter by fuse number", async () => {
  const { content } = await run({ filter: "24" });
  const [sr] = content as any[];
  assert.equal(sr.content.length, 1);
  assert.match(sr.content[0].text, /^Fusible 24 /);
});
