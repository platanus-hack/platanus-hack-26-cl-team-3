import type { IncomingMessage, ServerResponse } from "node:http";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { EFFORTS, type Effort, type Profile } from "../chat/contract";
import { runTurn } from "../chat/orchestrator";
import { SYSTEM_PROMPT, VIVO_PROMPT } from "../chat/system-prompt";
import type { Adapter } from "../chat/orchestrator";
import { anthropic } from "../llm/anthropic";
import { resolveProfile } from "../llm/profiles";
import { tools } from "../tools";
import { json, openSSE, sendEvent } from "./responses";

export const MAX_BODY = 1024 * 1024;
const MAX_MESSAGES = 200;
export const HEARTBEAT_MS = 15_000;

export class BodyTooLarge extends Error {}

type Validation = { error: string } | { error?: undefined; profile: Profile; messages: MessageParam[]; system: string };

export const readBody = async (req: IncomingMessage): Promise<string> => (await readRaw(req, MAX_BODY)).toString("utf8");

export function readRaw(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const parts: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      if (total > max) return;
      total += chunk.length;
      if (total > max) {
        parts.length = 0;
        reject(new BodyTooLarge());
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

export function validate(body: unknown): Validation {
  if (body === null || typeof body !== "object") return { error: "Cuerpo inválido" };
  const { messages, profile_id, mode, effort } = body as { messages?: unknown; profile_id?: unknown; mode?: unknown; effort?: unknown };
  if (!Array.isArray(messages)) return { error: "Falta `messages` (array)" };
  if (messages.length > MAX_MESSAGES) return { error: "La conversación está muy larga. Toca «Nueva conversación»." };
  const last = messages.at(-1) as { role?: unknown } | undefined;
  if (!last || last.role !== "user") return { error: "El último mensaje debe ser role: user" };
  const base = resolveProfile(profile_id);
  if (!base) return { error: "profile_id no existe" };
  if (effort !== undefined && !EFFORTS.includes(effort as Effort)) return { error: "effort no existe" };
  const profile = effort === undefined ? base : { ...base, effort: effort as Effort };
  if (mode !== undefined && mode !== "vivo") return { error: "mode no existe" };
  const system = mode === "vivo" ? `${SYSTEM_PROMPT}\n\n${VIVO_PROMPT}` : SYSTEM_PROMPT;
  return { profile, messages: messages as MessageParam[], system };
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
  if (!adapter && !process.env.ANTHROPIC_API_KEY) return json(res, 500, { error: "Falta ANTHROPIC_API_KEY" });

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
      system: v.system,
      adapter: adapter ?? anthropic,
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
