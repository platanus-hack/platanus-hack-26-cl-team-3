import { SpeakError } from "./errors";
import type { Speaker } from "./handler";

export const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

const ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_64`;

export const elevenlabsSpeaker: Speaker = async (texto, signal) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new SpeakError("config");
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: "eleven_flash_v2_5", language_code: "es" }),
      signal,
    });
  } catch (e) {
    if (!signal.aborted) console.error("ElevenLabs: fallo de red", e instanceof Error ? e.message : e);
    throw new SpeakError("upstream");
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error(`ElevenLabs respondió ${res.status}: ${body.slice(0, 300)}`);
    throw new SpeakError(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "busy" : "upstream");
  }
  return res.body;
};
