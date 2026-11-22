import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { runTurn } from './client';
import type { AnthropicMessage, ChatEvent } from './contract';
import { sendTurn } from './turn';

type RunArgs = Parameters<typeof runTurn>[0];

const fakeRun = (events: ChatEvent[], seen: RunArgs[] = [], before?: () => void): typeof runTurn =>
  async function* (args) {
    seen.push(args);
    for (const ev of events) {
      before?.();
      yield ev;
    }
  };

const reply: AnthropicMessage = { role: 'assistant', content: [{ type: 'text', text: 'ok' }] };
const done: ChatEvent = { type: 'done', messages: [reply] };
const text = (t: string): ChatEvent => ({ type: 'text', block: 0, text: t });

test('9: con image el pedido lleva [image, text] y mode; el historial guarda texto', async () => {
  const seen: RunArgs[] = [];
  const result = await sendTurn([], 'hola', fakeRun([done], seen), () => {}, { image: 'AAA', mode: 'vivo' });
  assert.deepEqual(seen[0].messages, [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
        { type: 'text', text: 'hola' },
      ],
    },
  ]);
  assert.equal(seen[0].mode, 'vivo');
  assert.deepEqual(result, { messages: [{ role: 'user', content: 'hola' }, reply], truncated: false });
});

test('10: sin opts el pedido es el de siempre', async () => {
  const seen: RunArgs[] = [];
  await sendTurn([], 'hola', fakeRun([done], seen), () => {});
  assert.deepEqual(seen[0], { messages: [{ role: 'user', content: 'hola' }] });
});

test('11: abortado a mitad del stream devuelve aborted y no llama más a onProgress', async () => {
  const controller = new AbortController();
  const calls: number[] = [];
  let n = 0;
  const result = await sendTurn(
    [],
    'hola',
    fakeRun([text('a'), text('b'), text('c')]),
    () => {
      calls.push(++n);
      if (n === 1) controller.abort();
    },
    { signal: controller.signal },
  );
  assert.deepEqual(result, { aborted: true });
  assert.deepEqual(calls, [1]);
});

test('12: abortado después de done devuelve messages', async () => {
  const controller = new AbortController();
  const result = await sendTurn([], 'hola', fakeRun([done], [], () => controller.abort()), () => {}, { signal: controller.signal });
  assert.ok('messages' in result);
});
