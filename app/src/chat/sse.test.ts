import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitEvents } from './sse';

test('splits complete events and keeps the remainder for the next read', () => {
  const buffer =
    'event: tool\ndata: {"name":"lookup_fuses"}\n\n' +
    'event: text\ndata: {"block":0,"text":"Apaga el contacto."}\n\n' +
    'event: citation\ndata: {"block":0,"title":"Tabla","source":"f","cited_text":"Fusible 11"}\n\n' +
    'event: done\ndata: {"mess';
  const { events, rest } = splitEvents(buffer);
  assert.deepEqual(events, [
    { type: 'tool', name: 'lookup_fuses' },
    { type: 'text', block: 0, text: 'Apaga el contacto.' },
    { type: 'citation', block: 0, title: 'Tabla', source: 'f', cited_text: 'Fusible 11' },
  ]);
  assert.equal(rest, 'event: done\ndata: {"mess');
});

test('maps done and error, and ignores unknown events or broken JSON', () => {
  const buffer =
    'event: done\ndata: {"messages":[{"role":"assistant","content":"ok"}]}\n\n' +
    'event: unknown\ndata: {}\n\n' +
    'event: text\ndata: {roto\n\n' +
    'event: error\ndata: {"code":"credit","message":"Sin crédito"}\n\n';
  const { events, rest } = splitEvents(buffer);
  assert.deepEqual(events, [
    { type: 'done', messages: [{ role: 'assistant', content: 'ok' }] },
    { type: 'error', code: 'credit', message: 'Sin crédito' },
  ]);
  assert.equal(rest, '');
});
