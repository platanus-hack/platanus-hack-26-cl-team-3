import { resolveFuseSource } from '../../../api/src/data/fuse-catalog';
import { outbackFuses } from '../engine-maps/outback-fuses';
import { toCard, type ViewCard, type ViewCitation } from './history';

export const cameraRoute = (card: ViewCard, steps: ViewCard[], vehicleId: string) => ({
  pathname: '/escanear' as const,
  params: {
    vehicleId,
    part: card.part,
    instruction: card.instruction,
    ...(card.action ? { action: card.action } : {}),
    ...(steps.length > 1 ? { steps: JSON.stringify(steps), step: String(Math.max(steps.indexOf(card), 0)) } : {}),
  },
});

/** The fuse tool cites whole rows. A citation spanning multiple rows opens the panel without selecting one. */
export function fuseCitationRoute(citation: ViewCitation) {
  const target = resolveFuseSource(citation.source);
  if (target?.vehicle === 'outback') {
    return { pathname: '/outback-fuses' as const, params: { box: target.slot.box, fuse: String(target.slot.number) } };
  }
  if (citation.source !== 'fusibles://outback-2016-3.6r/cabina') return null;
  const tokens = (citation.cited_text ?? '').matchAll(/\b(?:fusible-cabina-|fusible\s+)(\d+)\b/gi);
  const numbers = [...new Set(Array.from(tokens, match => Number(match[1])))];
  const slot = numbers.length === 1 ? outbackFuses.find(item => item.box === 'cabin' && item.number === numbers[0]) : undefined;
  return {
    pathname: '/outback-fuses' as const,
    params: { box: 'cabin', ...(slot && { fuse: String(slot.number) }) },
  };
}

export type GuideParams = { part?: string; instruction?: string; action?: string; steps?: string; step?: string };

export function readGuide({ part, instruction, action, steps, step }: GuideParams): { steps: ViewCard[]; step: number } {
  const single = toCard(part, instruction, action);
  let list: ViewCard[] = [];
  try {
    const raw: unknown = steps ? JSON.parse(steps) : [];
    if (Array.isArray(raw)) list = raw.flatMap((s) => toCard(s?.part, s?.instruction, s?.action) ?? []);
  } catch {}
  if (list.length < 2) return { steps: single ? [single] : [], step: 0 };
  const index = Number(step);
  return { steps: list, step: Number.isInteger(index) && index >= 0 && index < list.length ? index : 0 };
}
