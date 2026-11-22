import { outbackFuses } from '../engine-maps/outback-fuses';
import { withChatTurn } from './turn-queue';
import { supportsInspection, type InspectionAction } from '../engine-maps/inspection';
import { parts as catalogParts, type PartId } from '../engine-maps/catalog';
import type { AnthropicMessage } from './contract';
import { fetchConversation, listConversations, type ConversationSummary } from './remote-history';

const KEY = 'capo-ar:chat-v1';
const ID_KEY = 'capo-ar:chat-id:v1';
const VEHICLE_KEY = 'capo-ar:chat-vehicle:v1';

export type ViewCitation = { title: string; source: string; cited_text: string };
export type ViewPart = { text: string; citations: ViewCitation[]; breakBefore?: boolean };
export type ViewCard = { part: PartId; instruction: string; action?: InspectionAction };
export type ViewFuse = { box: 'cabin' | 'engine'; numbers: number[]; instruction: string };
export type Bubble = { role: 'user' | 'assistant'; parts: ViewPart[]; cards: ViewCard[]; fuses: ViewFuse[] };

const LOCAL_INDEX = 'capo-ar:local-history:v1';
const LOCAL_PREFIX = 'local-thread:';

const MAX_INSTRUCTION = 200;

export function toCard(part: unknown, instruction: unknown, action?: unknown): ViewCard | null {
  if (typeof part !== 'string' || !Object.hasOwn(catalogParts, part)) return null;
  if (typeof instruction !== 'string' || instruction.trim() === '') return null;
  if (action !== undefined && !supportsInspection(part, action)) return null;
  return { ...(action ? { action } : {}), part: part as PartId, instruction: instruction.trim().slice(0, MAX_INSTRUCTION) };
}

