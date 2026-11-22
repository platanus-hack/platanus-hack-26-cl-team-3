import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Vano } from '../detector/vano';
import { encajar, mejorCuadro, piezasSobreImagen, volumenesBasicos } from './mapa2d';

const vano = (x0: number, y0: number, x1: number, y1: number, extra: Partial<Vano> = {}): Vano => ({
  esquinas: [{ x: x0, y: y0, borde: false }, { x: x1, y: y0, borde: false }, { x: x1, y: y1, borde: false }, { x: x0, y: y1, borde: false }],
  area: (x1 - x0) * (y1 - y0), confianza: 0.9, cortado: false, ...extra,
});

test('las huellas del catálogo caen dentro del vano y conservan su posición relativa', () => {
  const piezas = piezasSobreImagen(vano(0.2, 0.3, 0.8, 0.7), [
    { part: 'battery', height: 0.1, outline: [[0.8, 0.1], [0.95, 0.1], [0.95, 0.3], [0.8, 0.3]] },
    { part: 'washer', height: 0.1, outline: [[0.05, 0.7], [0.15, 0.7], [0.15, 0.9], [0.05, 0.9]] },
  ]);
  assert.equal(piezas.length, 2);
  for (const p of piezas) for (const q of p.contorno) assert.ok(q.x > 0.2 && q.x < 0.8 && q.y > 0.3 && q.y < 0.7);
  const [bateria, sapito] = piezas;
  assert.ok(bateria.centro.x > sapito.centro.x, 'la batería queda a la derecha del sapito');
  assert.ok(bateria.centro.y < sapito.centro.y, 'y más atrás (arriba en la imagen)');
});

test('un vano cortado por el borde no sirve para ubicar piezas', () => {
  assert.deepEqual(piezasSobreImagen(vano(0, 0.3, 1, 0.7, { cortado: true }), [{ part: 'battery', height: 0.1, outline: [[0, 0], [1, 0], [1, 1]] }]), []);
});

test('de un video se elige el cuadro con el vano completo', () => {
  const cortado = vano(0, 0.2, 1, 0.9, { cortado: true, confianza: 0.99 });
  assert.equal(mejorCuadro([{ vano: null, valido: false }, { vano: cortado, valido: true }, { vano: vano(0.2, 0.3, 0.8, 0.7), valido: true }]), 2);
  assert.equal(mejorCuadro([{ vano: null, valido: false }, { vano: cortado, valido: true }]), 1);
  assert.equal(mejorCuadro([]), -1);
});

test('la imagen se encaja completa y centrada', () => {
  assert.deepEqual(encajar(400, 200, { w: 300, h: 300 }), { x: 0, y: 75, w: 300, h: 150 });
});

test('solo se dibujan las piezas con ficha; sin fichas, todas', () => {
  const volumenes = [
    { part: 'battery', height: 0.1, outline: [[0, 0], [1, 0], [1, 1]] },
    { part: 'metal_pulley', height: 0.1, outline: [[0, 0], [1, 0], [1, 1]] },
  ] as const;
  assert.deepEqual(volumenesBasicos(volumenes, { battery: 'ficha' }).map((v) => v.part), ['battery']);
  assert.equal(volumenesBasicos(volumenes, undefined).length, 2);
  assert.equal(volumenesBasicos(volumenes, {}).length, 2);
});
