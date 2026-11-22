import assert from 'node:assert/strict';
import { test } from 'node:test';

import { capacidadesDe, resumenCapacidades } from './capacidades';
import { vehicles } from './vehicles';

test('el Outback lo tiene todo y los demás autos solo lo que existe', () => {
  assert.deepEqual(capacidadesDe('outback'), { ar: 'completo', manual: true, fusibles: true, tablero: true });
  assert.equal(capacidadesDe('swift').ar, 'medido');
  assert.equal(capacidadesDe('swift').manual, false);
  assert.equal(capacidadesDe('ram700').fusibles, false);
});

test('un auto del catálogo sin modelo 3D usa la plantilla, y uno desconocido (patente) no tiene mapa', () => {
  assert.equal(capacidadesDe('onix').ar, 'plantilla');
  assert.equal(capacidadesDe('prt-HHJL67').ar, 'ninguno');
  assert.equal(capacidadesDe(undefined).ar, 'ninguno');
  assert.deepEqual(capacidadesDe('prt-X'), { ar: 'ninguno', manual: false, fusibles: false, tablero: false });
});

test('todo auto del catálogo tiene capacidades y solo el Outback tiene manual, fusibles y tablero', () => {
  for (const v of vehicles) {
    const c = capacidadesDe(v.id);
    assert.notEqual(c.ar, 'ninguno', v.id);
    assert.equal(c.manual, v.id === 'outback', v.id);
    assert.equal(c.fusibles, v.id === 'outback', v.id);
    assert.equal(c.tablero, v.id === 'outback', v.id);
  }
});

test('el resumen dice lo que hay y lo que no, con el nombre del auto elegido', () => {
  const outback = resumenCapacidades('Subaru Outback 2016', capacidadesDe('outback'));
  assert.match(outback, /Subaru Outback 2016/);
  assert.match(outback, /manual, fusibles, luces del tablero/);
  const otro = resumenCapacidades('Kia Rio 2023', capacidadesDe('rio'));
  assert.match(otro, /Kia Rio 2023/);
  assert.match(otro, /Sin manual ni datos verificados/);
  assert.doesNotMatch(otro, /Outback/);
  assert.match(resumenCapacidades('SUBARU X', capacidadesDe('prt-1')), /Sin mapa de piezas/);
});
