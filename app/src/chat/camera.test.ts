import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCard } from './history';
import { CHAT_VEHICLE_ID, cameraRoute } from './camera';

test('cameraRoute points to /escanear with the vehicle, part and instruction', () => {
  assert.equal(CHAT_VEHICLE_ID, 'outback');
  assert.deepEqual(cameraRoute({ part: 'washer', instruction: 'Busca la tapa amarilla.' }), {
    pathname: '/escanear',
    params: { vehicleId: 'outback', part: 'washer', instruction: 'Busca la tapa amarilla.' },
  });
});

test('camera cards carry supported inspection actions through history and navigation', () => {
  const card = toCard('washer', 'Inspect the washer.', 'refill');
  assert.ok(card);
  assert.equal(cameraRoute(card).params.action, 'refill');
  assert.equal(toCard('battery', 'Inspect the battery.', 'refill'), null);
});
