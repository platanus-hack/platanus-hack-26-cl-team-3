import { test } from "node:test";
import assert from "node:assert/strict";
import { fixDegrees, parsePages } from "../../src/manual/pages";

const JUNK = 'Black plate (491,1)\n';
const FOOT = '\n– CONTINUED –\n\n北米Model "A2520BE-C" EDITED: 2015/ 10/ 5\n11\n';

// Una hoja por elemento; pdftotext las separa con \f.
const book = (pages: string[]) => pages.join("\f");

test("1: la numeración y la sección salen del encabezado, con la etiqueta a la izquierda, a la derecha o con un espacio", () => {
  const layout = book([
    `${JUNK}                 Maintenance and service/Engine compartment overview         11-9\n  text`,
    `${JUNK}7-54       Starting and operating/BSD/RCTA\n  text`,
    `${JUNK}11-10 Maintenance and service/Engine compartment overview\n  text`,
  ]);
  const body = "Texto de la página con bastante contenido para pasar el mínimo de largo. ".repeat(2);
  const reading = book([JUNK + body, JUNK + body, JUNK + body]);
  const pages = parsePages(reading, layout);
  assert.deepEqual(pages.map((p) => [p.pdfPage, p.label, p.section]), [
    [1, "11-9", "Maintenance and service/Engine compartment overview"],
    [2, "7-54", "Starting and operating/BSD/RCTA"],
    [3, "11-10", "Maintenance and service/Engine compartment overview"],
  ]);
});

test("2: el encabezado no se repite en el texto, junto o en líneas sueltas, y se quita la basura de imprenta", () => {
  const layout = book([`${JUNK}Maintenance and service/Engine oil 11-11\n`, `${JUNK}Maintenance and service/Fuses 11-38\n`]);
  const cuerpo = "Engine oil CAUTION: use only the recommended grade and viscosity of engine oil.";
  const reading = book([
    `${JUNK}Maintenance and service/Engine oil 11-11\n\n${cuerpo}${FOOT}`,
    `${JUNK}Maintenance and service/Fuses\n\n11-38\n\n${cuerpo}${FOOT}`,
  ]);
  const [one, two] = parsePages(reading, layout);
  assert.equal(one.text, cuerpo);
  assert.equal(two.text, cuerpo);
});

test("3: los renglones de un bloque se unen y un renglón vacío separa bloques", () => {
  const reading = `${JUNK}1) Brake fluid reservoir\n(page 11-19)\n2) Fuse box (page 11-38)\n\nSegundo bloque con bastante texto para que la página cuente.\n`;
  const [page] = parsePages(reading, "");
  assert.equal(page.label, null);
  assert.equal(page.text, "1) Brake fluid reservoir (page 11-19) 2) Fuse box (page 11-38)\n\nSegundo bloque con bastante texto para que la página cuente.");
});

test("4: las hojas casi vacías se descartan sin correr la numeración de las demás", () => {
  const larga = "Contenido suficiente para ser una página del manual de verdad, con varias palabras.";
  const pages = parsePages(book([`${JUNK}\n`, `${JUNK}${larga}`, "", `${JUNK}${larga}`]), "");
  assert.deepEqual(pages.map((p) => p.pdfPage), [2, 4]);
});

test("5: el símbolo de grado, que el PDF entrega como un 8, vuelve a ser un grado solo junto a F o C", () => {
  assert.equal(fixDegrees("10.48F (−128C)"), "10.4 °F (−12 °C)");
  assert.equal(fixDegrees("from −228F to 1228F"), "from −22 °F to 122 °F");
  assert.equal(fixDegrees("model 3.6 L, 68 Fahrenheit and 8C"), "model 3.6 L, 68 Fahrenheit and 8C");
  assert.equal(fixDegrees("part A8C and 88 kPa"), "part A8C and 88 kPa");
});
