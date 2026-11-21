import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CAPTION_CHARS, captionChunks, READ_BASE_MS, READ_PER_WORD_MS, readingMs, sourceLabel } from './captions';

const washer =
  'Partamos por lo más simple: revisa si queda líquido. Busca la tapa amarilla del depósito de limpiaparabrisas, junto a la batería.';

test('short text stays in one chunk', () => {
  assert.deepEqual(captionChunks('Busca la tapa amarilla.'), ['Busca la tapa amarilla.']);
  assert.deepEqual(captionChunks('   '), []);
});

test('cuts at the last period, comma or colon that fits', () => {
  assert.deepEqual(captionChunks(washer), [
    'Partamos por lo más simple: revisa si queda líquido.',
    'Busca la tapa amarilla del depósito de limpiaparabrisas,',
    'junto a la batería.',
  ]);
});

test('no chunk exceeds the limit and no word is lost', () => {
  const text = `${washer} ${washer} Luego consulta el plano de la caja y coteja su etiqueta con la del vehículo antes de tocar cualquier fusible del motor.`;
  const chunks = captionChunks(text);
  for (const chunk of chunks) assert.ok(chunk.length <= CAPTION_CHARS, chunk);
  assert.equal(chunks.join(' '), text);
});

test('without punctuation it cuts by words', () => {
  const chunks = captionChunks('uno dos tres cuatro cinco seis siete ocho', 14);
  assert.deepEqual(chunks, ['uno dos tres', 'cuatro cinco', 'seis siete', 'ocho']);
});

test('ignores punctuation too early in the chunk', () => {
  assert.deepEqual(captionChunks('Ya, ahora abre la tapa del depósito', 20), ['Ya, ahora abre la', 'tapa del depósito']);
});

test('line breaks start a new chunk and list numbers are not cut points', () => {
  assert.deepEqual(captionChunks('1. Apaga el contacto.\n\n2. Abre el capó.'), ['1. Apaga el contacto.', '2. Abre el capó.']);
  const inline = captionChunks('Revisa el nivel del depósito 2. Abre la tapa amarilla y rellena hasta la marca.', 40);
  for (const chunk of inline) assert.ok(!/\s\d+\.$/.test(chunk), chunk);
});

test('a word longer than the limit goes alone', () => {
  const long = 'x'.repeat(CAPTION_CHARS + 5);
  assert.deepEqual(captionChunks(`${long} fin`), [long, 'fin']);
});

test('while text streams in, only the last chunk changes', () => {
  const full = captionChunks(washer);
  for (let n = 1; n <= washer.length; n++) {
    const partial = captionChunks(washer.slice(0, n));
    assert.deepEqual(partial.slice(0, -1), full.slice(0, partial.length - 1), washer.slice(0, n));
  }
});

test('reading time grows with the words', () => {
  assert.equal(readingMs('Busca la tapa'), READ_BASE_MS + 3 * READ_PER_WORD_MS);
  assert.ok(readingMs(captionChunks(washer)[0]) > readingMs('Listo.'));
});

test('source label keeps the document name', () => {
  assert.equal(sourceLabel('Piezas del vano del motor — Outback 2016 3.6R (fuente: ficha)'), 'Piezas del vano del motor');
  assert.equal(sourceLabel('Tabla de fusibles — caja de la cabina (fuente: x)'), 'Tabla de fusibles');
  assert.equal(sourceLabel('Manual'), 'Manual');
});
