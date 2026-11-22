import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { json } from "../server/responses";
import { elevenlabsSpeaker, VOCES, VOZ_DEFECTO, type VozId } from "./elevenlabs";
import { SpeakError } from "./errors";
import { limpiarParaVoz } from "./limpiar";

export type Speaker = (texto: string, signal: AbortSignal, voz: VozId) => Promise<ReadableStream<Uint8Array>>;

export const MAX_TEXTO = 500;

const FAILURES = {
  config: [500, "Falta ELEVENLABS_API_KEY en el servidor."],
  auth: [500, "La key de ElevenLabs no es válida o no tiene permiso de Text to Speech."],
  busy: [503, "El servicio de voz está ocupado. Inténtalo de nuevo."],
  upstream: [502, "No pude generar la voz. Inténtalo de nuevo."],
} as const;

export async function handleSpeak(
  req: IncomingMessage,
  res: ServerResponse,
  speaker: Speaker = elevenlabsSpeaker,
): Promise<void> {
  const token = process.env.CHAT_TOKEN;
  if (token && req.headers["x-chat-token"] !== token) return json(res, 401, { error: "No autorizado." });
  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  const texto = limpiarParaVoz(params.get("text") ?? "");
  if (!texto) return json(res, 400, { error: "Falta el texto." });
  if (texto.length > MAX_TEXTO) return json(res, 400, { error: "El texto es muy largo." });
  const voz = params.get("voz") ?? VOZ_DEFECTO;
  if (!Object.hasOwn(VOCES, voz)) return json(res, 400, { error: "La voz no existe." });
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const stream = await speaker(texto, abort.signal, voz as VozId);
    if (abort.signal.aborted) return void stream.cancel().catch(() => {});
    res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
    const origen = Readable.fromWeb(stream as import("node:stream/web").ReadableStream<Uint8Array>);
    origen.on("error", () => res.destroy());
    origen.pipe(res);
  } catch (e) {
    if (abort.signal.aborted) return;
    if (!(e instanceof SpeakError)) console.error(e);
    const [status, error] = FAILURES[e instanceof SpeakError ? e.kind : "upstream"];
    json(res, status, { error });
  }
}
