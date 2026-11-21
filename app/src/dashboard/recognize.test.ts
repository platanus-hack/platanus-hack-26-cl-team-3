import assert from 'node:assert/strict';
import test from 'node:test';
import descriptors from './descriptors.json';
import { recognizeLight, scanDashboard, type WarningLight } from './recognize';

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

test('locates separated warning lights in a landscape frame', () => {
  const width = 520, height = 240;
  const frame = new Uint8Array(width * height * 4);
  const examples = [
    { id: 'charge' as const, x: 35, y: 150, width: 28 },
    { id: 'fuel' as const, x: 441, y: 55, width: 19 },
  ];
  for (const example of examples) {
    const reference = descriptors[example.id];
    const h = Math.round(example.width / reference.aspect);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < example.width; x++) {
        const stroke = parseInt(reference.rows[Math.floor(y * 12 / h)][Math.floor(x * 16 / example.width)], 16) / 15;
        const offset = ((example.y + y) * width + example.x + x) * 4;
        frame.set([240 * stroke, (example.id === 'fuel' ? 160 : 30) * stroke, 15 * stroke, 255], offset);
      }
    }
  }
  const matches = scanDashboard(frame, width, height);
  assert.equal(matches.length, examples.length);
  for (const example of examples) {
    assert.ok(matches.some(box => box.light === example.id && Math.abs(box.x - example.x) < 4 && Math.abs(box.y - example.y) < 4));
  }
  // A fuel pictogram embedded in an illuminated range readout is not a warning.
  for (let y = 32; y < 100; y++) {
    for (let x = 416; x < 486; x++) {
      if (x < 441 || x >= 460 || y < 55 || y >= 76) frame.set([100, 4, 10, 255], 4 * (y * width + x));
    }
  }
  assert.deepEqual(scanDashboard(frame, width, height).map(match => match.light), ['charge']);
});

test('red display borders without polarity marks are not battery warnings', () => {
  for (const [rx, ry] of [[4, 4], [7, 4], [9, 5]]) {
    const frame = new Uint8Array(110 * 75 * 4);
    for (let y = 0; y < 75; y++) {
      for (let x = 0; x < 110; x++) {
        const edge = Math.max(Math.abs((x - 55) / rx), Math.abs((y - 38) / ry));
        if (edge > 0.6 && edge < 1) frame.set([230, 30, 15, 255], 4 * (y * 110 + x));
      }
    }
    assert.deepEqual(scanDashboard(frame, 110, 75), []);
  }
});
