import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearCortador } from './frases';

test('5: entrega las frases completas en orden mientras el texto crece, sin repetir', () => {
  const c = crearCortador();
  assert.deepEqual(c.push('Abre el capó'), []);
  assert.deepEqual(c.push('Abre el capó y busca la varilla.'), []);
  assert.deepEqual(c.push('Abre el capó y busca la varilla. Límpiala con un'), ['Abre el capó y busca la varilla.']);
  assert.deepEqual(c.push('Abre el capó y busca la varilla. Límpiala con un trapo limpio! ¿Listo?\nSigue'), [
    'Límpiala con un trapo limpio!',
  ]);
  assert.deepEqual(c.push('Abre el capó y busca la varilla. Límpiala con un trapo limpio! ¿Listo?\nSigue'), []);
  assert.deepEqual(c.terminar(), ['¿Listo? Sigue']);
});

test('6: no corta en decimales, N.º ni marcas de lista; junta fragmentos de menos de 20 caracteres', () => {
  const c = crearCortador();
  assert.deepEqual(c.push('La presión es de 13.5 psi en la rueda delantera. '), ['La presión es de 13.5 psi en la rueda delantera.']);
  assert.deepEqual(c.push('La presión es de 13.5 psi en la rueda delantera. Mira el N.º 3 del diagrama con calma. '), [
    'Mira el N.º 3 del diagrama con calma.',
  ]);
  const l = crearCortador();
  assert.deepEqual(l.push('Haz lo siguiente:\n1. Apaga el motor por completo.\n2. Espera un minuto entero.\n'), [
    'Haz lo siguiente: 1. Apaga el motor por completo.',
    '2. Espera un minuto entero.',
  ]);
  const j = crearCortador();
  assert.deepEqual(j.push('Listo. Ahora abre el capó con cuidado. '), ['Listo. Ahora abre el capó con cuidado.']);
});

test('7: texto que no extiende al anterior reinicia; terminar entrega el resto y deja vacío', () => {
  const c = crearCortador();
  assert.deepEqual(c.push('Primera respuesta completa aquí. Y un resto'), ['Primera respuesta completa aquí.']);
  assert.deepEqual(c.push('Otra respuesta distinta por completo. Más'), ['Otra respuesta distinta por completo.']);
  assert.deepEqual(c.terminar(), ['Más']);
  assert.deepEqual(c.terminar(), []);
  assert.deepEqual(c.push('Otra respuesta distinta por completo. Más'), ['Otra respuesta distinta por completo.']);
});
