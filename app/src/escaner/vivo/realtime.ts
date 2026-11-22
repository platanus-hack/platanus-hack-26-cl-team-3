import { OPCIONES_VAD } from './vad';

const ENDPOINT = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const TASAS = [8000, 16000, 22050, 24000, 44100, 48000];
const ERRORES = new Set([
  'auth_error',
  'quota_exceeded',
  'transcriber_error',
  'input_error',
  'invalid_request',
  'error',
  'commit_throttled',
  'unaccepted_terms',
  'rate_limited',
  'queue_overflow',
  'resource_exhausted',
  'session_time_limit_exceeded',
  'chunk_size_exceeded',
  'insufficient_audio_activity',
]);

export type MensajeRealtime =
  | { tipo: 'sesion' }
  | { tipo: 'parcial'; texto: string }
  | { tipo: 'final'; texto: string }
  | { tipo: 'error'; codigo: string };

export function urlRealtime(token: string, sampleRate: number): string | null {
  if (!TASAS.includes(sampleRate)) return null;
  const query: Record<string, string> = {
    model_id: 'scribe_v2_realtime',
    audio_format: `pcm_${sampleRate}`,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: String(OPCIONES_VAD.silencioFinMs / 1000),
    language_code: 'es',
    token,
  };
  const partes = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `${ENDPOINT}?${partes.join('&')}`;
}

export function dbDe(muestras: Int16Array): number {
  if (muestras.length === 0) return -160;
  let suma = 0;
  for (const m of muestras) suma += m * m;
  const rms = Math.sqrt(suma / muestras.length);
  return rms === 0 ? -160 : 20 * Math.log10(rms / 32768);
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function aBase64(bytes: Uint8Array): string {
  let salida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const resto = bytes.length - i;
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    salida += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
    salida += resto > 1 ? ALFABETO[(n >> 6) & 63] : '=';
    salida += resto > 2 ? ALFABETO[n & 63] : '=';
  }
  return salida;
}

export function leerMensaje(raw: string): MensajeRealtime | null {
  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return null;
  }
  if (datos === null || typeof datos !== 'object') return null;
  const { message_type: tipo, text } = datos as { message_type?: unknown; text?: unknown };
  if (typeof tipo !== 'string') return null;
  if (tipo === 'session_started') return { tipo: 'sesion' };
  if (tipo === 'partial_transcript') return { tipo: 'parcial', texto: typeof text === 'string' ? text : '' };
  if (tipo === 'committed_transcript') return { tipo: 'final', texto: typeof text === 'string' ? text : '' };
  if (ERRORES.has(tipo)) return { tipo: 'error', codigo: tipo };
  return null;
}
