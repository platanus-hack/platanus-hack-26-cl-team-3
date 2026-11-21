import type { PartCenter } from '../../../modules/capo-ar';
import type { Vano } from '../../detector/vano';
import type { Volume } from '../catalog';
import referenceData from '../outback-reference-bank.json';
import { matchAppearance, normalizeFeatureGrid } from './appearance';
import { locate, type Candidates, type Point, type Reference } from './consensus';
import { locateOutbackFaces } from './local-faces';
import { insideBay, partCenters } from './part-centers';

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
  const xs = bay.esquinas.map((q) => q.x);
  const ys = bay.esquinas.map((q) => q.y);
  const bounds: [Point, Point] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  const aspect = height / width;
  const grid = normalizeFeatureGrid(features);
  const hypotheses = Object.fromEntries(Object.entries(matchAppearance(grid, aspect, bounds, bank))
    .flatMap(([name, match]) => match.candidates.length === 3
      ? [[name, match.candidates.map(({ point }) => [point[0], point[1]] as Point)]]
      : []));
  const candidates: Candidates = {
    hypotheses,
    appearance: Object.fromEntries(Object.entries(hypotheses).map(([name, points]) => [name, points[0]])),
  };
  const fit = locate(references, { width, height, detector_bounds: bounds }, candidates);
  if (!fit) return [];
  const centers = partCenters(volumes, fit.landmarks, bay, aspect);
  if (centers.length < 2) return centers;

  const faces = locateOutbackFaces(grid, width, height, bounds);
  volumes.forEach(({ part }, index) => {
    if (part !== 'coolant' && part !== 'air_filter' && part !== 'battery') return;
    const center = faces[part];
    if (center && insideBay(center[0], center[1], bay)) centers.push([index, ...center]);
  });
  return centers;
}
