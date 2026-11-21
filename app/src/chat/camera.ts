import type { ViewCard } from './history';

export const CHAT_VEHICLE_ID = 'outback';

export const cameraRoute = (card: ViewCard) => ({
  pathname: '/escanear' as const,
  params: { vehicleId: CHAT_VEHICLE_ID, part: card.part, instruction: card.instruction, ...(card.action ? { action: card.action } : {}) },
});
