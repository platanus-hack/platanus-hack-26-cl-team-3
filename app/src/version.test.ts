// npx tsx --test src/version.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { describeBuild } from './version';

test('1: junta versión, compilación, commit corto y rama', () => {
  assert.equal(
    describeBuild({ version: '0.8.0', build: 1000086, sha: '3eda3d6976d12f86cbd6091ed6b0436c54e0dbda', branch: 'dev' }),
    'Versión 0.8.0 · compilación 1000086 · 3eda3d6 · dev',
  );
});

test('2: lo que falta se omite, sin dejar separadores sueltos', () => {
  assert.equal(describeBuild({ version: '0.8.0', build: 130 }), 'Versión 0.8.0 · compilación 130');
  assert.equal(describeBuild({ sha: 'abcdef1234', branch: 'main' }), 'abcdef1 · main');
  assert.equal(describeBuild({}), '');
});

test('3: los textos vacíos o con espacios cuentan como ausentes', () => {
  assert.equal(describeBuild({ version: ' ', build: '', sha: '  ', branch: '' }), '');
  assert.equal(describeBuild({ version: '1.0.0', sha: ' 1234567890 ' }), 'Versión 1.0.0 · 1234567');
});

test('4: la referencia de una PR se muestra como «PR n» y las ramas con barra se dejan tal cual', () => {
  assert.equal(describeBuild({ branch: '35/merge' }), 'PR 35');
  assert.equal(describeBuild({ branch: 'feat/hud-piezas' }), 'feat/hud-piezas');
});

test('5: el número de compilación 0 sí se muestra', () => {
  assert.equal(describeBuild({ build: 0 }), 'compilación 0');
});
