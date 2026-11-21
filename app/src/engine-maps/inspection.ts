export const inspectionLabels = {
  highlight: 'Destacar',
  lift: 'Elevar en 3D',
  refill: 'Ver llenado',
} as const;

export type InspectionAction = keyof typeof inspectionLabels;

export function supportsInspection(part: string, action: unknown): action is InspectionAction {
  return action === 'highlight' || action === 'lift' || (action === 'refill' && part === 'washer');
}

export function inspectionActions(part: string) {
  return (Object.keys(inspectionLabels) as InspectionAction[]).filter(action => supportsInspection(part, action));
}
