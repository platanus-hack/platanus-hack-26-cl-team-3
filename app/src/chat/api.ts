import { fetch } from 'expo/fetch';

import type { CodigoError, Evento, MensajeAnthropic } from './contrato';
import { separarEventos } from './sse';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const fallo = (codigo: CodigoError, mensaje: string): Evento => ({ tipo: 'error', codigo, mensaje });

export async function* turno({ mensajes }: { mensajes: MensajeAnthropic[] }): AsyncGenerator<Evento> {
  if (!API_URL) {
    yield fallo('config', 'Falta EXPO_PUBLIC_API_URL en app/.env.local.');
    return;
  }
  let res;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ mensajes }),
    });
  } catch {
    yield fallo('red', 'No me pude conectar con el servidor. Revisa tu conexión.');
    return;
  }
  if (!res.ok || !res.body) {
    const mensaje = await res
      .json()
      .then((cuerpo: { error?: string }) => cuerpo.error ?? `El servidor respondió ${res.status}.`)
      .catch(() => `El servidor respondió ${res.status}.`);
    yield fallo(res.status === 500 ? 'config' : 'interno', mensaje);
    return;
  }
  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  let terminado = false;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const { eventos, resto } = separarEventos(buffer);
      buffer = resto;
      for (const ev of eventos) {
        if (ev.tipo === 'fin' || ev.tipo === 'error') terminado = true;
        yield ev;
      }
    }
  } catch {}
  if (!terminado) yield fallo('red', 'La respuesta se cortó. Inténtalo de nuevo.');
}
