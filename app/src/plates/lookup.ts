import { vehicles, type Vehicle } from '../vehicles';

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

/**
 * Registros de revisión técnica que son el mismo vano que un auto del catálogo aunque el texto no coincida exacto.
 * Cada alias fija marca, variante de motor y años: el 3.6R no es el 2.5i, y otro año no entra solo por parecerse.
 */
const ALIASES: { id: Vehicle['id']; make: RegExp; model: RegExp; years: readonly number[] }[] = [
  // Outback de 5.ª generación con el 3.6R (EZ36): la revisión técnica lo registra como «ALL NEW OUTBACK 3.6R» (2015).
  // El mapa 3D del catálogo es del 2016 y es el mismo vano.
  { id: 'outback', make: /^SUBARU$/, model: /\bOUTBACK\b.*\b3 6/, years: [2015, 2016] },
];

export function identifiedVehicle(record: PlateRecord) {
  const name = [record.make, record.model].filter(Boolean).join(' ') || 'Vehículo';
  // Engine maps are variant-specific. Only reuse one with explicit matching engine and year, or a listed alias.
  const make = words(record.make ?? '');
  const model = words(record.model ?? '');
  const alias = ALIASES.find(a => record.year !== null && a.years.includes(record.year) && a.make.test(make) && a.model.test(model));
  const catalog = vehicles.find(vehicle => vehicle.year === record.year
    && words(name) === words(vehicle.name + ' ' + vehicle.engine));
  return { id: catalog?.id ?? alias?.id ?? 'prt-' + record.plate, name, year: record.year, engine: record.plate };
}

export async function lookupPlate(plate: string, signal: AbortSignal): Promise<PlateRecord> {
  const base = process.env.EXPO_PUBLIC_API_URL || 'https://ph26.berguecio.cl';
  const response = await fetch(base.replace(/\/$/, '') + '/api/vehicles/' + encodeURIComponent(plate), { signal });
  if (response.status === 404) throw new Error('Sin registro en las revisiones técnicas disponibles. Revisa la patente.');
  if (!response.ok) throw new Error('No se pudo consultar el registro. Inténtalo de nuevo.');
  const record: unknown = await response.json();
  if (!isPlateRecord(record, plate) || !record.model) throw new Error('El registro no tiene un modelo disponible para esta patente.');
  return record;
}
