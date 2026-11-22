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
