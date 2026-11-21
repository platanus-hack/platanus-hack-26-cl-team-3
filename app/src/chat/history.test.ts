import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toView } from './history';

const citation = { type: 'search_result_location', title: 'Tabla', source: 'fusibles://x', cited_text: 'Fusible 11', search_result_index: 0, start_block_index: 0, end_block_index: 1 };

test('toView with tool_use/tool_result yields 2 bubbles (user and assistant) with their citations', () => {
  const messages = [
    { role: 'user', content: 'se me quedó abajo la ventana' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'lookup_fuses', input: { filter: 'p/w' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'fila' }] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Apaga el contacto. ', citations: [citation] }, { type: 'text', text: 'Revisa el 11.' }] },
  ];
  const v = toView(messages);
  assert.equal(v.length, 2);
  assert.equal(v[0].role, 'user');
  assert.deepEqual(v[0].parts, [{ text: 'se me quedó abajo la ventana', citations: [] }]);
  assert.equal(v[1].role, 'assistant');
  assert.deepEqual(v[1].parts, [
    { text: 'Apaga el contacto. ', citations: [{ title: 'Tabla', source: 'fusibles://x', cited_text: 'Fusible 11' }] },
    { text: 'Revisa el 11.', citations: [] },
  ]);
});

test('toView merges consecutive assistant messages', () => {
  const v = toView([
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
  ]);
  assert.equal(v.length, 2);
  assert.deepEqual(v[1].parts.map((p) => p.text), ['a', 'b']);
});

test('toView marks the first part of each later assistant message with breakBefore', () => {
  const v = toView([
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'c' }, { type: 'text', text: 'd' }] },
  ]);
  assert.deepEqual(v[1].parts.map((p) => p.breakBefore === true), [false, false, true, false]);
});
