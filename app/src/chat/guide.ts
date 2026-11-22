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

export function stageTitle(card: ViewCard): string {
  if (card.fuseTargets?.length) return 'Ver el fusible en el plano';
  switch (card.action) {
    case 'refill': return 'Rellenar el sapito';
    case 'open': return card.part === 'dipstick' ? 'Sacar la varilla' : 'Abrir la tapa';
    case 'lift': return 'Elevar la pieza';
    case 'separate': return 'Separar la pieza';
    case 'highlight': return 'Revisar la pieza';
    default: {
      const titles: Partial<Record<ViewCard['part'], string>> = {
        fuses: 'Ubicar la caja de fusibles', washer: 'Ubicar el sapito',
        oil_cap: 'Ubicar la tapa de aceite', dipstick: 'Ubicar la varilla de aceite',
      };
      return titles[card.part] ?? `Ubicar: ${catalogParts[card.part][0]}`;
    }
  }
}

export function confirmsGuideStep(text: string) {
  return /^(?:(?:ok(?:ay)?|perfecto|list[oa])[, ]+)?(?:list[oa]|(?:ya )?(?:la |lo )?(?:encontre|ubique|destape|abri)|(?:ya )?(?:esta )?(?:abierta|destapada))[.! ]*$/.test(
    text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );
}

export function guideSummary(cards: ViewCard[]): { title: string; subtitle: string } {
  if (cards.length === 0) return { title: '', subtitle: '' };
  if (cards.length === 1) return { title: catalogParts[cards[0].part][0], subtitle: stageTitle(cards[0]) };
  return {
    title: `Guía de ${cards.length} pasos`,
    subtitle: joinNames(cards.map((card) => catalogParts[card.part][0])),
  };
}
