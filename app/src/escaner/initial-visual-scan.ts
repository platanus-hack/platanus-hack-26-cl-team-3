import type { Vano } from '../detector/vano';
import { visualBay } from '../engine-maps/registration';

type Candidate = {
  capture: {
    id: number;
    captureReference?: string;
    camaraRef?: number[];
    visualReferenceCorners?: number[];
    visualLandmarks?: number;
    previousVisualOutlines?: Record<string, number[]>;
  };
  visual: boolean;
};

const MIN_SCAN_MS = 2000;
const MAX_SCAN_MS = 2750;
// Four corresponding model corners, in metres relative to one ARCore reference.
const MAX_CORNER_RMS = .08;
/**
 * Cuánto tiene que haberse movido la cámara entre dos cuadros para que su acuerdo cuente como prueba de profundidad.
 * Desde un mismo punto de vista, dos poses comparten el mismo error de escala y coinciden aunque estén mal; con un
 * desplazamiento de este orden (a ~1,5 m, unos 5° de paralaje) un error de profundidad ya las separa.
 */
export const MIN_BASELINE_M = .12;

function cornerDistance(a: number[] | undefined, b: number[] | undefined) {
  if (a?.length !== 12 || b?.length !== 12) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / 4);
}

/** Distancia entre dos posiciones de cámara (m); 0 si alguna falta, para que no cuente como movimiento. */
export function baseline(a: number[] | undefined, b: number[] | undefined) {
  if (a?.length !== 3 || b?.length !== 3) return 0;
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return Number.isFinite(d) ? d : 0;
}

export type ScanProgress = { baseline: number; target: number; samples: number };

/** Select an observed capture so its pose, depth and bay still belong to the same exposure. */
export class InitialVisualScan<T extends Candidate> {
  private startedAt?: number;
  private deadline?: number;
  private reference?: string;
  private lastTargetAt?: number;
  private samples: T[] = [];
  private positions: number[][] = []; // cámara de cada cuadro con vano, para medir el movimiento aunque no haya pose visual

  /** Cuánto se ha movido la cámara desde que empezó este escaneo (la mayor distancia entre dos cuadros). */
  progress(): ScanProgress {
    let span = 0;
    for (let i = 0; i < this.positions.length; i++) {
      for (let j = i + 1; j < this.positions.length; j++) span = Math.max(span, baseline(this.positions[i], this.positions[j]));
    }
    return { baseline: span, target: MIN_BASELINE_M, samples: this.samples.length };
  }

  select(start: number, end: number, candidate?: T, target?: Vano): T | undefined {
    // Discard stale intervals caused by a paused inference loop. Analysis time itself counts.
    if (this.lastTargetAt !== undefined && start - this.lastTargetAt > MAX_SCAN_MS) this.reset();
    if (!candidate || !target) {
      this.startedAt = undefined;
      this.samples = [];
      // A brief miss can retain the deadline, but it must never preserve a placement.
      return;
    }
    const { id, captureReference: reference, previousVisualOutlines } = candidate.capture;
    if (this.reference !== reference) {
      this.reset();
      this.reference = reference;
    }
    this.lastTargetAt = end;
    this.startedAt ??= start;
    this.deadline ??= start + MAX_SCAN_MS;
    if (reference && candidate.capture.camaraRef?.length === 3) {
      this.positions.push(candidate.capture.camaraRef);
      if (this.positions.length > 12) this.positions.shift();
    }
    // Native tracks only eight captures. Reproject earlier poses through this exposure's camera.
    this.samples = this.samples.filter(s => id - s.capture.id < 8 && !!reference &&
      !!visualBay(previousVisualOutlines?.[s.capture.id], target));
    if (candidate.visual) this.samples.push(candidate);
    const expired = end >= this.deadline;
    const visual = this.samples;
    let best: T | undefined;
    let mostNeighbors = -1;
    let leastError = Infinity;
    let withParallax: T | undefined;
    let mostParallax = 0;
    for (const sample of visual) {
      let parallax = 0;
      const distances = reference ? visual.filter(other => other !== sample)
        .map(other => {
          const distance = cornerDistance(sample.capture.visualReferenceCorners, other.capture.visualReferenceCorners);
          if (distance <= MAX_CORNER_RMS && baseline(sample.capture.camaraRef, other.capture.camaraRef) >= MIN_BASELINE_M) parallax += 1;
          return distance;
        })
        .filter(distance => distance <= MAX_CORNER_RMS) : [];
      if (parallax > mostParallax) {
        withParallax = sample;
        mostParallax = parallax;
      }
      const error = distances.reduce((sum, distance) => sum + distance, 0);
      const landmarks = sample.capture.visualLandmarks ?? 0;
      if (distances.length > mostNeighbors || (distances.length === mostNeighbors &&
          (error < leastError || (error === leastError && landmarks > (best?.capture.visualLandmarks ?? 0))))) {
        best = sample;
        mostNeighbors = distances.length;
        leastError = error;
      }
    }
    // Dos cuadros que coinciden desde puntos de vista distintos ya prueban la profundidad: no hace falta esperar más.
    if (withParallax) return withParallax;
    if (end - this.startedAt < MIN_SCAN_MS && !expired) return;
    if (best && mostNeighbors > 0 && end - this.startedAt >= MIN_SCAN_MS) return best;
    if (expired) return candidate;
  }

  reset() {
    this.reference = undefined;
    this.startedAt = undefined;
    this.deadline = undefined;
    this.lastTargetAt = undefined;
    this.samples = [];
    this.positions = [];
  }

  discard(id: number) {
    this.samples = this.samples.filter(s => s.capture.id !== id);
  }
}
