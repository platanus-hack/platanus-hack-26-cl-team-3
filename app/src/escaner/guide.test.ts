import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GuiaAR } from '../../modules/capo-ar';
import { arrowPlacement, formatDistance, initialFound, nextFound, type FoundState } from './guide';

const event = (over: Partial<GuiaAR> = {}): GuiaAR => ({ part: 2, x: 0.5, y: 0.5, visible: true, distance: 1, ...over });
const centered = event();
const off = event({ x: 0.9 });

const run = (state: FoundState, events: GuiaAR[]) => {
  let current = state;
  const flags: boolean[] = [];
  for (const e of events) {
    const result = nextFound(current, e);
    current = result.state;
    flags.push(result.justFound);
  }
  return { state: current, flags };
};

const even = { left: 56, top: 56, right: 344, bottom: 744 };

test('places the arrow on the edge facing the part and points at it', () => {
  const right = arrowPlacement({ x: 1.6, y: 0.5 }, 400, 800, even);
  assert.equal(right.left, 344);
  assert.equal(right.top, 400);
  assert.equal(right.rotation, 0);

  const left = arrowPlacement({ x: -0.6, y: 0.5 }, 400, 800, even);
  assert.equal(left.left, 56);
  assert.equal(left.rotation, 180);

  const up = arrowPlacement({ x: 0.5, y: -0.4 }, 400, 800, even);
  assert.equal(up.top, 56);
  assert.equal(up.left, 200);
  assert.equal(up.rotation, -90);

  const down = arrowPlacement({ x: 0.5, y: 1.4 }, 400, 800, even);
  assert.equal(down.top, 744);
  assert.equal(down.rotation, 90);
});

test('keeps the arrow clear of the top and bottom bars with an uneven frame', () => {
  const frame = { left: 56, top: 224, right: 344, bottom: 480 };
  assert.equal(arrowPlacement({ x: 0.5, y: -0.4 }, 400, 800, frame).top, 224);
  assert.equal(arrowPlacement({ x: 0.5, y: 1.4 }, 400, 800, frame).top, 480);
  const diagonal = arrowPlacement({ x: 1.5, y: 1.5 }, 400, 800, frame);
  assert.equal(diagonal.top, 480);
  assert.equal(diagonal.left, 240);
});

test('keeps the arrow inside the frame on a tall view and computes the angle in pixels', () => {
  const width = 400;
  const height = 800;
  const inset = 56;
  const placement = arrowPlacement({ x: 1.5, y: 1.5 }, width, height, { left: inset, top: inset, right: width - inset, bottom: height - inset });
  assert.ok(placement.left >= inset && placement.left <= width - inset);
  assert.ok(placement.top >= inset && placement.top <= height - inset);
  assert.equal(placement.left, width - inset);
  assert.ok(Math.abs(placement.top - (400 + 144 * (400 / 200))) < 1e-9);
  const expected = (Math.atan2(800, 400) * 180) / Math.PI;
  assert.ok(Math.abs(placement.rotation - expected) < 1e-9);
  assert.notEqual(Math.round(placement.rotation), 45);
});

test('marks found once after 3 centered events in a row, not after 2', () => {
  const two = run(initialFound, [centered, centered]);
  assert.equal(two.state.found, false);
  assert.deepEqual(two.flags, [false, false]);

  const four = run(initialFound, [centered, centered, centered, centered]);
  assert.equal(four.state.found, true);
  assert.deepEqual(four.flags, [false, false, true, false]);
});

test('once found, 4 misses keep it and the fifth releases it', () => {
  const found = run(initialFound, [centered, centered, centered]).state;
  assert.equal(found.found, true);
  const four = run(found, [off, off, off, off]);
  assert.equal(four.state.found, true);
  const five = run(found, [off, off, off, off, off]);
  assert.equal(five.state.found, false);
  const reset = run(found, [off, off, off, off, centered, off, off, off, off]);
  assert.equal(reset.state.found, true);
});

test('an event for another part resets the streak', () => {
  const partial = run(initialFound, [centered, centered]).state;
  const other = run(partial, [event({ part: 3 })]);
  assert.equal(other.state.part, 3);
  assert.equal(other.state.hits, 1);
  const back = run(other.state, [centered, centered]);
  assert.equal(back.state.found, false);
  assert.deepEqual(back.flags, [false, false]);
});

test('formats the distance in centimeters and meters', () => {
  assert.equal(formatDistance(0.45), '45 cm');
  assert.equal(formatDistance(0.95), '95 cm');
  assert.equal(formatDistance(1.23), '1,2 m');
  assert.equal(formatDistance(0.01), '5 cm');
  assert.equal(formatDistance(0.98), '1,0 m');
});
