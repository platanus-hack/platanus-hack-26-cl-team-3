import { fetch } from 'expo/fetch';

import type { AnthropicMessage, ChatEvent, ErrorCode } from './contract';
import { splitEvents } from './sse';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ph26.berguecio.cl';

export const CHAT_TOKEN = process.env.EXPO_PUBLIC_CHAT_TOKEN;

const failure = (code: ErrorCode, message: string): ChatEvent => ({ type: 'error', code, message });

export async function* runTurn({ messages }: { messages: AnthropicMessage[] }): AsyncGenerator<ChatEvent> {
  let res;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(CHAT_TOKEN ? { 'x-chat-token': CHAT_TOKEN } : {}),
      },
      body: JSON.stringify({ messages }),
    });
  } catch {
    yield failure('network', 'No me pude conectar con el servidor. Revisa tu conexión.');
    return;
  }
  if (!res.ok || !res.body) {
    const message = await res
      .json()
      .then((body: { error?: string }) => body.error ?? `El servidor respondió ${res.status}.`)
      .catch(() => `El servidor respondió ${res.status}.`);
    yield failure(res.status === 500 ? 'config' : 'internal', message);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = splitEvents(buffer);
      buffer = rest;
      for (const event of events) {
        if (event.type === 'done' || event.type === 'error') finished = true;
        yield event;
      }
    }
  } catch {}
  if (!finished) yield failure('network', 'La respuesta se cortó. Inténtalo de nuevo.');
}
