import assert from 'node:assert/strict';
import test from 'node:test';
import { findOutbackFuses, outbackFuses } from './outback-fuses';

test('distinguishes the numbered circuits in the two diagrams', () => {
  assert.deepEqual(findOutbackFuses('17').map(f => [f.box, f.label, f.amps]), [
    ['engine', 'O2 HTR', 25], ['cabin', 'MIR', 7.5],
  ]);
  assert.deepEqual(findOutbackFuses('Empty').map(f => f.number), [13, 25, 30, 36]);
  assert.equal(findOutbackFuses('F1', 'engine')[0].label, 'HORN RH');
  assert.deepEqual(findOutbackFuses('BLOWER').map(f => f.number), [32, 33]);
  assert.deepEqual(findOutbackFuses('fuse 94'), []);
  assert.deepEqual(findOutbackFuses('xinventado'), []);
});

test('returns supported window circuits without selecting an arbitrary member of a pair', () => {
  const numbers = (query: string) => findOutbackFuses(query).map(f => f.number);
  assert.deepEqual(numbers('Quiero cambiar el fusible de la ventana, ¿cuál es?'), [6, 11, 16, 21, 24, 29]);
  assert.deepEqual(numbers('ventana izquierda'), [6, 11, 21, 24, 29]);
  assert.deepEqual(numbers('ventana derecha'), [11, 16, 21, 24, 29]);
  assert.deepEqual(numbers('ventanas traseras'), [6, 16]);
  assert.deepEqual(numbers('ventana delantera izquierda'), [11, 21, 24, 29]);
  assert.deepEqual(numbers('vidrio trasero izquierdo'), [6]);
  assert.deepEqual(numbers('elevalunas trasero derecho'), [16]);
  assert.deepEqual(numbers('ventanilla del conductor'), [11, 24]);
  assert.deepEqual(numbers('ventana del copiloto'), [21, 29]);
  assert.deepEqual(numbers('P/W MAIN2'), [24]);
  assert.deepEqual(numbers('desempañador de ventana trasera'), [31]);
  assert.deepEqual(numbers('limpiaparabrisas de la ventana trasera'), [36]);
  assert.deepEqual(numbers('ventana del techo'), [35]);
  assert.deepEqual(findOutbackFuses('ventana', 'engine'), []);
});

test('each diagram assigns a distinct contained hit area to all 38 numbered positions', () => {
  for (const box of ['engine', 'cabin'] as const) {
    const slots = outbackFuses.filter(f => f.box === box);
    assert.deepEqual(slots.filter(f => typeof f.number === 'number').map(f => f.number), Array.from({ length: 38 }, (_, i) => i + 1));
    for (const fuse of slots) {
      assert.ok(fuse.x >= 0 && fuse.y >= 0 && fuse.width > 0 && fuse.height > 0);
      assert.ok(fuse.x + fuse.width <= 1 && fuse.y + fuse.height <= 1);
      for (const other of slots.slice(slots.indexOf(fuse) + 1)) {
        assert.ok(fuse.x + fuse.width <= other.x || other.x + other.width <= fuse.x ||
          fuse.y + fuse.height <= other.y || other.y + other.height <= fuse.y);
      }
    }
  }
});
