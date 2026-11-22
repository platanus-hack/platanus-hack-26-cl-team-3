import type { AnthropicMessage } from './contract';

export type ConversationSummary = { id: string; title: string | null; updated_at: string };

const DEVICE_KEY = 'capo-ar:device-id:v1';

const storage = async () => (await import('@react-native-async-storage/async-storage')).default;

async function request(path: string, init: { method?: string; device?: string } = {}) {
  const { fetch } = await import('expo/fetch');
  const { API_URL, tokenHeaders } = await import('./client');
  return fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.device ? { 'x-device-id': init.device } : {}),
      ...tokenHeaders(),
    },
  });
}

let pending: Promise<string | null> | null = null;

async function resolveDevice(): Promise<string | null> {
  try {
    const store = await storage();
    const saved = await store.getItem(DEVICE_KEY);
    if (saved) return saved;
    const res = await request('/api/devices', { method: 'POST' });
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id?: unknown };
    if (typeof id !== 'string') return null;
    await store.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function deviceId(): Promise<string | null> {
  pending ??= resolveDevice().then((id) => {
    if (id === null) pending = null;
    return id;
  });
  return pending;
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

export async function fetchConversation(id: string): Promise<AnthropicMessage[] | null> {
  try {
    const device = await deviceId();
    if (!device) return null;
    const res = await request(`/api/conversations/${id}`, { device });
    if (!res.ok) return null;
    const { messages } = (await res.json()) as { messages?: AnthropicMessage[] };
    return Array.isArray(messages) ? messages : null;
  } catch {
    return null;
  }
}
