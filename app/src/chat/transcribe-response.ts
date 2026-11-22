export type TranscribeResult = { ok: true; text: string } | { ok: false; message: string };

export const NETWORK_MESSAGE = 'No me pude conectar con el servidor. Revisa tu conexión.';

export function readTranscribeResponse(status: number, body: unknown): TranscribeResult {
  const data = body !== null && typeof body === 'object' ? (body as { error?: unknown; text?: unknown }) : {};
  if (typeof data.error === 'string' && data.error) return { ok: false, message: data.error };
  if (status < 200 || status >= 300) return { ok: false, message: `El servidor respondió ${status}.` };
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) return { ok: false, message: 'No te escuché. Inténtalo de nuevo.' };
  return { ok: true, text };
}
