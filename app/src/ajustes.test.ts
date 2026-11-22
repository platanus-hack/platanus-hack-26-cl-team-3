import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAjustes } from './ajustes';

test('parseAjustes accepts valid values', () => {
  assert.deepEqual(parseAjustes('{"modelo":"opus","esfuerzo":"xhigh"}'), { modelo: 'opus', esfuerzo: 'xhigh' });
  assert.deepEqual(parseAjustes('{"modelo":"haiku","esfuerzo":null}'), { modelo: 'haiku', esfuerzo: null });
});

test('parseAjustes falls back to defaults on garbage', () => {
  const defecto = { modelo: 'sonnet', esfuerzo: null };
  for (const raw of [null, '', '{no json', 'null', '[]', '{"modelo":"gpt","esfuerzo":"ultra"}', '{"modelo":1}']) {
    assert.deepEqual(parseAjustes(raw), defecto, String(raw));
  }
});

test('parseAjustes validates each field independently', () => {
  assert.deepEqual(parseAjustes('{"modelo":"opus","esfuerzo":"ultra"}'), { modelo: 'opus', esfuerzo: null });
});
