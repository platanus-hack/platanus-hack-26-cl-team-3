export const inspectionLabels = {
  highlight: 'Destacar',
  lift: 'Elevar en 3D',
  refill: 'Ver llenado',
} as const;

export type InspectionAction = keyof typeof inspectionLabels;

export const inspectionSeconds: Record<InspectionAction, number> = { highlight: 3.2, lift: 5, refill: 10 };

export function supportsInspection(part: string, action: unknown): action is InspectionAction {
  return action === 'highlight' || action === 'lift' || (action === 'refill' && part === 'washer');
}

export function inspectionActions(part: string) {
  return (Object.keys(inspectionLabels) as InspectionAction[]).filter(action => supportsInspection(part, action));
}
