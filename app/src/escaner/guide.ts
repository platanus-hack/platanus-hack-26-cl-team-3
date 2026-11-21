import type { GuiaAR } from '../../modules/capo-ar';

export const CENTER_RADIUS = 0.18;
export const HITS_TO_FIND = 3;
export const MISSES_TO_LOSE = 5;

export type FoundState = { part: number; hits: number; misses: number; found: boolean };

export const initialFound: FoundState = { part: -1, hits: 0, misses: 0, found: false };

export type ArrowFrame = { left: number; top: number; right: number; bottom: number };

export function arrowPlacement(
  event: Pick<GuiaAR, 'x' | 'y'>,
  width: number,
  height: number,
  frame: ArrowFrame,
): { left: number; top: number; rotation: number } {
  const cx = width / 2;
  const cy = height / 2;
  const dx = event.x * width - cx;
  const dy = event.y * height - cy;
  if (dx === 0 && dy === 0) return { left: cx, top: cy, rotation: 0 };
  const scaleX = dx === 0 ? Infinity : Math.max(0, dx > 0 ? frame.right - cx : cx - frame.left) / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : Math.max(0, dy > 0 ? frame.bottom - cy : cy - frame.top) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    left: cx + dx * scale,
    top: cy + dy * scale,
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

export function isCentered(event: GuiaAR): boolean {
  return event.visible && Math.abs(event.x - 0.5) < CENTER_RADIUS && Math.abs(event.y - 0.5) < CENTER_RADIUS;
}

export function nextFound(state: FoundState, event: GuiaAR): { state: FoundState; justFound: boolean } {
  const base = event.part === state.part ? state : { ...initialFound, part: event.part };
  if (isCentered(event)) {
    const hits = base.hits + 1;
    const found = base.found || hits >= HITS_TO_FIND;
    return { state: { part: base.part, hits, misses: 0, found }, justFound: found && !base.found };
  }
  if (!base.found) return { state: { ...base, hits: 0 }, justFound: false };
  const misses = base.misses + 1;
  if (misses >= MISSES_TO_LOSE) return { state: { part: base.part, hits: 0, misses: 0, found: false }, justFound: false };
  return { state: { ...base, misses }, justFound: false };
}

export function formatDistance(meters: number): string {
  if (meters < 1) {
    const cm = Math.max(5, Math.round((meters * 100) / 5) * 5);
    if (cm < 100) return `${cm} cm`;
  }
  return `${(Math.round(meters * 10) / 10).toFixed(1).replace('.', ',')} m`;
}
