import { fetch } from 'expo/fetch';

import type { AnthropicMessage, ChatEvent, ErrorCode } from './contract';
import { cargarAjustes } from '../ajustes';
import { adoptConversation, conversationVehicle, currentConversation } from './history';
import { deviceId } from './remote-history';
import { splitEvents } from './sse';
import { servidor } from '../servidor';

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
  const base = await servidor();
  const device = await deviceId();
  const { id: conversationId, generation } = await currentConversation();
  const vehicleId = await conversationVehicle();
  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...tokenHeaders(),
        ...(device ? { 'x-device-id': device } : {}),
      },
      body: JSON.stringify({ messages, ...(vehicleId ? { vehicle_id: vehicleId } : {}), ...(conversationId ? { conversation_id: conversationId } : {}), profile_id: modelo, ...(esfuerzo ? { effort: esfuerzo } : {}), ...(mode ? { mode } : {}) }),
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
        if (event.type === 'done' && event.conversationId) await adoptConversation(event.conversationId, generation);
        yield event;
      }
    }
  } catch {}
  if (!finished && !signal?.aborted) yield failure('network', 'La respuesta se cortó. Inténtalo de nuevo.');
}
