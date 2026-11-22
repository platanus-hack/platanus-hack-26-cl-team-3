import { fetch } from 'expo/fetch';

import type { AnthropicMessage, ChatEvent, ErrorCode } from './contract';
import { cargarAjustes } from '../ajustes';
import { splitEvents } from './sse';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ph26.berguecio.cl';

export const CHAT_TOKEN = process.env.EXPO_PUBLIC_CHAT_TOKEN;

export const tokenHeaders = (): Record<string, string> => (CHAT_TOKEN ? { 'x-chat-token': CHAT_TOKEN } : {});

const failure = (code: ErrorCode, message: string): ChatEvent => ({ type: 'error', code, message });

export async function* runTurn({
  messages,
  mode,
  signal,
}: {
  messages: AnthropicMessage[];
  mode?: 'vivo';
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const { modelo, esfuerzo } = await cargarAjustes();
  let res;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...tokenHeaders(),
      },
      body: JSON.stringify({ messages, profile_id: modelo, ...(esfuerzo ? { effort: esfuerzo } : {}), ...(mode ? { mode } : {}) }),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    yield failure('network', 'No me pude conectar con el servidor. Revisa tu conexión.');
    return;
  }
  if (signal?.aborted) return;
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
  if (!finished && !signal?.aborted) yield failure('network', 'La respuesta se cortó. Inténtalo de nuevo.');
}
