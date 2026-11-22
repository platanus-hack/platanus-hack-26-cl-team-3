import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stageTitle } from './guide';
import type { ViewCard } from './history';

test('the fixed stage title depends on guide metadata and ignores assistant wording', () => {
  const open: ViewCard = { part: 'fuses', action: 'open', instruction: 'First assistant wording.' };
  assert.equal(stageTitle(open), 'Abrir la tapa');
  assert.equal(stageTitle({ ...open, instruction: 'Different wording.' }), stageTitle(open));
  assert.equal(stageTitle({ ...open, action: undefined }), 'Ubicar la caja de fusibles');
  assert.equal(stageTitle({ ...open, action: undefined, fuseTargets: [{ box: 'motor', numbers: [5], instruction: 'Check the right low beam.' }] }), 'Ver el fusible en el plano');
});
