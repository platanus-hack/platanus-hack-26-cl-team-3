import assert from 'node:assert/strict';
import test from 'node:test';
import { identifiedVehicle, isPlateRecord, normalizePlate, readCarPlate } from './lookup';

test('plate reads normalize the Chilean separators and distinguish full lines from unrelated text', () => {
  assert.equal(normalizePlate(' aa·bb-12 '), 'AABB12');
  assert.equal(readCarPlate(['CHILE', 'BC·DF·12']), 'BCDF12');
  assert.equal(readCarPlate(['AB 12 34']), 'AB1234');
  assert.equal(readCarPlate(['BCDF12', 'bc.df.12']), 'BCDF12');
  assert.equal(readCarPlate(['AB1234', 'CD5678']), undefined);
  assert.equal(readCarPlate(['VIN 1AB1234']), undefined);
  assert.equal(readCarPlate(['CHILE']), undefined);
});

test('the displayed vehicle preserves the registered year and only assigns a known engine map on an exact variant match', () => {
  const record = { plate: 'BCDF12', make: 'SUBARU', model: 'ALL NEW OUTBACK 3.6R', year: 2015 };
  assert.equal(identifiedVehicle(record).name, 'SUBARU ALL NEW OUTBACK 3.6R');
  assert.equal(identifiedVehicle(record).year, 2015);
  assert.equal(identifiedVehicle(record).id, 'prt-BCDF12');
  assert.equal(identifiedVehicle({ ...record, model: 'OUTBACK 3.6R (EZ36)', year: 2016 }).id, 'outback');
});

test('a lookup must identify the requested plate and provide a correctly typed descriptor', () => {
  const record = { plate: 'AB1234', make: 'RAM', model: '700', year: null };
  assert.ok(isPlateRecord(record, 'AB1234'));
  assert.equal(isPlateRecord(record, 'XY7890'), false);
  assert.equal(isPlateRecord({ ...record, year: '2022' }, 'AB1234'), false);
});
