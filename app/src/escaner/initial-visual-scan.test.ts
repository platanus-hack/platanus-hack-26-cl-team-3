import assert from 'node:assert/strict';
import test from 'node:test';
import { visualBay } from '../engine-maps/registration';
import { baseline, InitialVisualScan, MIN_BASELINE_M } from './initial-visual-scan';

const outline = [.1, .1, .4, .1, .4, .4, .1, .4];
const elsewhere = outline.map(n => n + .5);
const target = visualBay(outline)!;
const sample = (id: number, x: number, reference: string | undefined = 'a', visual = true, camaraRef?: number[]) => ({
  capture: {
    id, captureReference: reference, visualLandmarks: 0, camaraRef,
    visualReferenceCorners: [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1].map((v, i) => i % 3 === 0 ? v + x : v),
    previousVisualOutlines: Object.fromEntries(Array.from({ length: id - 1 }, (_, i) => [i + 1, outline])),
  },
  visual,
});

test('selects the original exposure of a corroborated pose despite a bad latest observation', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  assert.equal(scan.select(0, 200, sample(1, .8), target), undefined);
  const correct = sample(2, .01);
  assert.equal(scan.select(500, 800, correct, target), undefined);
  assert.equal(scan.select(1800, 1850, sample(3, .02), target), undefined);
  assert.equal(scan.select(2070, 2150, sample(4, .68), target), correct);
});

test('a pan away, an unrelated bay or missing reference cannot commit an older observation', () => {
  for (const mode of ['missing', 'mismatch', 'unknown', 'replacement']) {
    const scan = new InitialVisualScan<ReturnType<typeof sample>>();
    scan.select(0, 100, sample(1, .01), target);
    scan.select(1200, 1300, sample(2, .01), target);
    if (mode === 'missing') {
      assert.equal(scan.select(2800, 2900), undefined);
      continue;
    }
    const current = sample(3, .01, 'a', false);
    if (mode === 'mismatch') current.capture.previousVisualOutlines = { 1: elsewhere, 2: elsewhere };
    if (mode === 'unknown') current.capture.captureReference = undefined;
    if (mode === 'replacement') current.capture.captureReference = 'b';
    assert.equal(scan.select(2800, 2900, current, target), mode === 'mismatch' ? current : undefined);
  }
});

test('a brief miss clears the vote but allows current fallback when the deadline expires', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  scan.select(0, 100, sample(1, .01), target);
  assert.equal(scan.select(1800, 1850), undefined);
  const current = sample(3, .7, 'a', false);
  assert.equal(scan.select(2740, 2800, current, target), current);
});

test('long empty intervals, a paused loop and explicit resets start a fresh acquisition', () => {
  for (const mode of ['empty', 'paused', 'reset']) {
    const scan = new InitialVisualScan<ReturnType<typeof sample>>();
    scan.select(0, 500, sample(1, .01), target);
    if (mode === 'empty') {
      scan.select(1600, 1700);
      scan.select(3400, 3500);
    }
    if (mode === 'reset') scan.reset();
    assert.equal(scan.select(3900, 4100, sample(4, .01), target), undefined);
  }
});

test('a slow first viable inference counts towards the bounded fallback', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  assert.equal(scan.select(0, 90), undefined);
  const current = sample(2, .7, 'a', false);
  assert.equal(scan.select(10000, 13000, current, target), current);
});

test('evicted captures, missing projection and discarded visual frames cannot win', () => {
  for (const mode of ['expired', 'discarded', 'unprojected']) {
    const scan = new InitialVisualScan<ReturnType<typeof sample>>();
    scan.select(0, 100, sample(1, .01), target);
    if (mode === 'discarded') scan.discard(1);
    const current = sample(mode === 'expired' ? 9 : 2, 0, 'a', false);
    if (mode === 'unprojected') current.capture.previousVisualOutlines = {};
    assert.equal(scan.select(2800, 2801, current, target), current);
  }
});

test('an isolated historical visual fit cannot replace the current fallback at timeout', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  scan.select(0, 40, sample(1, .02), target);
  const current = sample(2, .02, 'a', false);
  assert.equal(scan.select(2730, 2770, current, target), current);
});

test('two agreeing poses from cameras that moved enough commit at once, without waiting for the minimum scan time', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  assert.equal(scan.select(0, 100, sample(1, .01, 'a', true, [0, 0, 0]), target), undefined);
  const second = sample(2, .02, 'a', true, [MIN_BASELINE_M + .03, 0, 0]);
  const chosen = scan.select(400, 500, second, target);
  assert.ok(chosen, 'se fija sin esperar 2 s');
});

test('agreeing poses from almost the same viewpoint are not depth evidence and still wait', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  scan.select(0, 100, sample(1, .01, 'a', true, [0, 0, 0]), target);
  assert.equal(scan.select(400, 500, sample(2, .02, 'a', true, [.02, 0, 0]), target), undefined);
  assert.equal(scan.select(1000, 1100, sample(3, .01, 'a', true, [.03, .01, 0]), target), undefined);
});

test('moving the camera while the poses disagree does not count as corroboration', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  scan.select(0, 100, sample(1, 0, 'a', true, [0, 0, 0]), target);
  assert.equal(scan.select(400, 500, sample(2, .5, 'a', true, [.3, 0, 0]), target), undefined);
});

test('the movement progress counts every frame of the bay, even without a visual pose, and restarts with the scan', () => {
  const scan = new InitialVisualScan<ReturnType<typeof sample>>();
  assert.equal(scan.progress().baseline, 0);
  scan.select(0, 100, sample(1, 0, 'a', false, [0, 0, 0]), target);
  scan.select(300, 400, sample(2, 0, 'a', false, [.05, 0, 0]), target);
  scan.select(600, 700, sample(3, 0, 'a', false, [.05, .08, 0]), target);
  const progress = scan.progress();
  assert.ok(progress.baseline > .09 && progress.baseline < .1, String(progress.baseline));
  assert.equal(progress.target, MIN_BASELINE_M);
  scan.reset();
  assert.equal(scan.progress().baseline, 0);
});

test('a missing camera position is no movement', () => {
  assert.equal(baseline(undefined, [0, 0, 0]), 0);
  assert.equal(baseline([0, 0, 0], [3, 4, 0]), 5);
  assert.equal(baseline([0, 0, 0], [NaN, 0, 0]), 0);
});
