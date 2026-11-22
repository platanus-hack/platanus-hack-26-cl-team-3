import assert from 'node:assert/strict';
import { test } from 'node:test';

import { juntarPregunta } from './pregunta';

test('13: juntarPregunta une con un espacio, recorta y omite vacíos', () => {
  assert.equal(juntarPregunta('', 'hola'), 'hola');
  assert.equal(juntarPregunta('dónde está', 'el sapito'), 'dónde está el sapito');
  assert.equal(juntarPregunta('  dónde está  ', '  el sapito '), 'dónde está el sapito');
  assert.equal(juntarPregunta('hola', '   '), 'hola');
  assert.equal(juntarPregunta('', ''), '');
});
