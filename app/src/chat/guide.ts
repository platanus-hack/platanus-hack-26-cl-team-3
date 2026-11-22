import { parts as catalogParts } from '../engine-maps/catalog';
import type { ViewCard } from './history';

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function joinNames(names: string[]): string {
  const [first, ...rest] = names;
  const lowered = rest.map(lowerFirst);
  if (lowered.length === 0) return first;
  if (lowered.length === 1) return `${first} y ${lowered[0]}`;
  return `${first}, ${lowered.slice(0, -1).join(', ')} y ${lowered[lowered.length - 1]}`;
}

export function guideSummary(cards: ViewCard[]): { title: string; subtitle: string } {
  if (cards.length === 0) return { title: '', subtitle: '' };
  if (cards.length === 1) return { title: catalogParts[cards[0].part][0], subtitle: cards[0].instruction };
  return {
    title: `Guía de ${cards.length} pasos`,
    subtitle: joinNames(cards.map((card) => catalogParts[card.part][0])),
  };
}
