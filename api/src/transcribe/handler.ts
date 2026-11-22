import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyTooLarge, readRaw } from "../server/chat-handler";
import { json } from "../server/responses";
import { elevenlabsTranscriber } from "./elevenlabs";
import { TranscribeError } from "./errors";

export type Transcriber = (audio: Buffer, contentType: string) => Promise<string>;

export const MAX_AUDIO = 2 * 1024 * 1024;

const FAILURES = {
  config: [500, "Falta ELEVENLABS_API_KEY en el servidor."],
  auth: [500, "La key de ElevenLabs no es válida o no tiene permiso de Speech to Text."],
  busy: [503, "El servicio de voz está ocupado. Inténtalo de nuevo."],
  upstream: [502, "No pude transcribir el audio. Inténtalo de nuevo."],
} as const;

export async function handleTranscribe(
  req: IncomingMessage,
  res: ServerResponse,
  transcriber: Transcriber = elevenlabsTranscriber,
): Promise<void> {
  const token = process.env.CHAT_TOKEN;
  if (token && req.headers["x-chat-token"] !== token) return json(res, 401, { error: "No autorizado." });
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("audio/")) return json(res, 400, { error: "El audio debe llegar con content-type audio/*." });
  let audio: Buffer;
  try {
    audio = await readRaw(req, MAX_AUDIO);
  } catch (e) {
    if (e instanceof BodyTooLarge) return json(res, 413, { error: "El audio es muy largo." }, { connection: "close" });
    return json(res, 400, { error: "No pude leer el audio." });
  }
  if (audio.length === 0) return json(res, 400, { error: "El audio está vacío." });
  try {
    json(res, 200, { text: await transcriber(audio, contentType) });
  } catch (e) {
    if (!(e instanceof TranscribeError)) console.error(e);
    const [status, error] = FAILURES[e instanceof TranscribeError ? e.kind : "upstream"];
    json(res, status, { error });
  }
}
