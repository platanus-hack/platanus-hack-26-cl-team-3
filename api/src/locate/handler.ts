import type { IncomingMessage, ServerResponse } from "node:http";
import { ProviderError } from "../llm/errors";
import { BodyTooLarge, readBody } from "../server/chat-handler";
import { json } from "../server/responses";
import { normalizePoints, validateLocate } from "./contract";
import type { Locator } from "./contract";
import { anthropicLocator } from "./locator";

export async function handleLocate(req: IncomingMessage, res: ServerResponse, locator?: Locator): Promise<void> {
  const token = process.env.CHAT_TOKEN;
  if (token && req.headers["x-chat-token"] !== token) return json(res, 401, { error: "No autorizado." });
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    if (e instanceof BodyTooLarge) return json(res, 413, { error: "La imagen es demasiado grande." }, { connection: "close" });
    return json(res, 400, { error: "JSON inválido" });
  }
  const v = validateLocate(body);
  if (v.error !== undefined) return json(res, 400, { error: v.error });
  if (!locator && !process.env.ANTHROPIC_API_KEY) return json(res, 500, { error: "Falta ANTHROPIC_API_KEY" });
  try {
    const raw = await (locator ?? anthropicLocator)(v.input);
    json(res, 200, { points: normalizePoints(raw, v.input.width, v.input.height, v.input.parts) });
  } catch (e) {
    if (e instanceof ProviderError && e.code === "credit") return json(res, 402, { error: e.message });
    json(res, 502, { error: e instanceof ProviderError ? e.message : "No se pudo ubicar las piezas. Inténtalo de nuevo." });
  }
}
