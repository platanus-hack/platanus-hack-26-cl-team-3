import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCard } from './history';
import { cameraRoute, fuseCitationRoute, fuseRoute } from './camera';

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
  assert.deepEqual(fuseCitationRoute(citation)?.params, { vehicleId: 'outback', box: 'cabina', fuse: '6' });
  assert.deepEqual(fuseCitationRoute({ ...citation, cited_text: 'Fusible 11, Fusible 24' })?.params, { vehicleId: 'outback', box: 'cabina' });
  assert.equal(fuseCitationRoute({ ...citation, source: 'unrelated' }), null);
});

test('an engine-box citation opens its motor slot', () => {
  const citation = {
    title: 'Fuse table',
    source: 'fusibles://outback-2016-3.6r/motor',
    cited_text: 'Fusible 37 — 15 A — F.WASH. part_id: fusible-motor-37',
  };
  assert.deepEqual(fuseCitationRoute(citation)?.params, { vehicleId: 'outback', box: 'motor', fuse: '37' });
  assert.deepEqual(fuseCitationRoute({ ...citation, cited_text: 'Fusible 37, Fusible 38' })?.params, { vehicleId: 'outback', box: 'motor' });
});

test('a citation from an unknown vehicle or box does not open the fuse screen', () => {
  const cited_text = 'Fusible 6 — 20 A';
  assert.equal(fuseCitationRoute({ title: 't', source: 'fusibles://otro-auto/cabina', cited_text }), null);
  assert.equal(fuseCitationRoute({ title: 't', source: 'fusibles://outback-2016-3.6r/techo', cited_text }), null);
});

test('fuseRoute points to /fusibles with the vehicle, the box and the fuse number', () => {
  assert.deepEqual(fuseRoute('outback', 'motor', 37), { pathname: '/fusibles', params: { vehicleId: 'outback', box: 'motor', fuse: '37' } });
  assert.deepEqual(fuseRoute('outback', 'cabina', 6), { pathname: '/fusibles', params: { vehicleId: 'outback', box: 'cabina', fuse: '6' } });
});
