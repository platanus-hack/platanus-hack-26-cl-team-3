import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fuenteVoz } from './voz';

test('8: codifica el texto en la URL y agrega x-chat-token si existe', () => {
  assert.deepEqual(fuenteVoz('¿Dónde está? 13.5 & más', { apiUrl: 'https://api.test', token: 'secreto' }), {
    uri: `https://api.test/api/speak?text=${encodeURIComponent('¿Dónde está? 13.5 & más')}`,
    headers: { 'x-chat-token': 'secreto' },
  });
  assert.deepEqual(fuenteVoz('hola', { apiUrl: 'https://api.test' }).headers, {});
});
