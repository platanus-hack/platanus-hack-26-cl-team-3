import { test } from "node:test";
import assert from "node:assert/strict";
import { expandQuery, ManualIndex, tokenize, type ManualFile } from "../../src/manual/search";

const source = { title: "Manual de prueba", edition: "prueba", url: "https://example.test", sha256: "0".repeat(64), thirdParty: true };
const pages = [
  { pdfPage: 10, label: "11-32", section: "Maintenance and service/Windshield washer fluid", text: "Windshield washer fluid CAUTION never use engine coolant as washer fluid. Fill the washer tank until the cap." },
  { pdfPage: 11, label: "11-11", section: "Maintenance and service/Engine oil", text: "Engine oil: pull out the level gauge, wipe it, insert it fully and read the oil level between the marks." },
  { pdfPage: 12, label: "11-12", section: "Maintenance and service/Engine oil", text: "Engine oil capacity: 2.5 L models 4.8 liters. 3.6 L models 6.5 liters." },
  { pdfPage: 13, label: "11-38", section: "Maintenance and service/Fuses", text: "Fuses protect the electrical circuits. The fuse box is in the engine compartment." },
  { pdfPage: 14, label: null, section: null, text: "Foreword. Congratulations on choosing a SUBARU vehicle and welcome to the manual." },
];
const index = new ManualIndex({ version: 1, source, pages } satisfies ManualFile);

test("1: tokeniza sin tildes ni palabras vacías y junta singular con plural", () => {
  assert.deepEqual(tokenize("Where are the Tires? ¡Neumáticos!"), ["tire", "neumatico"]);
  assert.deepEqual(tokenize("Replacing bulbs; replaced bulb"), ["replac", "bulb", "replac", "bulb"]);
});

test("2: las palabras del auto en español se traducen a los términos del manual", () => {
  assert.ok(expandQuery("el sapito no echa agua").includes("windshield"));
  assert.ok(expandQuery("varilla").includes("gauge"));
  assert.ok(expandQuery("Batería").includes("battery"));
  assert.deepEqual(expandQuery("windshield"), ["windshield"]);
});

test("3: la mejor página sale primero, en inglés y en español", () => {
  assert.equal(index.search("windshield washer fluid")[0].page.label, "11-32");
  assert.equal(index.search("no sale agua del sapito")[0].page.label, "11-32");
  assert.equal(index.search("cómo reviso la varilla del aceite")[0].page.label, "11-11");
  assert.equal(index.search("caja de fusibles")[0].page.label, "11-38");
});

test("4: el título de la sección pesa más que el cuerpo", () => {
  const found = index.search("engine oil");
  assert.deepEqual(found.slice(0, 2).map((h) => h.page.label).sort(), ["11-11", "11-12"]);
});

test("5: limit acota, una consulta sin términos o sin coincidencias no devuelve nada", () => {
  assert.equal(index.search("engine oil", 1).length, 1);
  assert.deepEqual(index.search("the of de la"), []);
  assert.deepEqual(index.search("zzzzqqq"), []);
});

test("6: from() ubica por numeración impresa o por hoja del PDF y sigue con las páginas siguientes", () => {
  assert.deepEqual(index.from("11-11", 2).map((p) => p.label), ["11-11", "11-12"]);
  assert.deepEqual(index.from("pdf:14").map((p) => p.pdfPage), [14]);
  assert.deepEqual(index.from("99-1"), []);
  assert.deepEqual(index.from("11-38", 3).map((p) => p.label), ["11-38", null]);
});
