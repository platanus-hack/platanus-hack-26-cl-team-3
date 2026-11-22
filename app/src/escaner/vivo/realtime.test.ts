import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aBase64, dbDe, leerMensaje, urlRealtime } from './realtime';

test('urlRealtime: arma los parámetros y rechaza tasas no soportadas', () => {
  const url = new URL(urlRealtime('sutkn_x', 16000)!);
  assert.equal(url.origin + url.pathname, 'wss://api.elevenlabs.io/v1/speech-to-text/realtime');
  assert.equal(url.searchParams.get('audio_format'), 'pcm_16000');
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime');
  assert.equal(url.searchParams.get('commit_strategy'), 'vad');
  assert.equal(url.searchParams.get('vad_silence_threshold_secs'), '1');
  assert.equal(url.searchParams.get('language_code'), 'es');
  assert.equal(url.searchParams.get('token'), 'sutkn_x');
  assert.equal(urlRealtime('t', 12345), null);
});

test('dbDe: silencio total, plena escala y media escala', () => {
  assert.equal(dbDe(new Int16Array(100)), -160);
  assert.equal(dbDe(new Int16Array(0)), -160);
  assert.ok(Math.abs(dbDe(new Int16Array(100).fill(32767))) < 0.01);
  assert.ok(Math.abs(dbDe(new Int16Array(100).fill(16384)) + 6.02) < 0.01);
});

test('aBase64: coincide con Buffer en todos los restos de relleno', () => {
  for (const largo of [0, 1, 2, 3, 4, 5, 100, 3200]) {
    const bytes = Uint8Array.from({ length: largo }, (_, i) => (i * 37 + 11) & 255);
    assert.equal(aBase64(bytes), Buffer.from(bytes).toString('base64'), String(largo));
  }
});

test('leerMensaje: sesión, parcial, final, error y ruido', () => {
  assert.deepEqual(leerMensaje('{"message_type":"session_started","session_id":"a"}'), { tipo: 'sesion' });
  assert.deepEqual(leerMensaje('{"message_type":"partial_transcript","text":"hola"}'), { tipo: 'parcial', texto: 'hola' });
  assert.deepEqual(leerMensaje('{"message_type":"committed_transcript","text":"hola mundo"}'), { tipo: 'final', texto: 'hola mundo' });
  assert.deepEqual(leerMensaje('{"message_type":"auth_error","error":"x"}'), { tipo: 'error', codigo: 'auth_error' });
  assert.equal(leerMensaje('{"message_type":"committed_transcript_with_timestamps"}'), null);
  assert.equal(leerMensaje('no es json'), null);
  assert.equal(leerMensaje('{"text":"sin tipo"}'), null);
  assert.equal(leerMensaje('null'), null);
});
