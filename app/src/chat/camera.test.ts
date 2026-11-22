import assert from 'node:assert/strict';
import { test } from 'node:test';

import { confirmsGuideStep } from './guide';
import { maintenanceSteps, toCard } from './history';
import { cameraRoute, fuseCitationRoute, fuseRoute, readGuide } from './camera';

test('cameraRoute points to /escanear with the vehicle, part and instruction', () => {
  const card = { part: 'washer' as const, instruction: 'Busca la tapa amarilla.' };
  assert.deepEqual(cameraRoute(card, [card], 'outback'), {
    pathname: '/escanear',
    params: { vivo: '1', vehicleId: 'outback', part: 'washer', instruction: 'Busca la tapa amarilla.' },
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

test('the camera route keeps the verified fuse target on the third step only', () => {
  const target = { box: 'motor', numbers: [5], instruction: 'Open the diagram to inspect fuse 5.' };
  const find = toCard('fuses', 'Find the box.')!;
  const open = toCard('fuses', 'Open the box.', 'open')!;
  const cards = maintenanceSteps([find, open], [target]);
  const route = cameraRoute(find, cards, 'outback');
  assert.deepEqual(readGuide(route.params).steps, [find, open, { part: 'fuses', instruction: target.instruction, fuseTargets: [target] }]);
  assert.deepEqual(maintenanceSteps([], [target]), []);
  const washer = [toCard('washer', 'Find the reservoir.')!, toCard('washer', 'Refill.', 'refill')!];
  assert.deepEqual(maintenanceSteps(washer, []), washer);
  const oil = toCard('oil_cap', 'Open the cap.', 'open')!;
  assert.deepEqual(maintenanceSteps([oil], []).map(card => [card.part, card.action]), [['oil_cap', undefined], ['oil_cap', 'open']]);
  assert.ok(confirmsGuideStep('Ya la encontré.'));
  assert.ok(confirmsGuideStep('Listo'));
  assert.ok(confirmsGuideStep('Perfecto, la encontré.'));
  assert.ok(confirmsGuideStep('Listo, destapada'));
  assert.equal(confirmsGuideStep('Todavía no la encontré'), false);
  assert.deepEqual(maintenanceSteps([find], [target]).map(card => card.fuseTargets), [undefined, [target]]);
  assert.equal(confirmsGuideStep('¿Cómo la destapo?'), false);
});
