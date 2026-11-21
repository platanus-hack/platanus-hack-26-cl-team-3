import type { ChatEvent } from './contract';

export function toEvent(name: string, data: any): ChatEvent | null {
  switch (name) {
    case 'tool':
      return { type: 'tool', name: data.name };
    case 'text':
      return { type: 'text', block: data.block, text: data.text };
    case 'citation':
      return { type: 'citation', block: data.block, title: data.title, source: data.source, cited_text: data.cited_text };
    case 'done':
      return data.truncated === true ? { type: 'done', messages: data.messages, truncated: true } : { type: 'done', messages: data.messages };
    case 'error':
      return { type: 'error', code: data.code, message: data.message };
    default:
      return null;
  }
}

export function splitEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const chunks = buffer.split('\n\n');
  const rest = chunks.pop() ?? '';
  for (const chunk of chunks) {
    let name = '';
    let data = '';
    for (const line of chunk.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!name || !data) continue;
    try {
      const event = toEvent(name, JSON.parse(data));
      if (event) events.push(event);
    } catch {
      continue;
    }
  }
  return { events, rest };
}
