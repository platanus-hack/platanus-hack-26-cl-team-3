import { supportsInspection, type InspectionAction } from '../engine-maps/inspection';
import { parts as catalogParts, type PartId } from '../engine-maps/catalog';
import type { AnthropicMessage } from './contract';
import { createConversation, fetchConversation, listConversations, updateConversation } from './remote-history';

const KEY = 'capo-ar:chat-v1';
const ID_KEY = 'capo-ar:chat-id:v1';

export type ViewCitation = { title: string; source: string; cited_text: string };
export type ViewPart = { text: string; citations: ViewCitation[]; breakBefore?: boolean };
export type ViewCard = { part: PartId; instruction: string; action?: InspectionAction };
export type Bubble = { role: 'user' | 'assistant'; parts: ViewPart[]; cards: ViewCard[] };

const MAX_INSTRUCTION = 200;

export function toCard(part: unknown, instruction: unknown, action?: unknown): ViewCard | null {
  if (typeof part !== 'string' || !Object.hasOwn(catalogParts, part)) return null;
  if (typeof instruction !== 'string' || instruction.trim() === '') return null;
  if (action !== undefined && !supportsInspection(part, action)) return null;
  return { ...(action ? { action } : {}), part: part as PartId, instruction: instruction.trim().slice(0, MAX_INSTRUCTION) };
}

const storage = async () => (await import('@react-native-async-storage/async-storage')).default;

export async function load(): Promise<AnthropicMessage[]> {
  try {
    const raw = await (await storage()).getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// El id del servidor solo se toca dentro de la cola: un save viejo no debe pisar «Nueva conversación».
let queue: Promise<void> = Promise.resolve();
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job).catch(() => {});
};

async function sync(messages: AnthropicMessage[]): Promise<void> {
  const store = await storage();
  const id = await store.getItem(ID_KEY);
  if (id && (await updateConversation(id, messages)) !== 'missing') return;
  const created = await createConversation(messages);
  if (created) await store.setItem(ID_KEY, created);
}

export async function save(messages: AnthropicMessage[]): Promise<void> {
  try {
    await (await storage()).setItem(KEY, JSON.stringify(messages));
  } catch {
  }
  enqueue(() => sync(messages));
}

export async function clear(): Promise<void> {
  try {
    await (await storage()).removeItem(KEY);
  } catch {
  }
  enqueue(async () => (await storage()).removeItem(ID_KEY));
}

export async function open(id: string): Promise<AnthropicMessage[] | null> {
  const messages = await fetchConversation(id);
  if (!messages) return null;
  try {
    await (await storage()).setItem(KEY, JSON.stringify(messages));
  } catch {
  }
  enqueue(async () => (await storage()).setItem(ID_KEY, id));
  return messages;
}

export const list = listConversations;

export function toView(messages: AnthropicMessage[]): Bubble[] {
  const out: Bubble[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.push({ role: 'user', parts: [{ text: m.content, citations: [] }], cards: [] });
      continue;
    }
    const parts: ViewPart[] = [];
    const cards: ViewCard[] = [];
    if (Array.isArray(m.content)) {
      for (const b of m.content as any[]) {
        if (b.type === 'tool_use' && b.name === 'show_in_camera') {
          const card = toCard(b.input?.part, b.input?.instruction, b.input?.action);
          if (card) cards.push(card);
          continue;
        }
        if (b.type !== 'text') continue;
        const citations: ViewCitation[] = (b.citations ?? [])
          .filter((c: any) => c.type === 'search_result_location')
          .map((c: any) => ({ title: c.title ?? '', source: c.source, cited_text: c.cited_text }));
        parts.push({ text: b.text, citations });
      }
    } else if (typeof m.content === 'string') {
      parts.push({ text: m.content, citations: [] });
    }
    if (parts.length === 0 && cards.length === 0) continue;
    const last = out[out.length - 1];
    if (last?.role === 'assistant') {
      if (parts.length > 0) parts[0] = { ...parts[0], breakBefore: true };
      last.parts.push(...parts);
      last.cards.push(...cards);
    }
    else out.push({ role: 'assistant', parts, cards });
  }
  return out;
}
