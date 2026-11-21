import type { PartCenter } from '../../../modules/capo-ar';
import type { Vano } from '../../detector/vano';
import type { Volume } from '../catalog';
import referenceData from '../outback-reference-bank.json';
import { matchAppearance, normalizeFeatureGrid } from './appearance';
import { locate, type Candidates, type Point, type Reference } from './consensus';
import { partCenters } from './part-centers';

const references: Reference[] = referenceData.references.map(({ file, width, points }) => ({
  file,
  width,
  points: Object.fromEntries(Object.entries(points).map(([name, point]) =>
    [name, point?.length === 2 ? [point[0], point[1]] as Point : null])),
}));
const bank = Object.fromEntries(Object.entries(referenceData.descriptors).map(([name, rows]) => [
  name, rows.map((row) => Float32Array.from(row)),
]));

/** Confirm catalog part centers in the coordinate system of a complete upright capture. */
export function solveOutbackParts(
  features: Float32Array, width: number, height: number, bay: Vano, volumes: readonly Volume[],
): PartCenter[] {
  if (bay.cortado) return [];
  const xs = bay.esquinas.map((q) => q.x);
  const ys = bay.esquinas.map((q) => q.y);
  const bounds: [Point, Point] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  const aspect = height / width;
  const hypotheses = Object.fromEntries(Object.entries(matchAppearance(normalizeFeatureGrid(features), aspect, bounds, bank))
    .flatMap(([name, match]) => match.candidates.length === 3
      ? [[name, match.candidates.map(({ point }) => [point[0], point[1]] as Point)]]
      : []));
  const candidates: Candidates = {
    hypotheses,
    appearance: Object.fromEntries(Object.entries(hypotheses).map(([name, points]) => [name, points[0]])),
  };
  const fit = locate(references, { width, height, detector_bounds: bounds }, candidates);
  return fit ? partCenters(volumes, fit.landmarks, bay, aspect) : [];
}
