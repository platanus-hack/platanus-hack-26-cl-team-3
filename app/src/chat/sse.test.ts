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

test('maps truncated on done only when true', () => {
  const buffer =
    'event: done\ndata: {"messages":[],"truncated":true}\n\n' +
    'event: done\ndata: {"messages":[]}\n\n';
  assert.deepEqual(splitEvents(buffer).events, [
    { type: 'done', messages: [], truncated: true },
    { type: 'done', messages: [] },
  ]);
});

test('ignores SSE comment lines such as ping', () => {
  const buffer =
    'event: tool\ndata: {"name":"lookup_fuses"}\n\n' +
    ': ping\n\n' +
    'event: text\ndata: {"block":0,"text":"hola"}\n\n';
  const { events, rest } = splitEvents(buffer);
  assert.deepEqual(events, [
    { type: 'tool', name: 'lookup_fuses' },
    { type: 'text', block: 0, text: 'hola' },
  ]);
  assert.equal(rest, '');
});

test('maps ar into part and instruction', () => {
  const buffer = 'event: ar\ndata: {"part":"washer","instruction":"Busca la tapa amarilla junto a la batería."}\n\n';
  assert.deepEqual(splitEvents(buffer).events, [
    { type: 'ar', part: 'washer', instruction: 'Busca la tapa amarilla junto a la batería.' },
  ]);
});

test('maps conversation_id on done to conversationId', () => {
  const buffer = 'event: done\ndata: {"messages":[],"conversation_id":"c1","turn_id":"t1"}\n\n';
  assert.deepEqual(splitEvents(buffer).events, [{ type: 'done', messages: [], conversationId: 'c1' }]);
});
