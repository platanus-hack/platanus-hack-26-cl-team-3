import { outbackFuseGuide } from './outback';
import { swiftFuseGuide } from './swift';
import type { FuseGuide, FuseSlot } from './types';

export const fuseGuides: Record<string, FuseGuide> = { outback: outbackFuseGuide, swift: swiftFuseGuide };

export const fuseGuideFor = (vehicleId?: string): FuseGuide | undefined =>
  vehicleId && Object.hasOwn(fuseGuides, vehicleId) ? fuseGuides[vehicleId] : undefined;

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function searchFuses(guide: FuseGuide, query: string): FuseSlot[] {
  if (guide.search) return guide.search(query);
  const text = normalize(query);
  if (!text) return guide.slots;
  return guide.slots.filter(slot => normalize(slot.label).includes(text) || normalize(slot.description).includes(text));
}

export const boxName = (guide: FuseGuide, box: string) => guide.boxes.find(item => item.id === box)?.name ?? box;
