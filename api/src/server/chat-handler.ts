import type { IncomingMessage, ServerResponse } from "node:http";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { EFFORTS, type Effort, type Profile } from "../chat/contract";
import { contextWindow } from "../chat/context";
import { runTurn } from "../chat/orchestrator";
import { stripImages, titleFrom } from "../conversations/sanitize";
import type { ConversationStore } from "../conversations/store";
import { createTurnRecorder } from "../runlog/recorder";
import type { RunLogStore } from "../runlog/store";
import { systemPrompt, VIVO_PROMPT } from "../chat/system-prompt";
import type { Adapter } from "../chat/orchestrator";
import { anthropic } from "../llm/anthropic";
import { resolveProfile } from "../llm/profiles";
import { toolsFor, type ToolRegistry } from "../tools";
import { resolveVehicle, type VehicleProfile } from "../vehicles/registry";
import { json, openSSE, sendEvent } from "./responses";

export const MAX_BODY = 1024 * 1024;
const MAX_MESSAGES = 200;
export const HEARTBEAT_MS = 15_000;
const VEHICLE_ID = /^[a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatStores {
  conversations?: ConversationStore | null;
  runlog?: RunLogStore | null;
}

export class BodyTooLarge extends Error {}

type Validation = { error: string } | { error?: undefined; profile: Profile; messages: MessageParam[]; system: string; vehicle: VehicleProfile; tools: ToolRegistry };

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
  const { messages, profile_id, mode, effort, vehicle_id } = body as { messages?: unknown; profile_id?: unknown; mode?: unknown; effort?: unknown; vehicle_id?: unknown };
  if (!Array.isArray(messages)) return { error: "Falta `messages` (array)" };
  if (messages.length > MAX_MESSAGES) return { error: "La conversación está muy larga. Toca «Nueva conversación»." };
  const last = messages.at(-1) as { role?: unknown } | undefined;
  if (!last || last.role !== "user") return { error: "El último mensaje debe ser role: user" };
  const base = resolveProfile(profile_id);
  if (!base) return { error: "profile_id no existe" };
  if (effort !== undefined && !EFFORTS.includes(effort as Effort)) return { error: "effort no existe" };
  const profile = effort === undefined ? base : { ...base, effort: effort as Effort };
  if (mode !== undefined && mode !== "vivo") return { error: "mode no existe" };
  if (vehicle_id !== undefined && (typeof vehicle_id !== "string" || !VEHICLE_ID.test(vehicle_id))) return { error: "vehicle_id inválido" };
  const vehicle = resolveVehicle(vehicle_id);
  const basePrompt = systemPrompt(vehicle);
  const system = mode === "vivo" ? `${basePrompt}\n\n${VIVO_PROMPT}` : basePrompt;
  return { profile, messages: messages as MessageParam[], system, vehicle, tools: toolsFor(vehicle) };
}

export async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  adapter?: Adapter,
  heartbeatMs: number = HEARTBEAT_MS,
  { conversations = null, runlog = null }: ChatStores = {},
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
  const rawConversation = (body as { conversation_id?: unknown }).conversation_id;
  if (rawConversation !== undefined && (typeof rawConversation !== "string" || !UUID.test(rawConversation))) {
    return json(res, 400, { error: "conversation_id inválido" });
  }
  const conversationId = rawConversation as string | undefined;
  const rawDevice = req.headers["x-device-id"];
  const deviceId = typeof rawDevice === "string" && UUID.test(rawDevice) ? rawDevice : null;
  if (!adapter && !process.env.ANTHROPIC_API_KEY) return json(res, 500, { error: "Falta ANTHROPIC_API_KEY" });

  openSSE(res);
  const controller = new AbortController();
  let finished = false;
  const heartbeat = setInterval(() => res.write(": ping\n\n"), heartbeatMs);
  res.on("close", () => {
    clearInterval(heartbeat);
    if (!finished) controller.abort();
  });
  const window = contextWindow(v.messages);
  const { tools } = v;
  const definitions = Object.values(tools).map((t) => t.definition);
  const recorder = createTurnRecorder({
    model: v.profile.model,
    effort: v.profile.effort,
    mode: (body as { mode?: string }).mode,
    system: v.system,
    definitions,
    contextMessages: window.length,
    messages: v.messages,
    deviceId,
    vehicleId: v.vehicle.id,
  });
  let outcome: string | null = null;
  let savedId: string | null = null;
  let fresh: MessageParam[] | null = null;
  try {
    for await (const e of runTurn({
      messages: window,
      profile: v.profile,
      system: v.system,
      adapter: adapter ?? anthropic,
      tools,
      signal: controller.signal,
      log: recorder.log,
    })) {
      if (controller.signal.aborted) break;
      if (e.event === "done") {
        outcome = e.data.truncated ? "truncated" : "done";
        fresh = e.data.messages;
        savedId = await saveConversation(conversations, deviceId, conversationId, v.messages, e.data.messages, v.vehicle.id);
        e.data = { ...e.data, ...(savedId ? { conversation_id: savedId } : {}), turn_id: recorder.id };
      } else if (e.event === "error") {
        outcome = `error:${e.data.code}`;
      }
      sendEvent(res, e.event, e.data);
    }
  } catch (e) {
    console.error(e);
    outcome = "error:internal";
    if (!controller.signal.aborted) sendEvent(res, "error", { code: "internal", message: "Error interno." });
  }
  finished = true;
  clearInterval(heartbeat);
  res.end();
  if (runlog) {
    try {
      const { turn, tools: runs } = recorder.finish(outcome ?? "aborted", savedId ?? conversationId ?? null, fresh);
      runlog.saveTurn(turn, runs);
    } catch (e) {
      console.error(e);
    }
  }
}

async function saveConversation(
  store: ConversationStore | null,
  deviceId: string | null,
  conversationId: string | undefined,
  sent: MessageParam[],
  fresh: MessageParam[],
  vehicleId: string,
): Promise<string | null> {
  if (!store || !deviceId) return null;
  try {
    const data = { title: titleFrom(sent), messages: stripImages([...sent, ...fresh]), vehicle_id: vehicleId };
    if (conversationId && (await store.update(deviceId, conversationId, data))) return conversationId;
    return await store.create(deviceId, data);
  } catch (e) {
    console.error(e);
    return null;
  }
}
