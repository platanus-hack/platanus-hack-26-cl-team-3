import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizarServidor } from './servidor';

test('acepta https y quita espacios y barras finales', () => {
  assert.equal(normalizarServidor('https://ph26.berguecio.cl'), 'https://ph26.berguecio.cl');
  assert.equal(normalizarServidor('  https://hoodini-api.onrender.com/  '), 'https://hoodini-api.onrender.com');
  assert.equal(normalizarServidor('https://host.cl:8443/base//'), 'https://host.cl:8443/base');
});

test('rechaza http', () => {
  assert.equal(normalizarServidor('http://ph26.berguecio.cl'), null);
});

test('rechaza basura y vacío', () => {
  assert.equal(normalizarServidor(''), null);
  assert.equal(normalizarServidor('hola'), null);
  assert.equal(normalizarServidor('https://'), null);
  assert.equal(normalizarServidor('ftp://host.cl'), null);
});

test('rechaza query y hash', () => {
  assert.equal(normalizarServidor('https://host.cl/?a=1'), null);
  assert.equal(normalizarServidor('https://host.cl/#x'), null);
});
