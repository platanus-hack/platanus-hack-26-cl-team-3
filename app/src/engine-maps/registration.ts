import type { Vano } from '../detector/vano';
import type { Volume } from './catalog';

/**
 * Match the rear and front edges of the reference to a complete bay seen from
 * the front bumper. Sample just inside the silhouette to avoid the rounded
 * corners and the background. Coordinates refer to the original capture.
 */
export function registrationCorners(bay: Vano): number[] {
  if (bay.cortado || bay.esquinas.length < 3) return [];
  const vertices = bay.esquinas;
  const top = Math.min(...vertices.map(({ y }) => y));
  const bottom = Math.max(...vertices.map(({ y }) => y));
  if (bottom - top < .08) return [];

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
    if (right - left < .08) return [];
    corners.push(left + inset, y, right - inset, y);
  }
  return corners;
}

/** Native rows are height followed by alternating normalized u and v coordinates. */
export function encodeVolumes(volumes: readonly Volume[]): number[][] {
  return volumes.map(({ height, outline }) => [height, ...outline.flat()]);
}
