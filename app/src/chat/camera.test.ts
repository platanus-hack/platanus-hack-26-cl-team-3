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

test('an exact citation opens the original panel and position independently of quoted text', () => {
  const route = (key: string) => fuseCitationRoute({ source: 'fusibles://outback-2016-3.6r/' + key, title: '', cited_text: '' });
  assert.deepEqual(route('engine/17')?.params, { box: 'engine', fuse: '17' });
  assert.deepEqual(route('cabin/17')?.params, { box: 'cabin', fuse: '17' });
  assert.deepEqual(route('engine/A')?.params, { box: 'engine', fuse: 'A' });
  for (const invalid of ['cabin/A', 'engine/017', 'engine/99', 'cabin/17/extra']) assert.equal(route(invalid), null);
});
