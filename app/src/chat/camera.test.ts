import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAT_VEHICLE_ID, cameraRoute } from './camera';

test('cameraRoute points to /escanear with the vehicle, part and instruction', () => {
  assert.equal(CHAT_VEHICLE_ID, 'outback');
  assert.deepEqual(cameraRoute({ part: 'washer', instruction: 'Busca la tapa amarilla.' }), {
    pathname: '/escanear',
    params: { vehicleId: 'outback', part: 'washer', instruction: 'Busca la tapa amarilla.' },
  });
});
