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
  assert.match(sr.title, /Outback 2016 para Norteamérica/);
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
  assert.match(sr.title, /PDF 530$/);
});

test("a numeric filter compares the exact fuse number", async () => {
  const one = await run({ filter: "1" });
  assert.deepEqual(one.content, [{ type: "text", text: "Sin resultados en la tabla de fusibles." }]);
  const eleven = (await run({ filter: "11" })).content as any[];
  assert.equal(eleven[0].content.length, 1);
  assert.match(eleven[0].content[0].text, /^Fusible 11 /);
  assert.match(eleven[0].title, /PDF 529$/);
});

test("the title names the data source", async () => {
  const [sr] = (await run({ filter: "p/w" })).content as any[];
  assert.match(sr.title, /MSA5M1603C\), PDF 529 y 530$/);
});

test("the description explains the manual abbreviations", () => {
  const d = tools.lookup_fuses.definition.description!;
  for (const s of ["P/W", "alzavidrios", "R.LH", "R.RH", "PASS", "MAIN"]) assert.ok(d.includes(s), s);
});
