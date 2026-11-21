export type Point = [number, number];
type Locations = Record<string, Point>;

export type Reference = {
  file: string;
  width: number;
  points: Record<string, Point | null>;
};

export type Target = {
  width: number;
  height: number;
  detector_bounds: [Point, Point];
};

export type Candidates = {
  appearance: Locations;
  hypotheses: Record<string, Point[]>;
};

type Affine = [Point, Point, Point];
type Match = { name: string; source: Point; point: Point; rank: number };
type Fit = { reference: Reference; matches: Match[]; loss: number };

const squaredDistance = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const toScale = (p: Point, x: number, y = x): Point => [p[0] * x, p[1] * y];
const toTargetPixels = (p: Point, target: Target) => toScale(p, 1080, 1080 * target.height / target.width);

function* combinations(items: number, choose: number, from = 0, prefix: number[] = []): Generator<number[]> {
  if (choose === 0) {
    yield prefix;
    return;
  }
  for (let i = from; i <= items - choose; i += 1) yield* combinations(items, choose - 1, i + 1, [...prefix, i]);
}

function solve(coefficients: number[][], values: number[]): number[] | null {
  const size = values.length;
  const rows = coefficients.map((row, i) => [...row, values[i]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let i = column + 1; i < size; i += 1) {
      if (Math.abs(rows[i][column]) > Math.abs(rows[pivot][column])) pivot = i;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const magnitude = rows[column][column];
    for (let j = column; j <= size; j += 1) rows[column][j] /= magnitude;
    for (let i = 0; i < size; i += 1) {
      if (i === column) continue;
      const factor = rows[i][column];
      for (let j = column; j <= size; j += 1) rows[i][j] -= factor * rows[column][j];
    }
  }
  return rows.map((row) => row[size]);
}

function leastSquares(rows: number[][], outputs: number[]): number[] | null {
  const size = rows[0].length;
  const gram = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhs = Array<number>(size).fill(0);
  for (const [sample, row] of rows.entries()) {
    for (let i = 0; i < size; i += 1) {
      rhs[i] += row[i] * outputs[sample];
      for (let j = 0; j < size; j += 1) gram[i][j] += row[i] * row[j];
    }
  }
  return solve(gram, rhs);
}

function imagePoint(p: Point, transform: Affine): Point {
  const [x, y] = p;
  const [u, v, offset] = transform;
  return [u[0] * x + v[0] * y + offset[0], u[1] * x + v[1] * y + offset[1]];
}

function tripleFit([a, b, c]: Point[], [x, y, z]: Point[], determinant: number): Affine {
  const u: Point = [0, 0];
  const v: Point = [0, 0];
  const offset: Point = [0, 0];
  for (const axis of [0, 1] as const) {
    u[axis] = ((y[axis] - x[axis]) * (c[1] - a[1]) - (z[axis] - x[axis]) * (b[1] - a[1])) / determinant;
    v[axis] = ((z[axis] - x[axis]) * (b[0] - a[0]) - (y[axis] - x[axis]) * (c[0] - a[0])) / determinant;
    offset[axis] = x[axis] - u[axis] * a[0] - v[axis] * a[1];
  }
  return [u, v, offset];
}

function assign(transform: Affine, source: { name: string; point: Point; alternatives: Point[] }[]) {
  let loss = 0;
  const matches: Match[] = [];
  for (const entry of source) {
    const expected = imagePoint(entry.point, transform);
    let best = Infinity;
    let distance = Infinity;
    let rank = 0;
    for (const [i, point] of entry.alternatives.entries()) {
      const residual = squaredDistance(point, expected);
      const cost = residual + 36 * i;
      if (cost >= best) continue;
      best = cost;
      distance = residual;
      rank = i;
    }
    loss += Math.min(best, 625);
    if (distance <= 625) matches.push({ name: entry.name, source: entry.point, point: entry.alternatives[rank], rank });
  }
  return { matches, loss };
}

function span(points: Point[], axis: 0 | 1): number {
  const values = points.map((point) => point[axis]);
  return Math.max(...values) - Math.min(...values);
}

function fit(reference: Reference, target: Target, candidates: Candidates): Fit | null {
  const source = Object.entries(reference.points).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .flatMap(([name, point]) => point && candidates.hypotheses[name]?.length === 3 ? [{
      name,
      point: toScale(point, 1080 / reference.width),
      alternatives: candidates.hypotheses[name].map((peak) => toTargetPixels(peak, target)),
    }] : []);
  const minimum = Math.max(6, Math.ceil(.55 * source.length));
  if (source.length < minimum) return null;
  let best: { transform: Affine; support: number; loss: number } | undefined;
  for (const indices of combinations(source.length, 3)) {
    const [a, b, c] = indices.map((i) => source[i].point);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 4000) continue;
    for (const x of source[indices[0]].alternatives) {
      for (const y of source[indices[1]].alternatives) {
        for (const z of source[indices[2]].alternatives) {
          const transform = tripleFit([a, b, c], [x, y, z], area);
          const [[ax, ay], [bx, by]] = transform;
          const determinant = ax * by - ay * bx;
          if (determinant <= .06 || determinant >= 10 || ax ** 2 + ay ** 2 + bx ** 2 + by ** 2 >= 25) continue;
          const score = assign(transform, source);
          const support = score.matches.length;
          if (!best || support > best.support || (support === best.support && score.loss < best.loss)) {
            best = { transform, support, loss: score.loss };
          }
        }
      }
    }
  }
  if (!best || best.support < minimum) return null;
  let transform = best.transform;
  for (let i = 0; i < 2; i += 1) {
    const { matches } = assign(transform, source);
    if (matches.length < minimum) return null;
    const rows = matches.map(({ source: [x, y] }) => [x, y, 1]);
    const x = leastSquares(rows, matches.map(({ point }) => point[0]));
    const y = leastSquares(rows, matches.map(({ point }) => point[1]));
    if (!x || !y) return null;
    transform = [[x[0], y[0]], [x[1], y[1]], [x[2], y[2]]];
  }
  const { matches, loss } = assign(transform, source);
  const ambiguous = new Set<number>();
  for (const [a, b] of combinations(matches.length, 2)) {
    if (squaredDistance(matches[a].point, matches[b].point) < 196 &&
        squaredDistance(matches[a].source, matches[b].source) > 1600) {
      ambiguous.add(a);
      ambiguous.add(b);
    }
  }
  const accepted = matches.filter((_, i) => !ambiguous.has(i));
  if (accepted.length < minimum) return null;
  const points = accepted.map(({ point }) => point);
  const bounds = target.detector_bounds.map((point) => toTargetPixels(point, target));
  if (span(points, 0) < .42 * span(bounds, 0) || span(points, 1) < .26 * span(bounds, 1)) return null;
  return { reference, matches: accepted, loss };
}

