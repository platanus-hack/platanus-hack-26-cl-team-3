import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../../src/tools";

const { run } = tools.lookup_fuses;
const NONE = "Sin resultados en la tabla de fusibles. Prueba con filter \"*\" para ver la caja completa.";

test("1: filter p/w returns one cabina search_result, location first, then 6 citable rows", async () => {
  const { content, is_error } = await run({ filter: "p/w" });
  assert.notEqual(is_error, true);
  assert.equal(content.length, 1);
  const [sr] = content as any[];
  assert.equal(sr.type, "search_result");
  assert.equal(sr.source, "fusibles://outback-2016-3.6r/cabina");
  assert.match(sr.title, /Outback 2016 para Norteamérica/);
  assert.equal(sr.citations.enabled, true);
  assert.equal(sr.content.length, 7);
  assert.match(sr.content[0].text, /bajo el tablero/);
  for (const b of sr.content.slice(1)) {
    assert.equal(b.type, "text");
    assert.match(b.text, /part_id: fusible-cabina-\d+$/);
  }
  assert.equal(
    sr.content.find((b: { text: string }) => b.text.startsWith("Fusible 11 ")).text,
    "Fusible 11 — 30 A — P/W MAIN1: Circuito principal 1 de alzavidrios, sin puerta asignada en el manual — caja de la cabina. part_id: fusible-cabina-11",
  );
});

test("2: filter radio returns the 'Sin resultados' text block", async () => {
  const { content } = await run({ filter: "radio" });
  assert.deepEqual(content, [{ type: "text", text: NONE }]);
});

test("invalid input returns is_error", async () => {
  const r = await run({ filter: 5 });
  assert.equal(r.is_error, true);
  assert.equal((r.content as { type: string }[])[0].type, "text");
});

test("invalid box returns is_error", async () => {
  const r = await run({ filter: "wash", box: "baul" });
  assert.equal(r.is_error, true);
});

test("filter by fuse number and box", async () => {
  const { content } = await run({ filter: "24", box: "cabina" });
  const [sr] = content as any[];
  assert.equal(sr.content.length, 2);
  assert.match(sr.content[1].text, /^Fusible 24 /);
  assert.match(sr.title, /PDF 530$/);
});

test("a number without box returns one block per box, cabina first", async () => {
  const { content } = await run({ filter: "17" });
  const blocks = content as any[];
  assert.deepEqual(
    blocks.map((b) => b.source),
    ["fusibles://outback-2016-3.6r/cabina", "fusibles://outback-2016-3.6r/motor"],
  );
  assert.match(blocks[0].content[1].text, /^Fusible 17 — 7.5 A — MIR/);
  assert.match(blocks[1].content[1].text, /^Fusible 17 — 25 A — O2 HTR.*2\.5 L.*20 A/);
  assert.match(blocks[1].title, /PDF 531$/);
});

test("a numeric filter compares the exact fuse number", async () => {
  const eleven = (await run({ filter: "11", box: "cabina" })).content as any[];
  assert.equal(eleven[0].content.length, 2);
  assert.match(eleven[0].content[1].text, /^Fusible 11 /);
  assert.match(eleven[0].title, /PDF 529$/);
  const one = (await run({ filter: "1", box: "cabina" })).content as any[];
  assert.equal(one[0].content.length, 2);
  assert.match(one[0].content[1].text, /^Fusible 1 /);
});

test("a numeric filter includes empty positions", async () => {
  const [sr] = (await run({ filter: "13", box: "cabina" })).content as any[];
  assert.match(sr.content[1].text, /^Posición 13 — vacía según el manual — caja de la cabina\. part_id: fusible-cabina-13$/);
});

test("the sapito is the engine-box F.WASH", async () => {
  for (const filter of ["wash", "sapito"]) {
    const { content } = await run({ filter });
    const blocks = content as any[];
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].source, "fusibles://outback-2016-3.6r/motor");
    assert.match(blocks[0].content[1].text, /part_id: fusible-motor-37$/);
    assert.match(blocks[0].title, /PDF 532$/);
  }
});

test("description search ignores accents and empty positions", async () => {
  const [sr] = (await run({ filter: "ILUMINACION" })).content as any[];
  assert.match(sr.content[1].text, /^Fusible 3 /);
  const vacia = await run({ filter: "vacia" });
  assert.deepEqual(vacia.content, [{ type: "text", text: NONE }]);
});

test("* with box motor returns the 38 positions minus the empty ones, location first", async () => {
  const { content } = await run({ filter: "*", box: "motor" });
  const blocks = content as any[];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].content.length, 1 + 38);
  assert.match(blocks[0].title, /PDF 531 y 532$/);
  assert.match(blocks[0].content[0].text, /vano del motor/);
  const cabina = (await run({ filter: "*", box: "cabina" })).content as any[];
  assert.equal(cabina[0].content.length, 1 + 38 - 4);
});

test("the location text carries no fuse-number patterns the app parses", async () => {
  for (const b of (await run({ filter: "*" })).content as any[]) {
    assert.doesNotMatch(b.content[0].text, /fusible[\s-]*(cabina-|motor-)?\d/i);
  }
});

test("the title names the data source", async () => {
  const [sr] = (await run({ filter: "p/w" })).content as any[];
  assert.match(sr.title, /MSA5M1603C\), PDF 529 y 530$/);
});

test("the description explains boxes and the manual abbreviations", () => {
  const d = tools.lookup_fuses.definition.description!;
  for (const s of ["cabina", "motor", "sapito", "R.LH", "R.RH", "PASS", "MAIN", "box"]) assert.ok(d.includes(s), s);
});
