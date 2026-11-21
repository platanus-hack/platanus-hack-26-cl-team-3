import assert from 'node:assert/strict';
import test from 'node:test';
import descriptors from './descriptors.json';
import { recognizeLight, type WarningLight } from './recognize';

const size = 192;
function paint(image: Uint8Array, x: number, y: number, amber: boolean) {
  image.set([230, amber ? 150 : 30, 15, 255], 4 * (y * size + x));
}

test('rejects unrelated solid amber lamps and frames without a warning', () => {
  for (const ellipse of [false, true]) {
    const frame = new Uint8Array(size * size * 4);
    assert.equal(recognizeLight(frame, size), null);
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 44; x++) {
        if (!ellipse || ((x - 22) / 22) ** 2 + ((y - 24) / 24) ** 2 <= 1) paint(frame, 60 + x, 60 + y, true);
      }
    }
    assert.equal(recognizeLight(frame, size), null);
  }
});

test('recognizes isolated references despite an off-center warm noise pixel', () => {
  for (const id of Object.keys(descriptors) as WarningLight[]) {
    const { rows, aspect } = descriptors[id];
    const frame = new Uint8Array(size * size * 4);
    const width = 96, height = Math.round(width / aspect);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const density = parseInt(rows[Math.floor(y * 12 / height)][Math.floor(x * 16 / width)], 16);
        if ((x + 3 * y) % 15 < density) paint(frame, 48 + x, 30 + y, id === 'fuel');
      }
    }
    paint(frame, 5, 5, false);
    assert.equal(recognizeLight(frame, size), id);
  }
});
