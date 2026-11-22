import { SERVIDOR_POR_DEFECTO, servidor } from '../servidor';
import type { AnthropicMessage } from './contract';

export type ConversationSummary = { id: string; title: string | null; vehicle_id: string | null; updated_at: string };

const LEGACY_DEVICE_KEY = 'capo-ar:device-id:v1';
const deviceKey = (base: string) => `${LEGACY_DEVICE_KEY}:${base}`;

const storage = async () => (await import('@react-native-async-storage/async-storage')).default;

async function request(path: string, init: { method?: string; device?: string } = {}) {
  const { fetch } = await import('expo/fetch');
  const { tokenHeaders } = await import('./client');
  return fetch(`${await servidor()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.device ? { 'x-device-id': init.device } : {}),
      ...tokenHeaders(),
    },
  });
}

const pending = new Map<string, Promise<string | null>>();

async function resolveDevice(base: string): Promise<string | null> {
  try {
    const store = await storage();
    const saved = await store.getItem(deviceKey(base));
    if (saved) return saved;
    if (base === SERVIDOR_POR_DEFECTO) {
      const legacy = await store.getItem(LEGACY_DEVICE_KEY);
      if (legacy) {
        await store.setItem(deviceKey(base), legacy);
        return legacy;
      }
    }
    const res = await request('/api/devices', { method: 'POST' });
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id?: unknown };
    if (typeof id !== 'string') return null;
    await store.setItem(deviceKey(base), id);
    return id;
  } catch {
    return null;
  }
}

export async function deviceId(): Promise<string | null> {
  const base = await servidor();
  let current = pending.get(base);
  if (!current) {
    current = resolveDevice(base).then((id) => {
      if (id === null) pending.delete(base);
      return id;
    });
    pending.set(base, current);
  }
  return current;
}

export async function listConversations(): Promise<ConversationSummary[] | null> {
  try {
    const device = await deviceId();
    if (!device) return null;
    const res = await request('/api/conversations', { device });
    if (!res.ok) return null;
    const { conversations } = (await res.json()) as { conversations?: ConversationSummary[] };
    return Array.isArray(conversations) ? conversations : null;
  } catch {
    return null;
  }
}

export async function fetchConversation(id: string): Promise<{ messages: AnthropicMessage[]; vehicle_id: string | null } | null> {
  try {
    const device = await deviceId();
    if (!device) return null;
    const res = await request(`/api/conversations/${id}`, { device });
    if (!res.ok) return null;
    const { messages, vehicle_id } = (await res.json()) as { messages?: AnthropicMessage[]; vehicle_id?: unknown };
    return Array.isArray(messages) ? { messages, vehicle_id: typeof vehicle_id === 'string' ? vehicle_id : null } : null;
  } catch {
    return null;
  }
}
