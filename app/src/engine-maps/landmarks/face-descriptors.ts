import type { FeatureGrid } from './appearance';

const CHANNELS = 384;

function dot(a: ArrayLike<number>, aStart: number, b: ArrayLike<number>, bStart: number): number {
  let result = 0;
  for (let i = 0; i < CHANNELS; i++) result += a[aStart + i] * b[bStart + i];
  return result;
}

/** Compare a descriptor with a normalized bilinear patch sample using cached scalar products. */
export function faceDescriptorSampler(grid: FeatureGrid, width: number, height: number) {
  const { columns, rows, values } = grid;
  const stride = columns + 2;
  const cells = stride * (rows + 2);
  const padded = new Float32Array(cells * CHANNELS);
  for (let row = 0; row < rows; row++) {
    const source = row * columns * CHANNELS;
    padded.set(values.subarray(source, source + columns * CHANNELS), ((row + 1) * stride + 1) * CHANNELS);
  }

  // Norm of a weighted sum requires four squared norms and six pairwise products.
  const products = new Float64Array(cells * 10);
  const corners = [0, 1, stride, stride + 1];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const cell = row * stride + col;
      let pair = cell * 10;
      for (let i = 0; i < 4; i++) {
        for (let j = i; j < 4; j++) {
          const a = (cell + corners[i]) * CHANNELS;
          const b = (cell + corners[j]) * CHANNELS;
          products[pair++] = dot(padded, a, padded, b) * (i === j ? 1 : 2);
        }
      }
    }
  }

  function field(descriptor: readonly number[]): Float32Array {
    const result = new Float32Array(cells);
    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= columns; col++) {
        const cell = row * stride + col;
        result[cell] = dot(padded, cell * CHANNELS, descriptor, 0);
      }
    }
    return result;
  }

  function score(x: number, y: number, similarity: Float32Array): number {
    const u = Math.fround(Math.fround(x / width) * columns - .5) + 1;
    const v = Math.fround(Math.fround(y / height) * rows - .5) + 1;
    const col = Math.floor(u);
    const row = Math.floor(v);
    if (col < 0 || row < 0 || col > columns || row > rows) return 0;

    const cell = row * stride + col;
    const dx = u - col;
    const dy = v - row;
    const a = (1 - dx) * (1 - dy);
    const b = dx * (1 - dy);
    const c = (1 - dx) * dy;
    const d = dx * dy;
    const p = cell * 10;
    const squaredNorm = a * (products[p] * a + products[p + 1] * b + products[p + 2] * c + products[p + 3] * d)
      + b * (products[p + 4] * b + products[p + 5] * c + products[p + 6] * d)
      + c * (products[p + 7] * c + products[p + 8] * d) + d * products[p + 9] * d;
    // Opposing patches can cancel; a nearly zero direction is not usable appearance evidence.
    if (!(squaredNorm > 1e-8)) return 0;
    const numerator = a * similarity[cell] + b * similarity[cell + 1]
      + c * similarity[cell + stride] + d * similarity[cell + stride + 1];
    return numerator / Math.sqrt(squaredNorm);
  }

  function atCell(cell: number, similarity: Float32Array): number {
    return similarity[(Math.floor(cell / columns) + 1) * stride + cell % columns + 1];
  }

  return { field, score, atCell };
}
