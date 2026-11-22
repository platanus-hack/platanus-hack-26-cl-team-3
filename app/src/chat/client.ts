import { fetch } from 'expo/fetch';

import type { AnthropicMessage, ChatEvent, ErrorCode } from './contract';
import { cargarAjustes } from '../ajustes';
import { deviceId } from './remote-history';
import { fitsInitialImport, localContext } from './transport';
import { splitEvents } from './sse';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ph26.berguecio.cl';

export const CHAT_TOKEN = process.env.EXPO_PUBLIC_CHAT_TOKEN;

export const tokenHeaders = (): Record<string, string> => (CHAT_TOKEN ? { 'x-chat-token': CHAT_TOKEN } : {});

const failure = (code: ErrorCode, message: string): ChatEvent => ({ type: 'error', code, message });

export async function* runTurn({
  messages,
  mode,
  signal, conversationId, vehicleId, requestId,
}: {
  messages: AnthropicMessage[];
  mode?: 'vivo';
  conversationId?: string | null;
  vehicleId?: string;
  requestId?: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const { modelo, esfuerzo } = await cargarAjustes();
  const registered = await deviceId();
  if (conversationId && !registered) {
    yield failure('network', 'No se pudo cargar el historial. Inténtalo de nuevo.');
    return;
  }
  // A local-only archive that exceeds the import limit stays complete on this device.
  const device = conversationId || (registered && fitsInitialImport(messages)) ? registered : null;
  const send = (incremental: boolean) => fetch(`${API_URL}/api/chat${incremental ? '/turn' : ''}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'text/event-stream', ...tokenHeaders(),
      ...(device ? { 'x-device-id': device } : {}),
    },
    body: JSON.stringify({
      messages: !device ? localContext(messages) : incremental && conversationId ? messages.slice(-1) : messages,
      ...(incremental ? { request_id: requestId, base_count: messages.length - 1 } : {}),
      vehicle_id: vehicleId, conversation_id: conversationId || undefined, profile_id: modelo,
      effort: esfuerzo || undefined, mode,
    }),
    signal,
  });
  let res;
  try {
    const incremental = Boolean(requestId && device);
    res = await send(incremental);
    // Older servers only implement the full-history route.
    if (incremental && res.status === 404) res = await send(false);
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
