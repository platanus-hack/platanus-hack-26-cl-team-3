import assert from 'node:assert/strict';
import { test } from 'node:test';

import { separarEventos } from './sse';

test('separa eventos completos y deja el resto para la próxima lectura', () => {
  const buffer =
    'event: herramienta\ndata: {"nombre":"consultar_fusibles"}\n\n' +
    'event: texto\ndata: {"bloque":0,"texto":"Apaga el contacto."}\n\n' +
    'event: cita\ndata: {"bloque":0,"titulo":"Tabla","fuente":"f","texto_citado":"Fusible 11"}\n\n' +
    'event: fin\ndata: {"mens';
  const { eventos, resto } = separarEventos(buffer);
  assert.deepEqual(eventos, [
    { tipo: 'herramienta', nombre: 'consultar_fusibles' },
    { tipo: 'texto', bloque: 0, texto: 'Apaga el contacto.' },
    { tipo: 'cita', bloque: 0, titulo: 'Tabla', fuente: 'f', texto_citado: 'Fusible 11' },
  ]);
  assert.equal(resto, 'event: fin\ndata: {"mens');
});

test('traduce fin y error, e ignora eventos desconocidos o JSON roto', () => {
  const buffer =
    'event: fin\ndata: {"mensajes":[{"role":"assistant","content":"ok"}]}\n\n' +
    'event: raro\ndata: {}\n\n' +
    'event: texto\ndata: {roto\n\n' +
    'event: error\ndata: {"codigo":"credito","mensaje":"Sin crédito"}\n\n';
  const { eventos, resto } = separarEventos(buffer);
  assert.deepEqual(eventos, [
    { tipo: 'fin', mensajes: [{ role: 'assistant', content: 'ok' }] },
    { tipo: 'error', codigo: 'credito', mensaje: 'Sin crédito' },
  ]);
  assert.equal(resto, '');
});
