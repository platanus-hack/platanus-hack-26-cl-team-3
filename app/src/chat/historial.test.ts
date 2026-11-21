import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aVista } from './historial';

const cita = { type: 'search_result_location', title: 'Tabla', source: 'fusibles://x', cited_text: 'Fusible 11', search_result_index: 0, start_block_index: 0, end_block_index: 1 };

test('7: aVista con tool_use/tool_result muestra 2 burbujas (usuario y asistente) con sus citas', () => {
  const mensajes = [
    { role: 'user', content: 'se me quedó abajo la ventana' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'consultar_fusibles', input: { filtro: 'p/w' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'fila' }] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Apaga el contacto. ', citations: [cita] }, { type: 'text', text: 'Revisa el 11.' }] },
  ];
  const v = aVista(mensajes);
  assert.equal(v.length, 2);
  assert.equal(v[0].rol, 'user');
  assert.deepEqual(v[0].partes, [{ texto: 'se me quedó abajo la ventana', citas: [] }]);
  assert.equal(v[1].rol, 'assistant');
  assert.deepEqual(v[1].partes, [
    { texto: 'Apaga el contacto. ', citas: [{ titulo: 'Tabla', fuente: 'fusibles://x', texto_citado: 'Fusible 11' }] },
    { texto: 'Revisa el 11.', citas: [] },
  ]);
});

test('aVista junta assistant consecutivos', () => {
  const v = aVista([
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
  ]);
  assert.equal(v.length, 2);
  assert.deepEqual(v[1].partes.map((p) => p.texto), ['a', 'b']);
});
