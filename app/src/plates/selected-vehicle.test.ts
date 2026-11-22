import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSelectedVehicle } from './selected-vehicle';

test('a saved catalog vehicle comes back with the current catalog data', () => {
  const saved = JSON.stringify({ id: 'swift', name: 'Nombre viejo', year: 2017, engine: '1.2' });
  assert.deepEqual(parseSelectedVehicle(saved), { id: 'swift', name: 'Suzuki Swift', year: 2017, engine: '1.2' });
});

test('a vehicle identified by plate keeps its saved data', () => {
  const plate = { id: 'prt-ABCD12', name: 'Kia Morning', year: null, engine: 'ABCD12' };
  assert.deepEqual(parseSelectedVehicle(JSON.stringify(plate)), plate);
});

test('missing or malformed data returns null', () => {
  assert.equal(parseSelectedVehicle(null), null);
  assert.equal(parseSelectedVehicle('{no json'), null);
  assert.equal(parseSelectedVehicle(JSON.stringify({ id: 'swift' })), null);
  assert.equal(parseSelectedVehicle(JSON.stringify({ id: 'x', name: 'x', year: 'dos mil', engine: 'x' })), null);
});
