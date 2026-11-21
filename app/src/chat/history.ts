import type { AnthropicMessage } from './contract';

const KEY = 'capo-ar:chat-v1';

export type ViewCitation = { title: string; source: string; cited_text: string };
export type ViewPart = { text: string; citations: ViewCitation[]; breakBefore?: boolean };
export type Bubble = { role: 'user' | 'assistant'; parts: ViewPart[] };

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

export async function save(messages: AnthropicMessage[]): Promise<void> {
  try {
    await (await storage()).setItem(KEY, JSON.stringify(messages));
  } catch {
  }
}

export async function clear(): Promise<void> {
  try {
    await (await storage()).removeItem(KEY);
  } catch {
  }
}

export function toView(messages: AnthropicMessage[]): Bubble[] {
  const out: Bubble[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.push({ role: 'user', parts: [{ text: m.content, citations: [] }] });
      continue;
    }
    const parts: ViewPart[] = [];
    if (Array.isArray(m.content)) {
      for (const b of m.content as any[]) {
        if (b.type !== 'text') continue;
        const citations: ViewCitation[] = (b.citations ?? [])
          .filter((c: any) => c.type === 'search_result_location')
          .map((c: any) => ({ title: c.title ?? '', source: c.source, cited_text: c.cited_text }));
        parts.push({ text: b.text, citations });
      }
    } else if (typeof m.content === 'string') {
      parts.push({ text: m.content, citations: [] });
    }
    if (parts.length === 0) continue;
    const last = out[out.length - 1];
    if (last?.role === 'assistant') {
      parts[0] = { ...parts[0], breakBefore: true };
      last.parts.push(...parts);
    }
    else out.push({ role: 'assistant', parts });
  }
  return out;
}
