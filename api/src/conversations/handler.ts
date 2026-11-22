import type { IncomingMessage, ServerResponse } from "node:http";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BodyTooLarge, readBody } from "../server/chat-handler";
import { json } from "../server/responses";
import { stripImages, titleFrom } from "./sanitize";
import type { ConversationData, ConversationStore } from "./store";

const MAX_MESSAGES = 200;
const LIST_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readMessages(req: IncomingMessage, res: ServerResponse): Promise<ConversationData | null> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    if (e instanceof BodyTooLarge) json(res, 413, { error: "El mensaje es demasiado grande." }, { connection: "close" });
    else json(res, 400, { error: "JSON inválido" });
    return null;
  }
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    json(res, 400, { error: "Falta `messages` (array no vacío)" });
    return null;
  }
  if (messages.length > MAX_MESSAGES) {
    json(res, 400, { error: "La conversación está muy larga." });
    return null;
  }
  const original = messages as MessageParam[];
  return { title: titleFrom(original), messages: stripImages(original) };
}

export async function handleConversations(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  store: ConversationStore | null,
): Promise<void> {
  const token = process.env.CHAT_TOKEN;
  if (token && req.headers["x-chat-token"] !== token) return json(res, 401, { error: "No autorizado." });
  if (!store) return json(res, 503, { error: "El historial no está disponible." });
  try {
    if (pathname === "/api/devices") {
      if (req.method !== "POST") return json(res, 404, { error: "No encontrado" });
      return json(res, 201, { id: await store.createDevice() });
    }
    const deviceId = req.headers["x-device-id"];
    if (typeof deviceId !== "string" || !UUID.test(deviceId)) return json(res, 400, { error: "Falta x-device-id" });

    if (pathname === "/api/conversations") {
      if (req.method === "GET") return json(res, 200, { conversations: await store.list(deviceId, LIST_LIMIT) });
      if (req.method === "POST") {
        const data = await readMessages(req, res);
        if (!data) return;
        const id = await store.create(deviceId, data);
        if (id === null) return json(res, 403, { error: "Dispositivo desconocido." });
        return json(res, 201, { id });
      }
      return json(res, 404, { error: "No encontrado" });
    }

    const id = pathname.startsWith("/api/conversations/") ? pathname.slice("/api/conversations/".length) : "";
    if (!UUID.test(id)) return json(res, 404, { error: "No encontrado" });
    if (req.method === "GET") {
      const conv = await store.get(deviceId, id);
      return conv ? json(res, 200, conv) : json(res, 404, { error: "No encontrado" });
    }
    if (req.method === "PUT") {
      const data = await readMessages(req, res);
      if (!data) return;
      const ok = await store.update(deviceId, id, data);
      if (!ok) return json(res, 404, { error: "No encontrado" });
      res.writeHead(204);
      return void res.end();
    }
    return json(res, 404, { error: "No encontrado" });
  } catch {
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
}
