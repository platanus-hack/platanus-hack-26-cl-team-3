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

/** Projected model corners may extend beyond the image during a close-up. */
export function visualBay(outline?: number[], detected?: Vano | null): Vano | null {
  if (outline?.length !== 8 || !outline.every(Number.isFinite)) return null;
  const esquinas = [0, 2, 4, 6].map(i => {
    const x = outline[i], y = outline[i + 1];
    return { x, y, borde: x < 0 || x > 1 || y < 0 || y > 1 };
  });
  const area = iouPoligonos(esquinas, imageBounds);
  const bay = { esquinas, area, confianza: 1, cortado: esquinas.some(p => p.borde) };
  return area > 0 && (!detected || overlapsPlacedBay(esquinas, detected)) ? bay : null;
}

/** Compare corresponding corners in one capture, with distances relative to the visible image. */
export function consistentCorrection(previous: number[] | null, current: number[] | null): boolean {
  if (!previous || !current || previous.length !== 8 || current.length !== 8) return false;
  const agreement = previous.reduce((sum, value, i) => sum + value * current[i], 0);
  const length = Math.hypot(...current);
  const priorLength = Math.hypot(...previous);
  return agreement > .8 * length * priorLength && length < 2 * priorLength && priorLength < 2 * length;
}

export function needsVisualCorrection(registered: number[] | undefined, current: Vano, landmarkGainPx?: number): boolean {
  if (registered?.length !== 8 || !overlapsPlacedBay([0,2,4,6].map(i => ({x: registered[i], y: registered[i+1]})), current)) return false;
  if (landmarkGainPx !== undefined) return landmarkGainPx >= 2;
  const errors = current.esquinas.map(({x,y}, i) => Math.hypot(x-registered[2*i], y-registered[2*i+1])).sort((a,b) => a-b);
  return (errors[1] + errors[2]) / 2 > .02;
}

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
 */
export function registrationCorners(bay: Vano): number[] {
  if (bay.esquinas.length < 3) return [];
  const vertices = bay.esquinas;
  const top = Math.min(...vertices.map(({ y }) => y));
  const bottom = Math.max(...vertices.map(({ y }) => y));
  if (bottom <= top) return [];

  const corners: number[] = [];
  for (const row of [.12, .88]) {
    const y = top + (bottom - top) * row;
    const intersections: number[] = [];
    vertices.forEach((a, index) => {
      const b = vertices[(index + 1) % vertices.length];
      if ((a.y > y) !== (b.y > y)) intersections.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
    });
    if (intersections.length < 2) return [];
    const left = Math.min(...intersections);
    const right = Math.max(...intersections);
    const inset = (right - left) * .04;
    if (right <= left) return [];
    corners.push(left + inset, y, right - inset, y);
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
