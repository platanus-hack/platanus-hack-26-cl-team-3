import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { engineMaps, parts } from '../engine-maps/catalog';

test('api parts.json ids match the keys of parts in catalog.ts', () => {
  const file = join(__dirname, '../../../api/src/data/parts.json');
  const rows = JSON.parse(readFileSync(file, 'utf8')) as { id: string; vehicles?: string[] }[];
  const ids = rows.map(row => row.id);
  const outbackIds = rows.filter(row => !row.vehicles || row.vehicles.includes('outback')).map(row => row.id);
  assert.deepEqual(outbackIds.sort(), engineMaps.outback.volumes.map(volume => volume.part).sort());
  assert.deepEqual([...ids].sort(), Object.keys(parts).sort());
});
