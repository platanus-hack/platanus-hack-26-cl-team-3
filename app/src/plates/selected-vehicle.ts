import { vehicles } from '../vehicles';

export type SelectedVehicle = { id: string; name: string; year: number | null; engine: string };

export const SELECTED_VEHICLE_KEY = 'capo-ar:vehiculo-elegido:v1';

export function parseSelectedVehicle(raw: string | null): SelectedVehicle | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.engine !== 'string') return null;
    if (value.year !== null && !Number.isInteger(value.year)) return null;
    return vehicles.find((option) => option.id === value.id) ?? { id: value.id, name: value.name, year: value.year, engine: value.engine };
  } catch {
    return null;
  }
}
