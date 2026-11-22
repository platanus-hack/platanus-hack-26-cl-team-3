import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readTranscribeResponse } from './transcribe-response';

test('devuelve el texto recortado', () => {
  assert.deepEqual(readTranscribeResponse(200, { text: '  dónde está el sapito ' }), { ok: true, text: 'dónde está el sapito' });
});

test('texto vacío o ausente: no te escuché', () => {
  const empty = { ok: false, message: 'No te escuché. Inténtalo de nuevo.' };
  assert.deepEqual(readTranscribeResponse(200, { text: '  ' }), empty);
  assert.deepEqual(readTranscribeResponse(200, {}), empty);
  assert.deepEqual(readTranscribeResponse(200, null), empty);
});

test('usa el error del servidor si viene', () => {
  assert.deepEqual(readTranscribeResponse(503, { error: 'El servicio de voz está ocupado. Inténtalo de nuevo.' }), {
    ok: false,
    message: 'El servicio de voz está ocupado. Inténtalo de nuevo.',
  });
});

test('error sin JSON: mensaje con el status', () => {
  assert.deepEqual(readTranscribeResponse(502, null), { ok: false, message: 'El servidor respondió 502.' });
});
