import type { Vano } from '../../detector/vano';
import type { PartId, Volume } from '../catalog';
import type { PartCenter } from '../../../modules/capo-ar';
import type { Point } from './consensus';

const observationByPart: Partial<Record<PartId, string>> = {
  washer: 'washerCap',
  dipstick: 'oilDipstick',
  oil_cap: 'oilFiller',
  brake_cap: 'brakeCap',
  radiator_cap: 'radiatorCap',
  positive: 'batteryPositiveCover',
};

export function insideBay(x: number, y: number, bay: Vano): boolean {
  let inside = false;
  for (const [index, a] of bay.esquinas.entries()) {
    const b = bay.esquinas[(index + 1) % bay.esquinas.length];
    if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

/** Use only landmarks that describe the observed face of the corresponding catalog part. */
export function partCenters(
  volumes: readonly Volume[],
  landmarks: Record<string, Point>,
  bay: Vano,
  aspect: number,
): PartCenter[] {
  return volumes.flatMap(({ part }, index) => {
    const name = observationByPart[part];
    let point = name ? landmarks[name] : undefined;
    if (part === 'fuses') {
      const rear = landmarks.fuseLidRearLeft;
      const front = landmarks.fuseLidFrontRight;
      if (rear && front && Math.hypot(rear[0] - front[0], rear[1] - front[1]) >= 24) {
        point = [(rear[0] + front[0]) / 2, (rear[1] + front[1]) / 2];
      }
    }
    if (!point) return [];
    const x = point[0] / 1080;
    const y = point[1] / (1080 * aspect);
    return (Number.isFinite(x) && Number.isFinite(y) && insideBay(x, y, bay)) ? [[index, x, y] as PartCenter] : [];
  });
}

/** Both photos must place the same part in the same region before it can alter the 3D mesh. */
export function confirmedPartCenters(
  previous: PartCenter[],
  current: PartCenter[],
  bay: Vano,
  aspect: number,
): PartCenter[] {
  const xs = bay.esquinas.map((point) => point.x);
  const ys = bay.esquinas.map((point) => point.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * aspect);
  return current.filter(([part, x, y]) => previous.some(([oldPart, oldX, oldY]) =>
    part === oldPart && Math.hypot(x - oldX, (y - oldY) * aspect) <= .024 * diagonal));
}
