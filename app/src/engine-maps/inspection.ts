export const inspectionLabels = {
  highlight: 'Destacar',
  lift: 'Elevar en 3D',
  refill: 'Ver llenado',
  open: 'Ver apertura',
} as const;

export type InspectionAction = keyof typeof inspectionLabels;

export const inspectionSeconds: Record<InspectionAction, number> = { highlight: 3.2, lift: 5, refill: 10, open: 6 };

export function supportsInspection(part: string, action: unknown): action is InspectionAction {
  if (action === 'open') return ['fuses', 'washer', 'dipstick', 'oil_cap', 'positive', 'brake_cap', 'brake_fluid'].includes(part);
  return action === 'highlight' || action === 'lift' || (action === 'refill' && part === 'washer');
}

export function inspectionActions(part: string) {
  return (Object.keys(inspectionLabels) as InspectionAction[]).filter(action => supportsInspection(part, action));
}
