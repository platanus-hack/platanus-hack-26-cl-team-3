import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from './session';
import type { AnthropicMessage } from './contract';

const exchange: AnthropicMessage[] = [{ role: 'user', content: 'Photo question' }, { role: 'assistant', content: 'Answer' }];

function setup(remote = exchange) {
  const files = new Map<string, string>();
  const data = new Map<string, string>();
  const store = {
    getItem: async (key: string) => data.get(key) ?? null,
    multiGet: async (keys: readonly string[]) => keys.map(key => [key, data.get(key) ?? null] as const),
    multiSet: async (entries: readonly (readonly [string, string])[]) => { for (const [key, value] of entries) { assert.ok(value.length < 2 * 1024 * 1024); data.set(key, value); } },
    multiRemove: async (keys: readonly string[]) => { keys.forEach(key => data.delete(key)); },
    setItem: async (key: string, value: string) => { data.set(key, value); },
  };
  return createHistory(async () => store, async () => 'seed', async () => ({ messages: remote, vehicle_id: 'swift' }), {
    read: async slot => files.get(slot)!,
    write: async (slot, raw) => { files.set(slot, raw); },
  });
}

test('a late completion cannot overwrite a cleared or opened conversation', async () => {
  const session = setup();
  const original = await session.snapshot();
  await session.clear();
  assert.equal(await session.commit(original, exchange, 'swift', 'old'), false);
  const fresh = await session.snapshot();
  const loading = session.open('saved');
  const readWhileOpening = session.snapshot();
  assert.deepEqual(await loading, exchange);
  assert.equal((await readWhileOpening).id, 'saved');
  assert.equal(await session.commit(fresh, [], 'outback', null), false);
  const current = await session.snapshot();
  assert.deepEqual([current.id, current.vehicle, current.messages], ['saved', 'swift', exchange]);
});

test('camera completion notifies a focused chat and stale snapshots cannot remove its turn', async () => {
  const session = setup();
  const first = await session.snapshot();
  let changes = 0;
  const remove = session.subscribe(() => { changes++; });
  assert.equal(await session.commit(first, exchange, 'swift', 'saved'), true);
  assert.equal(await session.commit(first, [], 'outback', 'saved'), false);
  remove();
  assert.equal(changes, 1);
  const view = await session.snapshot();
  assert.deepEqual([view.vehicle, view.messages], ['swift', exchange]);
});

test('large remote conversations can be opened, continued and reloaded outside an Android cursor row', async () => {
  const history: AnthropicMessage[] = [{ role: 'assistant', content: 'x'.repeat(3 * 1024 * 1024) }];
  const session = setup(history);
  await session.open('long');
  const base = await session.snapshot();
  assert.deepEqual(base.messages, history);
  const extended = [...history, ...exchange];
  assert.equal(await session.commit(base, extended, 'swift', 'long'), true);
  assert.deepEqual((await session.snapshot()).messages, extended);
});
