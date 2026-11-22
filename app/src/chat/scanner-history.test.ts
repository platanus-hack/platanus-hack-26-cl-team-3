import assert from 'node:assert/strict';
import test from 'node:test';
import { selectConversationVehicle } from './history';
import { withChatTurn } from './turn-queue';

test('switching vehicles restores local legacy messages and the server conversation identity', async () => {
  const messages = 'capo-ar:chat-v1';
  const id = 'capo-ar:chat-id:v1';
  const vehicle = 'capo-ar:chat-vehicle:v1';
  const legacy = JSON.stringify([{ role: 'user', content: 'Legacy question' }]);
  const data = new Map([[messages, legacy]]);
  const storage = async () => ({
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); },
    multiGet: async (keys: readonly string[]) => keys.map(key => [key, data.get(key) ?? null] as const),
    multiSet: async (rows: readonly (readonly [string, string])[]) => { for (const [key, value] of rows) data.set(key, value); },
  });
  const select = (key: string) => selectConversationVehicle(key, storage);
  await select('swift');
  for (const key of [messages, id, vehicle]) data.delete(key);
  await select('swift');
  data.set(id, 'swift-thread');
  await select('outback');
  assert.equal(data.get(messages), legacy);
  assert.equal(data.get(id), '');
  await select('swift');
  assert.equal(data.get(id), 'swift-thread');
  await select('outback');
  await selectConversationVehicle('swift', storage, { messages: '[]', id: '' });
  await select('swift');
  assert.equal(data.get(id), '');
  assert.equal(data.get(messages), '[]');
  await select('outback');
  assert.equal(data.get(messages), legacy);
  await selectConversationVehicle('outback', storage, { messages: '[]', id: '' });
  const archived = JSON.parse(data.get('capo-ar:local-history:v1')!);
  assert.equal(archived.length, 1);
  assert.equal(archived[0].vehicle_id, 'outback');
  assert.deepEqual(JSON.parse(data.get(archived[0].id)!).messages, JSON.parse(legacy));
  assert.equal(data.get(messages), '[]');
  assert.equal(data.get(id), '');
  await selectConversationVehicle('outback', storage, { messages: '[]', id: '' });
  assert.equal(JSON.parse(data.get('capo-ar:local-history:v1')!).length, 1);
});

test('a scanner turn waits for text history to finish saving and recovers after a failed turn', async () => {
  const events: string[] = [];
  const first = withChatTurn(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push('text saved');
    throw new Error('example');
  });
  const second = withChatTurn(async () => { events.push('scanner switched vehicle'); });
  await assert.rejects(first);
  await second;
  assert.deepEqual(events, ['text saved', 'scanner switched vehicle']);
});
