import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../server/responses";
import type { ConversationStore } from "./store";

const LIST_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (req.method === "GET") {
        const cursor = new URL(req.url!, "http://localhost").searchParams.get("before");
        const [updated_at, id, extra] = cursor?.split(",") ?? [];
        if (cursor !== null && (!updated_at || !UUID.test(id ?? "") || extra !== undefined)) return json(res, 400, { error: "Cursor inválido" });
        const rows = await store.list(deviceId, LIST_LIMIT + 1, cursor ? { updated_at, id } : undefined);
        const conversations = rows.slice(0, LIST_LIMIT);
        const last = conversations.at(-1);
        return json(res, 200, { conversations, next: rows.length > LIST_LIMIT && last ? `${last.updated_at},${last.id}` : null });
      }
      return json(res, 404, { error: "No encontrado" });
    }

    const id = pathname.startsWith("/api/conversations/") ? pathname.slice("/api/conversations/".length) : "";
    if (!UUID.test(id)) return json(res, 404, { error: "No encontrado" });
    if (req.method === "GET") {
      const conv = await store.get(deviceId, id);
      return conv ? json(res, 200, conv) : json(res, 404, { error: "No encontrado" });
    }
    return json(res, 404, { error: "No encontrado" });
  } catch {
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
}
