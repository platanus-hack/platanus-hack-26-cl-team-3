import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FtsIndex, writeSqliteIndex } from "../../src/manual/fts";
import { MemoryIndex, type ManualFile } from "../../src/manual/search";
import { forgetManual, loadManual } from "../../src/manual/store";
import { tools } from "../../src/tools";

const file: ManualFile = {
  version: 1,
  source: { title: "Manual de prueba", edition: "prueba", url: "https://example.test", sha256: "0".repeat(64), thirdParty: true },
  pages: [
    { pdfPage: 10, label: "11-32", section: "Maintenance and service/Windshield washer fluid", text: "Windshield washer fluid CAUTION never use engine coolant as washer fluid. Fill the washer tank until the cap." },
    { pdfPage: 11, label: "11-11", section: "Maintenance and service/Engine oil", text: "Engine oil: pull out the level gauge, wipe it, insert it fully and read the oil level between the marks." },
    { pdfPage: 12, label: "11-12", section: "Maintenance and service/Engine oil", text: "Engine oil capacity: 2.5 L models 4.8 liters. 3.6 L models 6.5 liters." },
    { pdfPage: 13, label: "11-38", section: "Maintenance and service/Fuses", text: "Fuses protect the electrical circuits. The fuse box is in the engine compartment." },
    { pdfPage: 14, label: null, section: null, text: "Foreword. Congratulations on choosing a SUBARU vehicle and welcome to the manual." },
  ],
};

let path = "";
let fts: FtsIndex;
const memory = new MemoryIndex(file);
before(async () => {
  path = join(await mkdtemp(join(tmpdir(), "manual-fts-")), "outback.sqlite");
  writeSqliteIndex(path, file);
  fts = FtsIndex.open(path);
});
after(() => fts.close());

test("1: guarda el origen del manual y las páginas tal cual", () => {
  assert.deepEqual(fts.source, file.source);
  assert.deepEqual(fts.from("pdf:14")[0], file.pages[4]);
  assert.deepEqual(fts.from("11-32")[0], file.pages[0]);
});

test("2: la mejor página sale primero, en inglés y en español, igual que en memoria", () => {
  for (const [query, label] of [["windshield washer fluid", "11-32"], ["no sale agua del sapito", "11-32"], ["cómo reviso la varilla del aceite", "11-11"], ["caja de fusibles", "11-38"]]) {
    assert.equal(fts.search(query)[0].page.label, label, query);
    assert.equal(fts.search(query)[0].page.label, memory.search(query)[0].page.label, `${query} (memoria)`);
  }
});

test("3: reduce plurales y gerundios por su cuenta (porter) y no distingue tildes", () => {
  assert.equal(fts.search("fuses")[0].page.label, "11-38");
  assert.equal(fts.search("filling washer")[0].page.label, "11-32");
  assert.equal(fts.search("Engíne OÏL")[0]?.page.section, "Maintenance and service/Engine oil");
});

test("4: limit acota; sin términos o sin coincidencias no devuelve nada", () => {
  assert.equal(fts.search("engine oil", 1).length, 1);
  assert.deepEqual(fts.search("the of de la"), []);
  assert.deepEqual(fts.search("zzzzqqq"), []);
});

test("5: los caracteres de la sintaxis de FTS5 en la consulta no la rompen", () => {
  for (const query of ['oil" OR "x', "oil AND NOT (fuse)", "3.6 L*", "oil -fuse", "NEAR(oil gauge)", '"""', "a:b"]) {
    assert.doesNotThrow(() => fts.search(query), query);
  }
});

test("6: from() sigue con las páginas siguientes, por numeración o por hoja", () => {
  assert.deepEqual(fts.from("11-11", 2).map((p) => p.label), ["11-11", "11-12"]);
  assert.deepEqual(fts.from("11-38", 3).map((p) => p.label), ["11-38", null]);
  assert.deepEqual(fts.from("99-1"), []);
});

test("7: el .sqlite se abre solo de lectura y un archivo que no existe falla", () => {
  assert.throws(() => FtsIndex.open(join(tmpdir(), "no-existe-manual.sqlite")));
  const readOnly = FtsIndex.open(path);
  assert.throws(() => (readOnly as unknown as { db: { exec(sql: string): void } }).db.exec("DELETE FROM pages"));
  readOnly.close();
});

test("8: MANUAL_INDEX con extensión .sqlite hace que las herramientas usen FTS5", async () => {
  process.env.MANUAL_INDEX = path;
  forgetManual();
  try {
    assert.ok((await loadManual()) instanceof FtsIndex);
    const out = (await tools.buscar_manual.run({ query: "engine oil level gauge" })).content as any[];
    assert.equal(out[0].type, "search_result");
    assert.equal(out[0].source, "manual://subaru-outback-2016-us/11-11");
    const read = (await tools.leer_manual.run({ page: "11-11", count: 2 })).content as any[];
    assert.deepEqual(read.slice(0, -1).map((sr) => sr.source.split("/").pop()), ["11-11", "11-12"]);
  } finally {
    delete process.env.MANUAL_INDEX;
    forgetManual();
  }
});
