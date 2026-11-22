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

const cameraCall = (part: string, instruction: unknown, id = 'c1') => ({ type: 'tool_use', id, name: 'show_in_camera', input: { part, instruction } });

test('toView puts the show_in_camera card in the assistant bubble', () => {
  const v = toView([
    { role: 'user', content: 'no sale agua' },
    { role: 'assistant', content: [{ type: 'text', text: 'Busca el sapito.' }, cameraCall('washer', '  Busca la tapa amarilla.  ')] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: [{ type: 'text', text: 'ok' }] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Avísame.' }] },
  ]);
  assert.equal(v.length, 2);
  assert.deepEqual(v[0].cards, []);
  assert.deepEqual(v[1].cards, [{ part: 'washer', instruction: 'Busca la tapa amarilla.' }]);
  assert.deepEqual(v[1].parts.map((p) => p.text), ['Busca el sapito.', 'Avísame.']);
});

test('toView ignores unknown parts and empty instructions, and caps the instruction at 200 characters', () => {
  const v = toView([
    { role: 'user', content: 'hola' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'a' },
        cameraCall('wheel', 'x', 'c1'),
        cameraCall('washer', '   ', 'c2'),
        cameraCall('battery', 'y'.repeat(300), 'c3'),
        { type: 'tool_use', id: 'c4', name: 'lookup_fuses', input: { part: 'washer', instruction: 'z' } },
      ],
    },
  ]);
  assert.deepEqual(v[1].cards, [{ part: 'battery', instruction: 'y'.repeat(200) }]);
});

test('toView does not create an empty bubble for a tool_use-only message and keeps its card in the surrounding bubble', () => {
  const v = toView([
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [{ type: 'text', text: 'Mira.' }] },
    { role: 'assistant', content: [cameraCall('dipstick', 'Busca la manilla amarilla.')] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: [] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Listo.' }] },
  ]);
  assert.equal(v.length, 2);
  assert.deepEqual(v[1].cards, [{ part: 'dipstick', instruction: 'Busca la manilla amarilla.' }]);
  assert.deepEqual(v[1].parts.map((p) => [p.text, p.breakBefore === true]), [['Mira.', false], ['Listo.', true]]);
});

test('toView creates an assistant bubble when a card has no bubble to join', () => {
  const v = toView([
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [cameraCall('oil_cap', 'Busca la tapa.')] },
  ]);
  assert.equal(v.length, 2);
  assert.equal(v[1].role, 'assistant');
  assert.deepEqual(v[1].parts, []);
  assert.deepEqual(v[1].cards, [{ part: 'oil_cap', instruction: 'Busca la tapa.' }]);
});

test('toView reads show_fuse tool_use into the assistant bubble', () => {
  const fuseCall = (input: unknown) => ({ type: 'tool_use', id: 'f1', name: 'show_fuse', input });
  const v = toView([
    { role: 'user', content: 'no sale agua' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Revisa el fusible.' },
        fuseCall({ box: 'motor', numbers: [37], instruction: '  Revisa este.  ' }),
        fuseCall({ box: 5, numbers: [1], instruction: 'x' }),
        fuseCall({ box: 'motor', numbers: [999], instruction: 'x' }),
      ],
    },
  ]);
  assert.deepEqual(v[0].fuses, []);
  assert.deepEqual(v[1].fuses, [{ box: 'motor', numbers: [37], instruction: 'Revisa este.' }]);
});

test('rejected calls and unknown slots cannot create fuse links on replay', () => {
  const call = (id: string, number: number) => ({ type: 'tool_use', id, name: 'show_fuse', input: { box: 'motor', numbers: [number], instruction: 'Inspect' } });
  const bubbles = toView([
    { role: 'assistant', content: [call('invalid', 999), call('rejected', 5), call('accepted', 6)] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'rejected', is_error: true }] },
  ]);
  assert.deepEqual(bubbles[0].fuses.map(fuse => fuse.numbers), [[6]]);
});
