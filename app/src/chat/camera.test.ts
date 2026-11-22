import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCard } from './history';
import { cameraRoute, fuseCitationRoute } from './camera';

test('cameraRoute points to /escanear with the vehicle, part and instruction', () => {
  const card = { part: 'washer' as const, instruction: 'Busca la tapa amarilla.' };
  assert.deepEqual(cameraRoute(card, [card], 'outback'), {
    pathname: '/escanear',
    params: { vehicleId: 'outback', part: 'washer', instruction: 'Busca la tapa amarilla.' },
  });
});

test('camera cards carry supported inspection actions through history and navigation', () => {
  const card = toCard('washer', 'Inspect the washer.', 'refill');
  assert.ok(card);
  assert.equal(cameraRoute(card, [card], 'swift').params.action, 'refill');
  assert.equal(cameraRoute(card, [card], 'swift').params.vehicleId, 'swift');
  assert.equal(toCard('battery', 'Inspect the battery.', 'refill'), null);
});

test('a window citation opens its cabin slot and preserves ambiguous references', () => {
  const source = 'fusibles://outback-2016-3.6r/cabina';
  const citation = { title: 'Fuse table', source, cited_text: 'Fusible 6 — 20 A — P/W R.LH. part_id: fusible-cabina-6' };
  assert.deepEqual(fuseCitationRoute(citation)?.params, { box: 'cabin', fuse: '6' });
  assert.deepEqual(fuseCitationRoute({ ...citation, cited_text: 'Fusible 11, Fusible 24' })?.params, { box: 'cabin' });
  assert.equal(fuseCitationRoute({ ...citation, source: 'unrelated' }), null);
});

test('an engine-box citation opens its engine slot', () => {
  const citation = {
    title: 'Fuse table',
    source: 'fusibles://outback-2016-3.6r/motor',
    cited_text: 'Fusible 37 — 15 A — F.WASH. part_id: fusible-motor-37',
  };
  assert.deepEqual(fuseCitationRoute(citation)?.params, { box: 'engine', fuse: '37' });
  assert.deepEqual(fuseCitationRoute({ ...citation, cited_text: 'Fusible 37, Fusible 38' })?.params, { box: 'engine' });
});
