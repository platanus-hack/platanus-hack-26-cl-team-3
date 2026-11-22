import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCard } from './history';
import { CHAT_VEHICLE_ID, cameraRoute, fuseCitationRoute } from './camera';

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

test('a window citation opens its cabin slot and preserves ambiguous references', () => {
  const source = 'fusibles://outback-2016-3.6r/cabina';
  const citation = { title: 'Fuse table', source, cited_text: 'Fusible 6 — 20 A — P/W R.LH. part_id: fusible-cabina-6' };
  assert.deepEqual(fuseCitationRoute(citation)?.params, { box: 'cabin', fuse: '6' });
  assert.deepEqual(fuseCitationRoute({ ...citation, cited_text: 'Fusible 11, Fusible 24' })?.params, { box: 'cabin' });
  assert.equal(fuseCitationRoute({ ...citation, source: 'unrelated' }), null);
});
