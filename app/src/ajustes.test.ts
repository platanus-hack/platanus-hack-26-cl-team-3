import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAjustes } from './ajustes';

test('parseAjustes accepts valid values', () => {
  assert.deepEqual(parseAjustes('{"modelo":"opus","esfuerzo":"xhigh"}'), { modelo: 'opus', esfuerzo: 'xhigh', vozVivo: false, vozChat: false });
  assert.deepEqual(parseAjustes('{"modelo":"haiku","esfuerzo":null}'), { modelo: 'haiku', esfuerzo: null, vozVivo: false, vozChat: false });
});

test('parseAjustes falls back to defaults on garbage', () => {
  const defecto = { modelo: 'sonnet', esfuerzo: null, vozVivo: false, vozChat: false };
  for (const raw of [null, '', '{no json', 'null', '[]', '{"modelo":"gpt","esfuerzo":"ultra"}', '{"modelo":1}']) {
    assert.deepEqual(parseAjustes(raw), defecto, String(raw));
  }
});

test('parseAjustes validates each field independently', () => {
  assert.deepEqual(parseAjustes('{"modelo":"opus","esfuerzo":"ultra"}'), { modelo: 'opus', esfuerzo: null, vozVivo: false, vozChat: false });
});

test('9: vozVivo es false sin el campo, respeta un booleano e ignora otros valores', () => {
  assert.equal(parseAjustes('{"modelo":"opus","esfuerzo":null}').vozVivo, false);
  assert.equal(parseAjustes('{"vozVivo":true}').vozVivo, true);
  assert.equal(parseAjustes('{"vozVivo":false}').vozVivo, false);
  for (const raw of [null, '{no json', '{"vozVivo":"true"}', '{"vozVivo":1}', '{"vozVivo":null}']) {
    assert.equal(parseAjustes(raw).vozVivo, false, String(raw));
  }
});

test('F2-1/2: vozChat es false sin el campo, respeta un booleano e ignora otros valores', () => {
  assert.equal(parseAjustes('{"modelo":"opus"}').vozChat, false);
  assert.equal(parseAjustes('{"vozChat":true}').vozChat, true);
  assert.equal(parseAjustes('{"vozChat":false,"vozVivo":true}').vozChat, false);
  assert.equal(parseAjustes('{"vozChat":true,"vozVivo":false}').vozVivo, false);
  for (const raw of [null, '{no json', '{"vozChat":"true"}', '{"vozChat":1}', '{"vozChat":null}']) {
    assert.equal(parseAjustes(raw).vozChat, false, String(raw));
  }
});
