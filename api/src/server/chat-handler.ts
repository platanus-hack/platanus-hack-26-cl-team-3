import type { IncomingMessage, ServerResponse } from "node:http";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Profile } from "../chat/contract";
import { runTurn } from "../chat/orchestrator";
import type { Adapter } from "../chat/orchestrator";
import { openrouter } from "../llm/openrouter";
import { resolveProfile } from "../llm/profiles";
import { tools } from "../tools";
import { json, openSSE, sendEvent } from "./responses";

const MAX_BODY = 1024 * 1024;
const MAX_MESSAGES = 200;
export const HEARTBEAT_MS = 15_000;

class BodyTooLarge extends Error {}

type Validation = { error: string } | { error?: undefined; profile: Profile; messages: MessageParam[] };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const parts: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      if (total > MAX_BODY) return;
      total += chunk.length;
      if (total > MAX_BODY) {
        parts.length = 0;
        reject(new BodyTooLarge());
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

export function validate(body: unknown): Validation {
  if (body === null || typeof body !== "object") return { error: "Cuerpo inválido" };
  const { messages, profile_id } = body as { messages?: unknown; profile_id?: unknown };
  if (!Array.isArray(messages)) return { error: "Falta `messages` (array)" };
  if (messages.length > MAX_MESSAGES) return { error: "La conversación está muy larga. Toca «Nueva conversación»." };
  const last = messages.at(-1) as { role?: unknown } | undefined;
  if (!last || last.role !== "user") return { error: "El último mensaje debe ser role: user" };
  const profile = resolveProfile(profile_id);
  if (!profile) return { error: "profile_id no existe" };
  return { profile, messages: messages as MessageParam[] };
}

export async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  adapter?: Adapter,
  heartbeatMs: number = HEARTBEAT_MS,
): Promise<void> {
  const token = process.env.CHAT_TOKEN;
  if (token && req.headers["x-chat-token"] !== token) return json(res, 401, { error: "No autorizado." });
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    if (e instanceof BodyTooLarge) return json(res, 413, { error: "El mensaje es demasiado grande." }, { connection: "close" });
    return json(res, 400, { error: "JSON inválido" });
  }
  const v = validate(body);
  if (v.error !== undefined) return json(res, 400, { error: v.error });
  if (!adapter && !process.env.OPENROUTER_API_KEY) return json(res, 500, { error: "Falta OPENROUTER_API_KEY" });

  openSSE(res);
  const controller = new AbortController();
  let finished = false;
  const heartbeat = setInterval(() => res.write(": ping\n\n"), heartbeatMs);
  res.on("close", () => {
    clearInterval(heartbeat);
    if (!finished) controller.abort();
  });
  try {
    for await (const e of runTurn({
      messages: v.messages,
      profile: v.profile,
      adapter: adapter ?? openrouter,
      tools,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) break;
      sendEvent(res, e.event, e.data);
    }
  } catch (e) {
    console.error(e);
    if (!controller.signal.aborted) sendEvent(res, "error", { code: "internal", message: "Error interno." });
  }
  finished = true;
  clearInterval(heartbeat);
  res.end();
}
