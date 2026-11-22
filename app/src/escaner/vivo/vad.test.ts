import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearVad } from './vad';

const PASO = 100;
const RUIDO = -60;
const VOZ = -10;

function correr(vad: ReturnType<typeof crearVad>, db: number, ms: number, desde: number) {
  const salidas: ('inicio' | 'fin' | 'reiniciar')[] = [];
  let t = desde;
  for (let i = 0; i < ms / PASO; i++) {
    t += PASO;
    const r = vad.push(db, t);
    if (r) salidas.push(r);
  }
  return { salidas, t };
}

test('4: 250 ms sobre el umbral dan inicio, 100 ms no', () => {
  const corto = crearVad();
  const a = correr(corto, RUIDO, 2000, 0);
  const b = correr(corto, VOZ, 100, a.t);
  const c = correr(corto, RUIDO, 500, b.t);
  assert.deepEqual([...a.salidas, ...b.salidas, ...c.salidas], []);

  const largo = crearVad();
  const d = correr(largo, RUIDO, 2000, 0);
  const e = correr(largo, VOZ, 300, d.t);
  assert.deepEqual(e.salidas, ['inicio']);
});

test('5: tras un inicio, 2,9 s de silencio no cierran y 3 s sí', () => {
  const vad = crearVad();
  const a = correr(vad, RUIDO, 2000, 0);
  const b = correr(vad, VOZ, 500, a.t);
  assert.deepEqual(b.salidas, ['inicio']);
  const c = correr(vad, RUIDO, 2900, b.t);
  assert.deepEqual(c.salidas, []);
  const d = correr(vad, RUIDO, 100, c.t);
  assert.deepEqual(d.salidas, ['fin']);
});

test('6: una frase de 30 s seguidos se corta con fin', () => {
  const vad = crearVad();
  const a = correr(vad, RUIDO, 2000, 0);
  const b = correr(vad, VOZ, 30000, a.t);
  assert.deepEqual(b.salidas, ['inicio', 'fin']);
});

test('7: 10 s sin voz y sin frase reinician', () => {
  const vad = crearVad();
  const a = correr(vad, RUIDO, 9900, 0);
  assert.deepEqual(a.salidas, []);
  const b = correr(vad, RUIDO, 200, a.t);
  assert.deepEqual(b.salidas, ['reiniciar']);
});

test('8: el umbral sigue el piso de ruido y respeta -45 y -20', () => {
  const ruidoso = crearVad();
  const a = correr(ruidoso, -35, 2000, 0);
  const b = correr(ruidoso, -25, 500, a.t);
  assert.deepEqual(b.salidas, []);
  const c = correr(ruidoso, -15, 300, b.t);
  assert.deepEqual(c.salidas, ['inicio']);

  const silencioso = crearVad();
  const d = correr(silencioso, -80, 2000, 0);
  const e = correr(silencioso, -46, 500, d.t);
  assert.deepEqual(e.salidas, []);
  const f = correr(silencioso, -44, 300, e.t);
  assert.deepEqual(f.salidas, ['inicio']);

  const techo = crearVad();
  const g = correr(techo, -30, 2000, 0);
  const h = correr(techo, -18, 300, g.t);
  assert.deepEqual(h.salidas, ['inicio']);
});
