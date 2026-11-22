import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import { API_URL, tokenHeaders } from './client';
import { NETWORK_MESSAGE, readTranscribeResponse, type TranscribeResult } from './transcribe-response';

export async function transcribeAudio(uri: string): Promise<TranscribeResult> {
  let res;
  try {
    res = await fetch(`${API_URL}/api/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'audio/mp4', ...tokenHeaders() },
      body: new File(uri),
    });
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  }
  const body: unknown = await res.json().catch(() => null);
  return readTranscribeResponse(res.status, body);
}

export type TokenRealtimeResult = { ok: true; token: string } | { ok: false; message: string };

export async function pedirTokenRealtime(): Promise<TokenRealtimeResult> {
  let res;
  try {
    res = await fetch(`${API_URL}/api/transcribe/token`, { method: 'POST', headers: tokenHeaders() });
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  }
  const body: unknown = await res.json().catch(() => null);
  const datos = body !== null && typeof body === 'object' ? (body as { error?: unknown; token?: unknown }) : {};
  if (typeof datos.error === 'string' && datos.error) return { ok: false, message: datos.error };
  if (!res.ok || typeof datos.token !== 'string' || !datos.token) return { ok: false, message: `El servidor respondió ${res.status}.` };
  return { ok: true, token: datos.token };
}
