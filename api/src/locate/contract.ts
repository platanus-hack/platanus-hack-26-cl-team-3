export const PART_DESCRIPTIONS = {
  washer: "tapa del depósito de líquido limpiaparabrisas",
  dipstick: "manilla de la varilla de aceite",
  oil_cap: "tapa de llenado de aceite del motor",
  brake_cap: "tapa del depósito de líquido de frenos",
  radiator_cap: "tapa del radiador",
  positive: "cubierta plástica del borne positivo de la batería",
} as const;

export type PartId = keyof typeof PART_DESCRIPTIONS;

export const PART_IDS = Object.keys(PART_DESCRIPTIONS) as PartId[];

export const MIN_SIZE = 64;
export const MAX_SIZE = 4096;

export type LocateInput = { image: string; width: number; height: number; parts: PartId[] };

export type RawPoint = { part: string; visible: boolean; x: number; y: number };

export type LocatedPoint = { part: PartId; x: number; y: number };

export type Locator = (input: LocateInput) => Promise<RawPoint[]>;

type Validation = { error: string } | { error?: undefined; input: LocateInput };

const isPart = (v: unknown): v is PartId => typeof v === "string" && Object.hasOwn(PART_DESCRIPTIONS, v);

const isSize = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_SIZE && (v as number) <= MAX_SIZE;

export function validateLocate(body: unknown): Validation {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { error: "Cuerpo inválido" };
  const { image, width, height, parts } = body as Record<string, unknown>;
  if (typeof image !== "string" || image.length === 0) return { error: "Falta `image` (base64)" };
  if (!isSize(width)) return { error: `\`width\` debe ser un entero entre ${MIN_SIZE} y ${MAX_SIZE}` };
  if (!isSize(height)) return { error: `\`height\` debe ser un entero entre ${MIN_SIZE} y ${MAX_SIZE}` };
  if (parts === undefined) return { input: { image, width, height, parts: [...PART_IDS] } };
  if (!Array.isArray(parts) || parts.length === 0) return { error: "`parts` debe ser un arreglo no vacío" };
  if (!parts.every(isPart)) return { error: "`parts` contiene piezas desconocidas" };
  if (new Set(parts).size !== parts.length) return { error: "`parts` tiene piezas repetidas" };
  return { input: { image, width, height, parts } };
}

export function normalizePoints(
  raw: readonly RawPoint[],
  width: number,
  height: number,
  requested: readonly PartId[] = PART_IDS,
): LocatedPoint[] {
  const counts = new Map<string, number>();
  for (const p of raw) counts.set(p.part, (counts.get(p.part) ?? 0) + 1);
  const out: LocatedPoint[] = [];
  for (const p of raw) {
    if (!isPart(p.part) || !requested.includes(p.part) || counts.get(p.part) !== 1) continue;
    if (p.visible !== true || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue;
    out.push({ part: p.part, x: p.x / width, y: p.y / height });
  }
  return out;
}
