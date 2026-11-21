import { aCuadroCompleto, type Recorte } from '../detector/encuadre';
import { iouPoligonos, vanoValido, type Vano } from '../detector/vano';
import type { Volume } from './catalog';

/** A registration or alignment check needs the entire bay in both the crop and the sensor image. */
export function completeBay(detection: Vano | null, crop: Recorte): Vano | null {
  if (!vanoValido(detection) || detection.cortado) return null;
  const bay = aCuadroCompleto(detection, crop);
  return bay.cortado ? null : bay;
}

const imageBounds = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** For an existing anchor, compare only the portion both outlines could show in this capture. */
export function overlapsPlacedBay(previous: { x: number; y: number }[], candidate: Vano): boolean {
  const iou = iouPoligonos(previous, candidate.esquinas);
  if (iou === 0) return false;
  const priorArea = iouPoligonos(previous, imageBounds);
  const nextArea = iouPoligonos(candidate.esquinas, imageBounds);
  const intersection = iou * (priorArea + nextArea) / (1 + iou);
  return intersection >= .5 * Math.min(priorArea, nextArea);
}

/** Compare both outlines in the current capture, including coverage beyond its edges. */
export function extendsPartialMap(previous: { x: number; y: number }[], candidate: Vano): boolean {
  const area = (points: typeof previous) => Math.abs(points.reduce((sum, a, index) => {
    const b = points[(index + 1) % points.length];
    return sum + a.x * b.y - a.y * b.x;
  }, 0)) / 2;
  const before = area(previous);
  const after = area(candidate.esquinas);
  return before > 0 && after > 1.15 * before && overlapsPlacedBay(previous, candidate);
}

/** Limit displacement relative to the original bay size, including on small or distant targets. */
export function sameRegistrationView(reference: number[], current: number[]): boolean {
  if (reference.length !== 8 || current.length !== 8) return false;
  const width = Math.min(reference[2] - reference[0], reference[6] - reference[4]);
  const height = reference[5] - reference[1];
  return width > 0 && height > 0 && current.every((value, index) => {
    const size = index % 2 === 0 ? width : height;
    return Math.abs(value - reference[index]) <= .08 * size;
  });
}

/**
 * Match the rear and front edges of the reference to a complete bay seen from
 * the front bumper. Sample just inside the silhouette to avoid the rounded
 * corners and the background. Coordinates refer to the original capture.
 *
 * The detector returns a convex hull whose corners are often cut diagonally, so
 * the silhouette is much narrower near its top and bottom than the bay really
 * is. The left and right edges are therefore fitted through the middle of the
 * silhouette, where they follow the fenders, and extended to the two sampled rows.
 */
export function registrationCorners(bay: Vano): number[] {
  if (bay.esquinas.length < 3) return [];
  const vertices = bay.esquinas;
  const top = Math.min(...vertices.map(({ y }) => y));
  const bottom = Math.max(...vertices.map(({ y }) => y));
  if (bottom <= top) return [];

  const span = (y: number): [number, number] | null => {
    const intersections: number[] = [];
    vertices.forEach((a, index) => {
      const b = vertices[(index + 1) % vertices.length];
      if ((a.y > y) !== (b.y > y)) intersections.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
    });
    if (intersections.length < 2) return null;
    const left = Math.min(...intersections);
    const right = Math.max(...intersections);
    return right > left ? [left, right] : null;
  };
  // Least-squares x = slope * y + offset through each side, between 30 % and 70 % of the height.
  const sides: [number, number, number][] = [];
  for (let step = 0; step <= 8; step++) {
    const y = top + (bottom - top) * (.3 + .05 * step);
    const edges = span(y);
    if (edges) sides.push([y, ...edges]);
  }
  const fit = (side: 1 | 2): ((y: number) => number) | null => {
    const n = sides.length;
    const sumY = sides.reduce((sum, row) => sum + row[0], 0);
    const sumX = sides.reduce((sum, row) => sum + row[side], 0);
    const spread = sides.reduce((sum, row) => sum + row[0] * row[0], 0) * n - sumY * sumY;
    if (n < 3 || spread <= 0) return null;
    const slope = (sides.reduce((sum, row) => sum + row[0] * row[side], 0) * n - sumY * sumX) / spread;
    return (y) => slope * y + (sumX - slope * sumY) / n;
  };
  const leftSide = fit(1);
  const rightSide = fit(2);

  const corners: number[] = [];
  for (const row of [.12, .88]) {
    const y = top + (bottom - top) * row;
    const fitted = leftSide && rightSide ? [leftSide(y), rightSide(y)] : null;
    const edges = fitted && fitted[1] > fitted[0] ? fitted : span(y);
    if (!edges) return [];
    const inset = (edges[1] - edges[0]) * .04;
    corners.push(edges[0] + inset, y, edges[1] - inset, y);
  }
  return corners;
}

/** Native rows are height followed by alternating normalized u and v coordinates. */
export function encodeVolumes(volumes: readonly Volume[]): number[][] {
  return volumes.map(({ height, outline, follows }) => {
    const row = [height, ...outline.flat()];
    if (follows) {
      const source = volumes.findIndex(({ part }) => part === follows);
      if (source < 0) throw new Error(`Unknown refinement source: ${follows}`);
      row.push(-1 - source);
    }
    return row;
  });
}