export function toFuse(box: unknown, numbers: unknown, instruction: unknown): ViewFuse | null {
  const mapped = box === 'cabina' ? 'cabin' : box === 'motor' ? 'engine' : null;
  if (!mapped) return null;
  if (!Array.isArray(numbers) || numbers.length === 0 || !numbers.every(Number.isInteger)) return null;
  if (numbers.length > 4 || new Set(numbers).size !== numbers.length ||
      !numbers.every(number => outbackFuses.some(slot => slot.box === mapped && slot.number === number && slot.amps !== null))) return null;
  if (typeof instruction !== 'string' || instruction.trim() === '') return null;
  return { box: mapped, numbers: numbers as number[], instruction: instruction.trim().slice(0, MAX_INSTRUCTION) };
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

let generation = 0;

export async function save(messages: AnthropicMessage[]): Promise<void> {
  try {
    await (await storage()).setItem(KEY, JSON.stringify(messages));
  } catch {
  }
}

export function clear(vehicleId: string) {
  return withChatTurn(() => selectConversationVehicle(vehicleId, storage, { messages: '[]', id: '' }));
}

export function open(id: string): Promise<AnthropicMessage[] | null> {
  return withChatTurn(async () => {
    const local = id.startsWith(LOCAL_PREFIX);
    if (local && (await (await storage()).getItem(ID_KEY)) === id) return load();
    const conversation = local ? JSON.parse((await (await storage()).getItem(id)) ?? 'null') as {
      messages: AnthropicMessage[]; vehicle_id: string;
    } | null : await fetchConversation(id);
    if (!conversation) return null;
    await selectConversationVehicle(conversation.vehicle_id || 'outback', storage, {
      messages: JSON.stringify(conversation.messages), id,
    });
    return conversation.messages;
  }).catch(() => null);
}

export async function conversationVehicle(): Promise<string | null> {
  try {
    return await (await storage()).getItem(VEHICLE_KEY);
  } catch {
    return null;
  }
}

// Keep the active thread (including local-only legacy messages) recoverable when changing cars.
type ThreadStorage = Pick<Awaited<ReturnType<typeof storage>>, 'multiGet' | 'setItem' | 'getItem' | 'multiSet'>;
type StoredThread = { messages: string; id: string };

export async function selectConversationVehicle(
  vehicleId: string, getStore: () => Promise<ThreadStorage> = storage, replacement?: StoredThread,
): Promise<void> {
  const store = await getStore();
  const values = Object.fromEntries(await store.multiGet([KEY, ID_KEY, VEHICLE_KEY]));
  const hasThread = !!values[ID_KEY] || (!!values[KEY] && values[KEY] !== '[]');
  const previous = values[VEHICLE_KEY] || (hasThread ? 'outback' : null);
  if (previous === vehicleId && !replacement) {
    if (!values[VEHICLE_KEY]) await store.setItem(VEHICLE_KEY, vehicleId);
    return;
  }
  const vehicleKey = (id: string) => 'capo-ar:scanner-thread:v1:' + id;
  const saved = await store.getItem(vehicleKey(vehicleId));
  const next: StoredThread = replacement ?? (saved ? JSON.parse(saved) : { messages: '[]', id: '' });
  // A completed thread can predate device registration and have no server history entry.
  const outgoing: StoredThread = previous === vehicleId
    ? { id: values[ID_KEY] || '', messages: values[KEY] || '[]' }
    : JSON.parse(saved ?? '{"id":"","messages":"[]"}');
  const archive: [string, string][] = [];
  if (replacement && (!outgoing.id || outgoing.id.startsWith(LOCAL_PREFIX)) && outgoing.messages !== '[]') {
    const index: ConversationSummary[] = JSON.parse((await store.getItem(LOCAL_INDEX)) ?? '[]');
    const updated = new Date().toISOString();
    const id = outgoing.id || LOCAL_PREFIX + updated + ':' + index.length;
    const messages: AnthropicMessage[] = JSON.parse(outgoing.messages);
    const title = messages.find(message => message.role === 'user')?.content;
    const summary = { id, vehicle_id: vehicleId, updated_at: updated, title: typeof title === 'string' ? title.slice(0, 100) : null };
    archive.push([id, JSON.stringify({ messages, vehicle_id: vehicleId })],
      [LOCAL_INDEX, JSON.stringify([summary, ...index.filter(item => item.id !== id)])]);
  }
  generation++;
  const parked: [string, string][] = previous && previous !== vehicleId && hasThread ? [
    [vehicleKey(previous), JSON.stringify({ messages: values[KEY] || '[]', id: values[ID_KEY] || '' })],
  ] : [];
  await store.multiSet([
    ...archive, ...parked, [vehicleKey(vehicleId), JSON.stringify({ messages: '[]', id: '' })],
    [KEY, next.messages], [ID_KEY, next.id], [VEHICLE_KEY, vehicleId],
  ]);
}

export async function currentConversation(): Promise<{ id: string | null; generation: number }> {
  const at = generation;
  try {
    const id = await (await storage()).getItem(ID_KEY);
    return { id: id && !id.startsWith(LOCAL_PREFIX) ? id : null, generation: at };
  } catch {
    return { id: null, generation: at };
  }
}

export async function adoptConversation(id: string, at: number): Promise<void> {
  if (at !== generation) return;
  try {
    await (await storage()).setItem(ID_KEY, id);
  } catch {
  }
}

export async function list(): Promise<ConversationSummary[] | null> {
  const remote = await listConversations().catch(() => null);
  try {
    const raw = await (await storage()).getItem(LOCAL_INDEX);
    const local: ConversationSummary[] = JSON.parse(raw ?? '[]');
    if (!local.length) return remote;
    return [...local, ...(remote ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch {
    return remote;
  }
}

export function toView(messages: AnthropicMessage[]): Bubble[] {
  const rejected = new Set(messages.flatMap(message => message.role === 'user' && Array.isArray(message.content)
    ? message.content.filter(block => block.type === 'tool_result' && block.is_error).map(block => block.tool_use_id) : []));
  const out: Bubble[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.push({ role: 'user', parts: [{ text: m.content, citations: [] }], cards: [], fuses: [] });
      continue;
    }
    const parts: ViewPart[] = [];
    const cards: ViewCard[] = [];
    const fuses: ViewFuse[] = [];
    if (Array.isArray(m.content)) {
      for (const b of m.content as any[]) {
        if (b.type === 'tool_use' && b.name === 'show_in_camera') {
          const card = toCard(b.input?.part, b.input?.instruction, b.input?.action);
          if (card) cards.push(card);
          continue;
        }
        if (b.type === 'tool_use' && b.name === 'show_fuse' && !rejected.has(b.id)) {
          const fuse = toFuse(b.input?.box, b.input?.numbers, b.input?.instruction);
          if (fuse) fuses.push(fuse);
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
    if (parts.length === 0 && cards.length === 0 && fuses.length === 0) continue;
    const last = out[out.length - 1];
    if (last?.role === 'assistant') {
      if (parts.length > 0) parts[0] = { ...parts[0], breakBefore: true };
      last.parts.push(...parts);
      last.cards.push(...cards);
      last.fuses.push(...fuses);
    }
    else out.push({ role: 'assistant', parts, cards, fuses });
  }
  return out;
}
