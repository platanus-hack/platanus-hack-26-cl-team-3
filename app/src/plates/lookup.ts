import { servidor } from '../servidor';
import { vehicles } from '../vehicles';

export type PlateRecord = { plate: string; make: string | null; model: string | null; year: number | null };

export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[\s.·•-]/g, '');
}

// Chilean passenger cars use both the older two-letter and current four-letter formats.
export function readCarPlate(lines: string[]): string | undefined {
  const candidates = new Set(lines.map(normalizePlate).filter(value => /^(?:[A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$/.test(value)));
  if (candidates.size === 1) return candidates.values().next().value;
}

export function isPlateRecord(value: unknown, plate: string): value is PlateRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlateRecord>;
  return record.plate === plate && (record.make === null || typeof record.make === 'string')
    && (record.model === null || typeof record.model === 'string')
    && (record.year === null || Number.isInteger(record.year));
}

function words(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function identifiedVehicle(record: PlateRecord) {
  const name = [record.make, record.model].filter(Boolean).join(' ') || 'Vehículo';
  // Engine maps are variant-specific. Only reuse one with explicit matching engine and year.
  const catalog = vehicles.find(vehicle => vehicle.year === record.year
    && words(name) === words(vehicle.name + ' ' + vehicle.engine));
  return { id: catalog?.id ?? 'prt-' + record.plate, name, year: record.year, engine: record.plate };
}

export async function lookupPlate(plate: string, signal: AbortSignal): Promise<PlateRecord> {
  const response = await fetch((await servidor()) + '/api/vehicles/' + encodeURIComponent(plate), { signal });
  if (response.status === 404) throw new Error('Sin registro en las revisiones técnicas disponibles. Revisa la patente.');
  if (!response.ok) throw new Error('No se pudo consultar el registro. Inténtalo de nuevo.');
  const record: unknown = await response.json();
  if (!isPlateRecord(record, plate) || !record.model) throw new Error('El registro no tiene un modelo disponible para esta patente.');
  return record;
}
