import assert from 'node:assert/strict';
import { test } from 'node:test';

import { faseVoz, intensidadOyendo } from './fase';

test('el borde muestra esperando, oyendo y pensando según el estado de la escucha', () => {
  assert.equal(faseVoz('escuchando', false), 'escuchando');
  assert.equal(faseVoz('oyendo', false), 'oyendo');
  assert.equal(faseVoz('oyendo', true), 'oyendo'); // si habla de nuevo, manda su voz
  assert.equal(faseVoz('transcribiendo', false), 'pensando');
  assert.equal(faseVoz('escuchando', true), 'pensando'); // el asistente está armando la respuesta
});

test('con el micrófono silenciado no hay borde', () => {
  assert.equal(faseVoz('silenciado', false), 'ninguna');
  assert.equal(faseVoz('silenciado', true), 'ninguna');
});

test('la intensidad al oír sube con el nivel y nunca baja de un mínimo visible', () => {
  assert.equal(intensidadOyendo(0), 0.55);
  assert.equal(intensidadOyendo(1), 1);
  assert.equal(intensidadOyendo(5), 1);
  assert.equal(intensidadOyendo(-1), 0.55);
  assert.equal(intensidadOyendo(NaN), 0.55);
  assert.ok(intensidadOyendo(0.5) > intensidadOyendo(0.2));
});
