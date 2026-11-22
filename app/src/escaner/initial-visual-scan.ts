import type { Vano } from '../detector/vano';
import { visualBay } from '../engine-maps/registration';

type Candidate = {
  capture: {
    id: number;
    captureReference?: string;
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

function cornerDistance(a: number[] | undefined, b: number[] | undefined) {
  if (a?.length !== 12 || b?.length !== 12) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / 4);
}

/** Select an observed capture so its pose, depth and bay still belong to the same exposure. */
export class InitialVisualScan<T extends Candidate> {
  private startedAt?: number;
  private deadline?: number;
  private reference?: string;
  private lastTargetAt?: number;
  private samples: T[] = [];

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
    // Native tracks only eight captures. Reproject earlier poses through this exposure's camera.
    this.samples = this.samples.filter(s => id - s.capture.id < 8 && !!reference &&
      !!visualBay(previousVisualOutlines?.[s.capture.id], target));
    if (candidate.visual) this.samples.push(candidate);
    const expired = end >= this.deadline;
    if (end - this.startedAt < MIN_SCAN_MS && !expired) return;
    const visual = this.samples;
    let best: T | undefined;
    let mostNeighbors = -1;
    let leastError = Infinity;
    for (const sample of visual) {
      const distances = reference ? visual.filter(other => other !== sample)
        .map(other => cornerDistance(sample.capture.visualReferenceCorners, other.capture.visualReferenceCorners))
        .filter(distance => distance <= MAX_CORNER_RMS) : [];
      const error = distances.reduce((sum, distance) => sum + distance, 0);
      const landmarks = sample.capture.visualLandmarks ?? 0;
      if (distances.length > mostNeighbors || (distances.length === mostNeighbors &&
          (error < leastError || (error === leastError && landmarks > (best?.capture.visualLandmarks ?? 0))))) {
        best = sample;
        mostNeighbors = distances.length;
        leastError = error;
      }
    }
    if (best && mostNeighbors > 0 && end - this.startedAt >= MIN_SCAN_MS) return best;
    if (expired) return candidate;
  }

  reset() {
    this.reference = undefined;
    this.startedAt = undefined;
    this.deadline = undefined;
    this.lastTargetAt = undefined;
    this.samples = [];
  }

  discard(id: number) {
    this.samples = this.samples.filter(s => s.capture.id !== id);
  }
}
