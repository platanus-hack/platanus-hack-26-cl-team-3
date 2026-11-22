import { fuseGuides } from '../fusibles/guides';
import { toFuse, toCard, type ViewCard, type ViewCitation, type ViewFuse } from './history';

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

export const fuseRoute = (vehicleId: string, box: ViewFuse['box'], number: number) => ({
  pathname: '/fusibles' as const,
  params: { vehicleId, box, fuse: String(number) },
});

/** The fuse tool cites whole rows. A citation spanning multiple rows opens the panel without selecting one. */
export function fuseCitationRoute(citation: ViewCitation) {
  const source = citation.source ?? '';
  for (const guide of Object.values(fuseGuides)) {
    const prefix = `${guide.sourceUri}/`;
    if (!source.startsWith(prefix)) continue;
    const box = source.slice(prefix.length);
    if (!guide.boxes.some(item => item.id === box)) continue;
    const tokens = (citation.cited_text ?? '').matchAll(new RegExp(`\\b(?:fusible-${box}-|fusible\\s+)(\\d+)\\b`, 'gi'));
    const numbers = [...new Set(Array.from(tokens, token => Number(token[1])))];
    const slot = numbers.length === 1 ? guide.slots.find(item => item.box === box && item.number === numbers[0]) : undefined;
    return {
      pathname: '/fusibles' as const,
      params: { vehicleId: guide.vehicleId, box, ...(slot && { fuse: String(slot.number) }) },
    };
  }
  return null;
}

export type GuideParams = { part?: string; instruction?: string; action?: string; steps?: string; step?: string };

export function readGuide({ part, instruction, action, steps, step }: GuideParams): { steps: ViewCard[]; step: number } {
  const single = toCard(part, instruction, action);
  let list: ViewCard[] = [];
  try {
    const raw: unknown = steps ? JSON.parse(steps) : [];
    if (Array.isArray(raw)) list = raw.flatMap(s => {
      const card = toCard(s?.part, s?.instruction, s?.action);
      if (!card) return [];
      if (card.part === 'fuses' && !card.action && Array.isArray(s.fuseTargets)) {
        const targets = s.fuseTargets.flatMap((f: Partial<ViewFuse> | null) => toFuse(f?.box, f?.numbers, f?.instruction) ?? []);
        if (targets.length) card.fuseTargets = targets;
      }
      return [card];
    });
  } catch {}
  if (list.length < 2) return { steps: single ? [single] : [], step: 0 };
  const index = Number(step);
  return { steps: list, step: Number.isInteger(index) && index >= 0 && index < list.length ? index : 0 };
}