function homography(matches: Match[]): number[] | null {
  const rows: number[][] = [];
  const outputs: number[] = [];
  for (const { source, point } of matches) {
    const [x, y] = toScale(source, 1 / 1080);
    const [u, v] = toScale(point, 1 / 1080);
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]);
    outputs.push(u, v);
  }
  return matches.length === 4 ? solve(rows, outputs) : leastSquares(rows, outputs);
}

function warp(source: Point, matrix: number[]): Point {
  const [x, y] = toScale(source, 1 / 1080);
  const scale = 1080 / (matrix[6] * x + matrix[7] * y + 1);
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) * scale,
    (matrix[3] * x + matrix[4] * y + matrix[5]) * scale];
}

function stableHomography(controls: Match[]): number[] | null {
  let best: { support: Match[]; loss: number } | undefined;
  for (const indices of combinations(controls.length, 4)) {
    const matrix = homography(indices.map((i) => controls[i]));
    if (!matrix) continue;
    const support: Match[] = [];
    let loss = 0;
    for (const control of controls) {
      const error = squaredDistance(warp(control.source, matrix), control.point);
      if (error < 256) support.push(control);
      loss += Number.isFinite(error) ? Math.min(256, error) : 256;
    }
    if (!best || support.length > best.support.length || (support.length === best.support.length && loss < best.loss)) {
      best = { support, loss };
    }
  }
  return best && best.support.length >= 6 ? homography(best.support) : null;
}

/** Points are normalized screen pixels at a width of 1080. Null means geometry did not corroborate a fit. */
export function locate(references: Reference[], target: Target, candidates: Candidates) {
  const fits = references.flatMap((reference) => fit(reference, target, candidates) ?? []);
  const chosen = fits.sort((a, b) => b.matches.length - a.matches.length || a.loss - b.loss)[0];
  if (!chosen) return null;
  const controls = chosen.matches.filter((match) => match.rank === 0);
  const matrix = stableHomography(controls);
  if (!matrix) return null;
  const verified = controls.filter(({ source, point }) => squaredDistance(warp(source, matrix), point) <= 256);
  if (verified.length < 6) return null;
  const accepted = Object.fromEntries(verified.map(({ name, point }) => [name, point]));
  for (const match of chosen.matches) {
    if (match.rank === 0) continue;
    const expected = warp(match.source, matrix);
    const original = toTargetPixels(candidates.appearance[match.name], target);
    const baselineError = Math.sqrt(squaredDistance(original, expected));
    const trialError = Math.sqrt(squaredDistance(match.point, expected));
    if (trialError <= 28 && trialError + 12 <= baselineError) accepted[match.name] = match.point;
    else if (baselineError <= 28) accepted[match.name] = original;
  }
  return { reference: chosen.reference.file, landmarks: accepted as Locations };
}
