export type AppearancePoint = readonly [number, number];
export type AppearanceRoi = readonly [AppearancePoint, AppearancePoint];
export type ReferenceBank = Readonly<Record<string, readonly Float32Array[]>>;

export type FeatureGrid = {
  readonly columns: number;
  readonly rows: number;
  readonly dimensions: number;
  readonly values: Float32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
};

export type AppearanceCandidate = {
  readonly point: AppearancePoint;
  readonly cell: AppearancePoint;
  readonly score: number;
};

export type AppearanceMatch = {
  readonly scores: Float32Array;
  readonly candidates: readonly AppearanceCandidate[];
};

const NORM_EPSILON = 1e-12;
const PEAK_WEIGHT = 40;
const PEAK_RADIUS_SQUARED = 0.0025;
const PEAK_SPACING_PIXELS = 30;
const SCORE_WIDTH = 1080;
const MASKED_SCORE = -1;
const MAX_CANDIDATES = 3;

function normalizeRow(values: Float32Array, start: number, end: number): void {
  let squaredNorm = 0;
  for (let index = start; index < end; index++) {
    const value = values[index];
    squaredNorm += value * value;
  }
  const divisor = Math.max(Math.sqrt(squaredNorm), NORM_EPSILON);
  for (let index = start; index < end; index++) {
    values[index] /= divisor;
  }
}

/** Normalize individual row-major patch tokens and attach their frame-relative centers. */
export function normalizeFeatureGrid(
  tokens: ArrayLike<number>,
  columns = 48,
  rows = 32,
  dimensions = 384,
): FeatureGrid {
  const shape = [columns, rows, dimensions];
  if (shape.some((size) => !Number.isSafeInteger(size) || size < 1)
    || tokens.length !== columns * rows * dimensions) {
    throw new RangeError('Patch token count does not match the feature grid shape');
  }

  const values = Float32Array.from(tokens);
  const x = new Float32Array(columns * rows);
  const y = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      const offset = cell * dimensions;
      normalizeRow(values, offset, offset + dimensions);
      x[cell] = (column + 0.5) * Math.fround(1 / columns);
      y[cell] = (row + 0.5) * Math.fround(1 / rows);
    }
  }
  return { columns, rows, dimensions, values, x, y };
}

/**
 * Extract a unit descriptor at a normalized frame point. The half-cell offset
 * and zero padding match grid_sample with align_corners disabled.
 */
export function sampleDescriptor(grid: FeatureGrid, point: AppearancePoint): Float32Array {
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('Descriptor coordinates must be finite');
  }
  const { columns, rows, dimensions, values } = grid;
  const column = Math.fround(Math.fround(x) * columns - 0.5);
  const row = Math.fround(Math.fround(y) * rows - 0.5);
  const column0 = Math.floor(column);
  const row0 = Math.floor(row);
  const rightWeight = column - column0;
  const bottomWeight = row - row0;
  const descriptor = new Float32Array(dimensions);

  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const cellColumn = column0 + dx;
      const cellRow = row0 + dy;
      if (cellColumn < 0 || cellColumn >= columns || cellRow < 0 || cellRow >= rows) {
        continue;
      }
      const offset = (cellRow * columns + cellColumn) * dimensions;
      const weight = (dx ? rightWeight : 1 - rightWeight) * (dy ? bottomWeight : 1 - bottomWeight);
      for (let channel = 0; channel < dimensions; channel++) {
        descriptor[channel] += values[offset + channel] * weight;
      }
    }
  }
  normalizeRow(descriptor, 0, dimensions);
  return descriptor;
}

function maximumIndex(scores: Float32Array): number {
  let index = -1;
  let maximum = -Infinity;
  for (let cell = 0; cell < scores.length; cell++) {
    if (scores[cell] > maximum) {
      maximum = scores[cell];
      index = cell;
    }
  }
  return index;
}

