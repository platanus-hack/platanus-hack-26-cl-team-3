import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { engineMaps } from '../engine-maps/catalog';

for (const id of ['outback', 'swift'] as const) {
  test(`api parts/${id}.json ids match the distinct parts of engineMaps.${id}.volumes`, () => {
    const file = join(__dirname, `../../../api/src/data/parts/${id}.json`);
    const ids = (JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]).map((p) => p.id);
    const expected = [...new Set(engineMaps[id].volumes.map((v) => v.part))];
    assert.deepEqual([...ids].sort(), expected.sort());
  });
}
