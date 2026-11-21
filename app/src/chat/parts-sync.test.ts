import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parts } from '../engine-maps/catalog';

test('api parts.json ids match the keys of parts in catalog.ts', () => {
  const file = join(__dirname, '../../../api/src/data/parts.json');
  const ids = (JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]).map((p) => p.id);
  assert.deepEqual([...ids].sort(), Object.keys(parts).sort());
});