/** Refine the peak using the same local softmax as the offline evaluator. */
export function softPeak(
  scores: Float32Array,
  grid: FeatureGrid,
  seedIndex = maximumIndex(scores),
): AppearancePoint | null {
  if (seedIndex < 0 || seedIndex >= grid.x.length || scores[seedIndex] <= MASKED_SCORE) {
    return null;
  }
  const centerX = grid.x[seedIndex];
  const centerY = grid.y[seedIndex];
  const maximum = scores[seedIndex];
  let xSum = 0;
  let ySum = 0;
  let weightSum = 0;

  for (let cell = 0; cell < scores.length; cell++) {
    const dx = grid.x[cell] - centerX;
    const dy = grid.y[cell] - centerY;
    if (dx * dx + dy * dy >= PEAK_RADIUS_SQUARED) {
      continue;
    }
    const weight = Math.exp((scores[cell] - maximum) * PEAK_WEIGHT);
    xSum += weight * grid.x[cell];
    ySum += weight * grid.y[cell];
    weightSum += weight;
  }
  return [xSum / weightSum, ySum / weightSum];
}

/** Take the strongest modes with 30-pixel suppression at a 1080-pixel frame width. */
export function findAppearanceCandidates(
  scores: Float32Array,
  grid: FeatureGrid,
  aspect: number,
): AppearanceCandidate[] {
  if (scores.length !== grid.x.length || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('Appearance scores and frame aspect must match the feature grid');
  }
  const remaining = scores.slice();
  const candidates: AppearanceCandidate[] = [];

  for (let candidate = 0; candidate < MAX_CANDIDATES; candidate++) {
    const index = maximumIndex(remaining);
    const point = softPeak(remaining, grid, index);
    if (!point) {
      break;
    }
    const x = grid.x[index];
    const y = grid.y[index];
    candidates.push({ point, cell: [x, y], score: remaining[index] });

    for (let cell = 0; cell < remaining.length; cell++) {
      const dx = (grid.x[cell] - x) * SCORE_WIDTH;
      const dy = (grid.y[cell] - y) * SCORE_WIDTH * aspect;
      if (dx * dx + dy * dy <= PEAK_SPACING_PIXELS ** 2) {
        remaining[cell] = MASKED_SCORE;
      }
    }
  }
  return candidates;
}

function scoreCell(grid: FeatureGrid, cell: number, descriptors: readonly Float32Array[]): number {
  const { dimensions, values } = grid;
  const offset = cell * dimensions;
  let first = -Infinity;
  let second = -Infinity;
  let third = -Infinity;
  for (const descriptor of descriptors) {
    let score = 0;
    for (let channel = 0; channel < dimensions; channel++) {
      score += values[offset + channel] * descriptor[channel];
    }
    const cosine = Math.fround(score);
    if (cosine > first) {
      third = second;
      second = first;
      first = cosine;
    } else if (cosine > second) {
      third = second;
      second = cosine;
    } else if (cosine > third) {
      third = cosine;
    }
  }
  if (descriptors.length >= 3) return (first + second + third) / 3;
  if (descriptors.length === 2) return (first + second) / 2;
  return first;
}

/** Match normalized per-part descriptors using appearance inside the detected bay. */
export function matchAppearance(
  grid: FeatureGrid,
  aspect: number,
  roi: AppearanceRoi,
  referenceBank: ReferenceBank,
): Record<string, AppearanceMatch> {
  const [[left, top], [right, bottom]] = roi;
  if (![left, right, top, bottom, aspect].every(Number.isFinite) || right < left || bottom < top || aspect <= 0) {
    throw new RangeError('Appearance matching requires valid bounds and frame aspect');
  }

  const inside = new Uint8Array(grid.x.length);
  for (let cell = 0; cell < inside.length; cell++) {
    inside[cell] = Number(grid.x[cell] >= left && grid.x[cell] <= right && grid.y[cell] >= top && grid.y[cell] <= bottom);
  }

  const result: Record<string, AppearanceMatch> = Object.create(null);
  for (const [name, descriptors] of Object.entries(referenceBank)) {
    if (!descriptors.length) continue;
    if (descriptors.some((descriptor) => descriptor.length !== grid.dimensions)) {
      throw new RangeError('Reference descriptor width does not match the feature grid');
    }
    const scores = new Float32Array(inside.length).fill(MASKED_SCORE);
    for (let cell = 0; cell < inside.length; cell++) {
      if (inside[cell]) {
        scores[cell] = scoreCell(grid, cell, descriptors);
      }
    }
    result[name] = { scores, candidates: findAppearanceCandidates(scores, grid, aspect) };
  }
  return result;
}
