import { createHistory } from './session';
import { supportsInspection, type InspectionAction } from '../engine-maps/inspection';
import { parts as catalogParts, type PartId } from '../engine-maps/catalog';
import type { AnthropicMessage } from './contract';
import { fetchConversation, listConversations } from './remote-history';

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

async function historyFile(slot: string) {
  if (slot !== '1' && slot !== '2') throw new Error('Invalid history file');
  const { File, Paths } = await import('expo-file-system');
  return new File(Paths.document, `chat-history-${slot}.json`);
}

const history = createHistory(
  async () => (await import('@react-native-async-storage/async-storage')).default,
  async () => (await import('expo')).uuid.v4(),
  fetchConversation,
  process.env.EXPO_OS === 'web' ? undefined : {
    read: async slot => (await historyFile(slot)).text(),
    write: async (slot, raw) => (await historyFile(slot)).write(raw),
  },
);
export const { subscribe, current, snapshot, commit, clear, open } = history;
export const list = listConversations;

export function toView(messages: AnthropicMessage[]): Bubble[] {
  const out: Bubble[] = [];
  for (const [index, m] of messages.entries()) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : Array.isArray(m.content)
        ? m.content.flatMap(b => b?.type === 'text' && typeof b.text === 'string' ? [b.text] : []).join('\n') : '';
      if (text) out.push({ role: 'user', parts: [{ text, citations: [] }], cards: [] });
      continue;
    }
    const parts: ViewPart[] = [];
    const cards: ViewCard[] = [];
    if (Array.isArray(m.content)) {
      for (const b of m.content as any[]) {
        if (!b) continue;
        if (b.type === 'tool_use' && b.name === 'show_in_camera') {
          const card = toCard(b.input?.part, b.input?.instruction, b.input?.action);
          const next = messages[index + 1];
          if (card && typeof b.id === 'string' && next?.role === 'user' && Array.isArray(next.content) &&
            next.content.some(r => r?.type === 'tool_result' && r.tool_use_id === b.id && !r.is_error)) cards.push(card);
          continue;
        }
        if (b.type !== 'text' || typeof b.text !== 'string') continue;
        const citations: ViewCitation[] = (Array.isArray(b.citations) ? b.citations : [])
          .filter((c: any) => c?.type === 'search_result_location' && typeof c.source === 'string' && typeof c.cited_text === 'string' && (c.title == null || typeof c.title === 'string'))
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
