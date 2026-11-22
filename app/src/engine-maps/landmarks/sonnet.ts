import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PartCenter } from '../../../modules/capo-ar';
import { API_URL, CHAT_TOKEN } from '../../chat/client';
import type { Vano } from '../../detector/vano';
import type { PartId, Volume } from '../catalog';
import { insideBay } from './part-centers';

const MARGIN = 0.03;
const MIN_WIDTH = 1024;
const JPEG_QUALITY = 0.85;
const TIMEOUT_MS = 12000;
const MIN_POINTS = 3;
const MIN_GAP_MS = 4000;
const MAX_CALLS = 6;

export type CropRect = { originX: number; originY: number; width: number; height: number };
export type SonnetPoint = { part: string; x: number; y: number };
export type SonnetStatus = { points: number; ms: number | null };

export function cropRectForBay(bay: Vano, width: number, height: number): CropRect | null {
  if (bay.cortado || !bay.esquinas.length || width < 2 || height < 2) return null;
  const xs = bay.esquinas.map((corner) => corner.x);
  const ys = bay.esquinas.map((corner) => corner.y);
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  const left = Math.max(0, Math.floor((Math.min(...xs) - MARGIN) * width));
  const top = Math.max(0, Math.floor((Math.min(...ys) - MARGIN) * height));
  const right = Math.min(width, Math.ceil((Math.max(...xs) + MARGIN) * width));
  const bottom = Math.min(height, Math.ceil((Math.max(...ys) + MARGIN) * height));
  if (right - left < 2 || bottom - top < 2) return null;
  return { originX: left, originY: top, width: right - left, height: bottom - top };
}

export function pointsToFullFrame(
  points: readonly SonnetPoint[],
  rect: CropRect,
  frame: { width: number; height: number },
  volumes: readonly Volume[],
  bay: Vano,
): PartCenter[] {
  const seen = new Set<number>();
  return points.flatMap(({ part, x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return [];
    const index = volumes.findIndex((volume) => volume.part === (part as PartId));
    if (index < 0 || seen.has(index)) return [];
    const fullX = (rect.originX + x * rect.width) / frame.width;
    const fullY = (rect.originY + y * rect.height) / frame.height;
    if (!insideBay(fullX, fullY, bay)) return [];
    seen.add(index);
    return [[index, fullX, fullY] as PartCenter];
  });
}

function parsePoints(body: unknown): SonnetPoint[] {
  const list = (body as { points?: unknown } | null)?.points;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is SonnetPoint =>
    !!item && typeof item.part === 'string' && typeof item.x === 'number' && typeof item.y === 'number');
}

let inFlight = false;
let lastStart = 0;
let calls = 0;
let status: SonnetStatus | null = null;

export function resetSonnetCalls() {
  calls = 0;
  lastStart = 0;
  status = null;
}

export const lastSonnetStatus = () => status;

async function cropToBase64(uri: string, bay: Vano): Promise<{ image: string; width: number; height: number; rect: CropRect; frame: { width: number; height: number } } | null> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const frame = { width: original.width, height: original.height };
  const rect = cropRectForBay(bay, frame.width, frame.height);
  if (!rect) return null;
  let context = ImageManipulator.manipulate(original).crop(rect);
  if (rect.width < MIN_WIDTH) context = context.resize({ width: MIN_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  try {
    if (!saved.base64) return null;
    return { image: saved.base64, width: saved.width, height: saved.height, rect, frame };
  } finally {
    try {
      new File(saved.uri).delete();
    } catch {}
  }
}

export async function locatePartsWithSonnet(
  capture: { uri: string },
  bay: Vano,
  volumes: readonly Volume[],
): Promise<PartCenter[]> {
  const now = Date.now();
  if (inFlight || calls >= MAX_CALLS || now - lastStart < MIN_GAP_MS || bay.cortado) return [];
  inFlight = true;
  lastStart = now;
  calls += 1;
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), TIMEOUT_MS);
  try {
    const crop = await cropToBase64(capture.uri, bay);
    if (!crop) return [];
    const res = await fetch(`${API_URL}/api/locate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(CHAT_TOKEN ? { 'x-chat-token': CHAT_TOKEN } : {}),
      },
      body: JSON.stringify({ image: crop.image, width: crop.width, height: crop.height }),
      signal: timer.signal,
    });
    const centers = res.status === 200
      ? pointsToFullFrame(parsePoints(await res.json()), crop.rect, crop.frame, volumes, bay)
      : [];
    const result = centers.length >= MIN_POINTS ? centers : [];
    status = { points: result.length, ms: Date.now() - now };
    return result;
  } catch {
    status = { points: 0, ms: null };
    return [];
  } finally {
    clearTimeout(timeout);
    inFlight = false;
  }
}
