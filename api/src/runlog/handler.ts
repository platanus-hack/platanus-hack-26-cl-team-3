import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../server/responses";
import type { LogCursor, RunLogStore } from "./store";

const PREFIX = "/api/logs/turns/";
const LIST_LIMIT = 50;
const CONVERSATION_LIMIT = 20;

function authorized(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function parseLimit(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 100 ? n : null;
}

function encodeCursor(c: LogCursor): string {
  return Buffer.from(JSON.stringify([c.created_at, c.id])).toString("base64url");
}

function decodeCursor(raw: string): LogCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [created_at, id] = parsed;
    return typeof created_at === "string" && typeof id === "string" ? { created_at, id } : null;
  } catch {
    return null;
  }
}

export function handleLogs(req: IncomingMessage, res: ServerResponse, pathname: string, store: RunLogStore | null): void {
  const token = process.env.LOGS_TOKEN;
  if (!token || req.method !== "GET") return json(res, 404, { error: "No encontrado" });
  if (!authorized(req.headers.authorization, token)) return json(res, 401, { error: "No autorizado." });
  if (!store) return json(res, 503, { error: "Los logs no están disponibles." });

  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  const turnId = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : null;
  if (turnId === "" || turnId?.includes("/")) return json(res, 404, { error: "No encontrado" });

  const limit = parseLimit(params.get("limit"), turnId === null ? LIST_LIMIT : CONVERSATION_LIMIT);
  if (limit === null) return json(res, 400, { error: "limit inválido" });
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : decodeCursor(rawCursor);
  if (rawCursor !== null && !cursor) return json(res, 400, { error: "cursor inválido" });

  try {
    if (turnId === null) {
      const page = store.listTurns(limit, cursor);
      return json(res, 200, { turns: page.items, next_cursor: page.next && encodeCursor(page.next) });
    }
    const page = store.conversationTurns(decodeURIComponent(turnId), limit, cursor);
    if (!page) return json(res, 404, { error: "No encontrado" });
    return json(res, 200, {
      conversation_id: page.conversation_id,
      turns: page.items,
      next_cursor: page.next && encodeCursor(page.next),
    });
  } catch {
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
}
