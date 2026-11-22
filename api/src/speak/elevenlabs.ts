import { SpeakError } from "./errors";
import type { Speaker } from "./handler";

export const VOCES = {
  jorge: "Rt1JHkPO27QCUX6Nd5bV",
  luisa: "ByzPpv6d6pT90CCpgb7k",
  luis: "ziigB5Dny14v5lDIHo0x",
} as const;

export type VozId = keyof typeof VOCES;

export const VOZ_DEFECTO: VozId = "jorge";

export const elevenlabsSpeaker: Speaker = async (texto, signal, voz) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new SpeakError("config");
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOCES[voz]}/stream?output_format=mp3_44100_64`, {
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
