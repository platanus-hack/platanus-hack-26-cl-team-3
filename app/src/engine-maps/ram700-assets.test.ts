import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { engineMaps } from './catalog';
import binding from '../../modules/capo-ar/android/src/main/assets/engine-models/ram700-registration.json';

test('RAM scanner selections address the matching GLB node and registered part', () => {
  const file = new URL('../../modules/capo-ar/android/src/main/assets/engine-models/ram700-service.glb', import.meta.url);
  const glb = readFileSync(file);
  const scene = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const nodes = scene.scenes[scene.scene].nodes.map((index: number) => scene.nodes[index].name);
  const ids = engineMaps.ram700.volumes.map(volume => volume.part);
  assert.deepEqual(binding.parts.map(part => part.id), nodes);
  assert.deepEqual(ids, nodes);
  assert.equal(new Set(ids).size, ids.length);
  for (const part of ['oil_cap', 'dipstick', 'washer', 'coolant_cap', 'brake_fluid', 'battery', 'fuses', 'steering_fluid'] as const) {
    assert.ok(ids.includes(part), part);
  }
  for (const anchor of binding.colorLandmarks) {
    assert.ok(nodes.includes(anchor.id), anchor.id);
    assert.ok(anchor.width > 0);
  }
});
