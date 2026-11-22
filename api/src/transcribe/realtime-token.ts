import { TranscribeError } from "./errors";

const ENDPOINT = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

export type RealtimeTokenProvider = () => Promise<string>;

export const elevenlabsRealtimeToken: RealtimeTokenProvider = async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new TranscribeError("config");
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { "xi-api-key": key } });
  } catch (e) {
    console.error("ElevenLabs token: fallo de red", e instanceof Error ? e.message : e);
    throw new TranscribeError("upstream");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`ElevenLabs token respondió ${res.status}: ${body.slice(0, 300)}`);
    throw new TranscribeError(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "busy" : "upstream");
  }
  try {
    const { token } = (await res.json()) as { token?: unknown };
    if (typeof token !== "string" || !token) throw new Error("respuesta sin token");
    return token;
  } catch (e) {
    console.error("ElevenLabs token: respuesta inválida", e instanceof Error ? e.message : e);
    throw new TranscribeError("upstream");
  }
};
