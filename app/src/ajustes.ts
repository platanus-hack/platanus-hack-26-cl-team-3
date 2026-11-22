// Los ids deben coincidir con api/src/llm/profiles.ts.
export const MODELOS = [
  { id: 'sonnet', nombre: 'Sonnet 5.5', nota: 'Recomendado' },
  { id: 'opus', nombre: 'Opus 5.5', nota: 'Más capaz y más lento' },
  { id: 'haiku', nombre: 'Haiku 5.5', nota: 'Más rápido y barato' },
] as const;

export const ESFUERZOS = [
  { id: 'low', nombre: 'Bajo' },
  { id: 'medium', nombre: 'Medio' },
  { id: 'high', nombre: 'Alto' },
  { id: 'xhigh', nombre: 'Muy alto' },
  { id: 'max', nombre: 'Máximo' },
] as const;

export type ModeloId = (typeof MODELOS)[number]['id'];
export type EsfuerzoId = (typeof ESFUERZOS)[number]['id'];
export type Ajustes = { modelo: ModeloId; esfuerzo: EsfuerzoId | null; anclajeConModelo: boolean; vozVivo: boolean };

const KEY = 'capo-ar:ajustes:v1';
// Misma clave y valores que el switch de escaner/comun.tsx.
const ANCLAJE_KEY = 'capo-ar:anclaje-sonnet:v1';

const DEFECTO = { modelo: 'sonnet', esfuerzo: null, vozVivo: false } as const;

export function parseAjustes(raw: string | null): Pick<Ajustes, 'modelo' | 'esfuerzo' | 'vozVivo'> {
  try {
    const v = raw ? JSON.parse(raw) : null;
    const modelo = MODELOS.find((m) => m.id === v?.modelo)?.id ?? DEFECTO.modelo;
    const esfuerzo = ESFUERZOS.find((e) => e.id === v?.esfuerzo)?.id ?? DEFECTO.esfuerzo;
    const vozVivo = typeof v?.vozVivo === 'boolean' ? v.vozVivo : DEFECTO.vozVivo;
    return { modelo, esfuerzo, vozVivo };
  } catch {
    return { ...DEFECTO };
  }
}

const storage = async () => (await import('@react-native-async-storage/async-storage')).default;

export async function cargarAjustes(): Promise<Ajustes> {
  try {
    const s = await storage();
    const [raw, anclaje] = await Promise.all([s.getItem(KEY), s.getItem(ANCLAJE_KEY)]);
    return { ...parseAjustes(raw), anclajeConModelo: anclaje === '1' };
  } catch {
    return { ...DEFECTO, anclajeConModelo: false };
  }
}

export async function guardarAjustes({ modelo, esfuerzo, anclajeConModelo, vozVivo }: Ajustes): Promise<void> {
  try {
    const s = await storage();
    await s.setItem(KEY, JSON.stringify({ modelo, esfuerzo, vozVivo }));
    await s.setItem(ANCLAJE_KEY, anclajeConModelo ? '1' : '0');
  } catch {}
}
