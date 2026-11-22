import { TranscribeError } from "./errors";
import type { Transcriber } from "./handler";
import { KEYTERMS } from "./keyterms";

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

export const elevenlabsTranscriber: Transcriber = async (audio, contentType) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new TranscribeError("config");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: contentType }), "pregunta.m4a");
  form.append("model_id", "scribe_v3");
  form.append("language_code", "es");
  form.append("tag_audio_events", "false");
  for (const term of KEYTERMS) form.append("keyterms", term);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { "xi-api-key": key }, body: form });
  } catch (e) {
    console.error("ElevenLabs: fallo de red", e instanceof Error ? e.message : e);
    throw new TranscribeError("upstream");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`ElevenLabs respondió ${res.status}: ${body.slice(0, 300)}`);
    throw new TranscribeError(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "busy" : "upstream");
  }
  try {
    const { text } = (await res.json()) as { text?: unknown };
    if (typeof text !== "string") throw new Error("respuesta sin text");
    return text.trim();
  } catch (e) {
    console.error("ElevenLabs: respuesta inválida", e instanceof Error ? e.message : e);
    throw new TranscribeError("upstream");
  }
};
