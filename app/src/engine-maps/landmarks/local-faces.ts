import faceTemplates from '../outback-face-templates.json';
import { iouPoligonos } from '../../detector/vano';
import type { AppearanceRoi, FeatureGrid } from './appearance';
import type { Point } from './consensus';
import { faceDescriptorSampler } from './face-descriptors';

const localParts = ['coolant', 'air_filter', 'battery'] as const;
type LocalPart = typeof localParts[number];
type FaceTemplate = typeof faceTemplates[number]['parts'][LocalPart];
type Sampler = ReturnType<typeof faceDescriptorSampler>;

const horizontalScales = [.70, .88, 1.06, 1.24];
const verticalScales = [.67, .9, 1.12, 1.34];
const angles = [-16, -8, 0, 8, 16].map((degrees) => degrees * Math.PI / 180);
const translations: Point[] = [];
for (let x = -6; x <= 6; x++) {
  for (let y = -5; y <= 5; y++) {
    const dx = x / 6;
    const dy = y / 5;
    if (dx * dx + dy * dy <= 1.26) translations.push([dx, dy]);
  }
}

function findSeed(
  grid: FeatureGrid, sampler: Sampler, descriptor: number[], inBand: (x: number, y: number) => boolean,
): Point | null {
  const field = sampler.field(descriptor);
  const scores = new Float32Array(grid.x.length).fill(-Infinity);
  let best = -1;
  for (let cell = 0; cell < scores.length; cell++) {
    if (!inBand(grid.x[cell], grid.y[cell])) continue;
    scores[cell] = sampler.atCell(cell, field);
    if (best < 0 || scores[cell] > scores[best]) best = cell;
  }
  if (best < 0) return null;

  let x = 0;
  let y = 0;
  let mass = 0;
  for (let cell = 0; cell < scores.length; cell++) {
    const dx = grid.x[cell] - grid.x[best];
    const dy = grid.y[cell] - grid.y[best];
    if (dx * dx + dy * dy >= .0025) continue;
    const weight = Math.exp((scores[cell] - scores[best]) * 40);
    x += weight * grid.x[cell];
    y += weight * grid.y[cell];
    mass += weight;
  }
  return [x / mass, y / mass];
}

function scorePose(
  sampler: Sampler,
  face: FaceTemplate,
  contrast: Float32Array,
  appearance: Float32Array[],
  offsets: Point[],
  [x, y]: Point,
): number {
  let foregroundContrast = 0;
  let backgroundContrast = 0;
  let foregroundAppearance = 0;
  let backgroundAppearance = 0;
  for (let i = 0; i < offsets.length; i++) {
    const [dx, dy] = offsets[i];
    const strength = sampler.score(x + dx, y + dy, contrast);
    const match = appearance.length ? sampler.score(x + dx, y + dy, appearance[i]) : 0;
    if (i < face.positive) {
      foregroundContrast += strength;
      foregroundAppearance += match;
    } else {
      backgroundContrast += strength;
      backgroundAppearance += match;
    }
  }
  const negatives = offsets.length - face.positive;
  const separation = foregroundContrast / face.positive - backgroundContrast / negatives;
  return appearance.length
    ? foregroundAppearance / face.positive + .24 * backgroundAppearance / negatives + .52 * separation
    : separation;
}

function fitFace(sampler: Sampler, face: FaceTemplate, seed: Point, scale: number) {
  const radiusX = Math.max(8, .46 * face.span[0] * scale);
  const radiusY = Math.max(8, .61 * face.span[1] * scale);
  const contrast = sampler.field(face.contrast);
  const appearance = face.descriptors.map(sampler.field);
  const centers: Point[] = translations.map(([x, y]) => [seed[0] + x * radiusX, seed[1] + y * radiusY]);
  let best = seed;
  let bestScore = -Infinity;
  let transform = [1, 0, 0, 1];
  for (const xScale of horizontalScales) {
    for (const yScale of verticalScales) {
      for (const angle of angles) {
        const c = Math.cos(angle) * scale;
        const s = Math.sin(angle) * scale;
        const offsets: Point[] = face.offsets.map(([x, y]) => [
          c * xScale * x - s * yScale * y, s * xScale * x + c * yScale * y,
        ]);
        for (const center of centers) {
          const score = scorePose(sampler, face, contrast, appearance, offsets, center);
          if (score > bestScore) {
            best = center;
            bestScore = score;
            transform = [c * xScale, -s * yScale, s * xScale, c * yScale];
          }
        }
      }
    }
  }
  const [a, b, c, d] = transform;
  const outline = face.outline.map(([x, y]) => ({ x: best[0] + a * x + b * y, y: best[1] + c * x + d * y }));
  return { center: best, outline };
}

/** Sample in the shared bounds so agreement on a small face does not depend on its image size. */
export function faceOverlap(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
  const all = a.concat(b);
  const xs = all.map(({ x }) => x);
  const ys = all.map(({ y }) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return 0;
  const normalize = ({ x, y }: { x: number; y: number }) => ({ x: (x - left) / width, y: (y - top) / height });
  return iouPoligonos(a.map(normalize), b.map(normalize));
}

/** Fit foreground and surrounding patches independently against two donor cars. */
export function locateOutbackFaces(
  grid: FeatureGrid, width: number, height: number, [[left, top], [right, bottom]]: AppearanceRoi,
): Partial<Record<LocalPart, Point>> {
  const spanX = right - left;
  const spanY = bottom - top;
  if (spanX <= 0 || spanY <= 0) return {};

  const sampler = faceDescriptorSampler(grid, width, height);
  const [first, second] = faceTemplates;
  const located: Partial<Record<LocalPart, Point>> = {};
  for (const part of localParts) {
    const a = first.parts[part];
    const b = second.parts[part];
    const priorX = (a.center[0] + b.center[0]) / 2;
    const priorY = (a.center[1] + b.center[1]) / 2;
    const inBand = (x: number, y: number) => Math.abs((x - left) / spanX - priorX) <= .125
      && Math.abs((y - top) / spanY - priorY) <= .19;
    const descriptor = a.seed.map((value, i) => (value + b.seed[i]) / 2);
    const seed = findSeed(grid, sampler, descriptor, inBand);
    if (!seed) continue;

    const pixels: Point = [seed[0] * width, seed[1] * height];
    const scale = (source: typeof first) => Math.sqrt(spanX * width * spanY * height / (source.baySpan[0] * source.baySpan[1]));
    const fitA = fitFace(sampler, a, pixels, scale(first));
    const fitB = fitFace(sampler, b, pixels, scale(second));
    const [ax, ay] = fitA.center;
    const [bx, by] = fitB.center;
    const x = (ax + bx) / (2 * width);
    const y = (ay + by) / (2 * height);
    const agrees = part === 'battery' ? faceOverlap(fitA.outline, fitB.outline) >= .60
      : Math.hypot(ax - bx, ay - by) * 1080 / width <= 18;
    if (inBand(x, y) && agrees) located[part] = [x, y];
  }
  return located;
}
