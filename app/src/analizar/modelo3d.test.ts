import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PiezaImagen } from '../../modules/capo-ar';
import type { Vano } from '../detector/vano';
import { aPiezas2D, esquinasParaModelo, piezaEnPunto } from './modelo3d';

const cuadrado = (x: number, y: number, l: number) => [x, y, x + l, y, x + l, y + l, x, y + l];
const pieza = (id: string, x: number, y: number, l: number): PiezaImagen => ({ id, contorno: cuadrado(x, y, l), centro: [x + l / 2, y + l / 2], profundidad: 1 });

test('las esquinas del vano se pasan planas, y sin vano no hay nada', () => {
  const vano = { esquinas: [{ x: 0.1, y: 0.2, borde: false }, { x: 0.8, y: 0.2, borde: false }, { x: 0.8, y: 0.7, borde: true }], area: 0.2, confianza: 1, cortado: true } as Vano;
  assert.deepEqual(esquinasParaModelo(vano), [0.1, 0.2, 0.8, 0.2, 0.8, 0.7]);
  assert.deepEqual(esquinasParaModelo(null), []);
});

test('las piezas nativas pasan a puntos y se descartan las que el catálogo no conoce o vienen rotas', () => {
  const r = aPiezas2D([pieza('battery', 0.5, 0.5, 0.1), pieza('no_existe', 0, 0, 0.1), { id: 'washer', contorno: [0, 0, 1, 1], centro: [0.5, 0.5], profundidad: 1 }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].part, 'battery');
  assert.equal(r[0].contorno.length, 4);
  assert.deepEqual(r[0].centro, { x: 0.55, y: 0.55 });
});

test('un toque elige la pieza más chica que lo contiene (la tapa sobre su depósito)', () => {
  const piezas = aPiezas2D([pieza('coolant', 0.4, 0.4, 0.2), pieza('coolant_cap', 0.48, 0.48, 0.04)]);
  assert.equal(piezaEnPunto(piezas, { x: 0.5, y: 0.5 }), 'coolant_cap');
  assert.equal(piezaEnPunto(piezas, { x: 0.42, y: 0.42 }), 'coolant');
});

test('un toque cerca de una pieza chica la elige; lejos de todo no elige nada', () => {
  const piezas = aPiezas2D([pieza('oil_cap', 0.5, 0.5, 0.02)]);
  assert.equal(piezaEnPunto(piezas, { x: 0.53, y: 0.51 }), 'oil_cap');
  assert.equal(piezaEnPunto(piezas, { x: 0.9, y: 0.9 }), null);
});
