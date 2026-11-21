import assert from 'node:assert/strict';
import test from 'node:test';
import { consistentCorrection, needsVisualCorrection, visualBay } from './registration';

const outline = [.1,.1,.9,.1,.9,.8,.1,.8];
test('a visual pose can register without a segmentation or dense depth result', () => {
  assert.ok(visualBay(outline));
  assert.equal(visualBay([1,2]), null);
  assert.equal(visualBay(outline.map(x => x+2)), null);
});
test('corrects noticeable drift on the same engine without chasing jitter or another bay', () => {
  const current = visualBay(outline)!;
  assert.equal(needsVisualCorrection(outline.map(x => x+.004), current), false);
  assert.equal(needsVisualCorrection(outline.map(x => x+.04), current), true);
  assert.equal(needsVisualCorrection(outline.map(x => x+2), current), false);
  assert.equal(visualBay(outline.map(x => x+.85), current), null);
  assert.equal(needsVisualCorrection(outline.map(x => x+.004), current, 3), true);
  assert.equal(needsVisualCorrection(outline.map(x => x+.04), current, -4), false);
});

test('requires consecutive corrections of comparable size and direction', () => {
  const right = [.04,0,.04,0,.04,0,.04,0];
  assert.equal(consistentCorrection(right, right), true);
  assert.equal(consistentCorrection(right, right.map(x => -x)), false);
  assert.equal(consistentCorrection(right, right.map(x => x * 3)), false);
  assert.equal(consistentCorrection(null, right), false);
});
