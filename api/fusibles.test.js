import { test } from "node:test";
import assert from "node:assert/strict";
import { herramientas } from "./herramientas.js";

const { ejecutar } = herramientas.consultar_fusibles;

test("1: filtro p/w devuelve un search_result con 6 bloques citables con pieza_id", async () => {
  const { content, is_error } = await ejecutar({ filtro: "p/w" });
  assert.notEqual(is_error, true);
  assert.equal(content.length, 1);
  const [sr] = content;
  assert.equal(sr.type, "search_result");
  assert.equal(sr.source, "fusibles://outback-2016-3.6r/cabina");
  assert.match(sr.title, /tercero/i);
  assert.equal(sr.citations.enabled, true);
  assert.equal(sr.content.length, 6);
  for (const b of sr.content) {
    assert.equal(b.type, "text");
    assert.match(b.text, /pieza_id: fusible-cabina-\d+$/);
  }
  assert.equal(
    sr.content.find((b) => b.text.startsWith("Fusible 11 ")).text,
    "Fusible 11 — 30 A — P/W MAIN1 — caja de la cabina. pieza_id: fusible-cabina-11",
  );
});

test("2: filtro radio devuelve el bloque de texto 'Sin resultados'", async () => {
  const { content } = await ejecutar({ filtro: "radio" });
  assert.deepEqual(content, [{ type: "text", text: "Sin resultados en la tabla de fusibles." }]);
});

test("input inválido devuelve is_error", async () => {
  const r = await ejecutar({ filtro: 5 });
  assert.equal(r.is_error, true);
  assert.equal(r.content[0].type, "text");
});

test("filtro por número de fusible", async () => {
  const { content } = await ejecutar({ filtro: "24" });
  assert.equal(content[0].content.length, 1);
  assert.match(content[0].content[0].text, /^Fusible 24 /);
});
