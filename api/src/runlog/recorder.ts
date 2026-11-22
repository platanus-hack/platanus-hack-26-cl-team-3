import { createHash, randomUUID } from "node:crypto";
import type { Message, MessageParam, ToolUnion } from "@anthropic-ai/sdk/resources/messages";
import type { TurnLogger } from "../chat/orchestrator";
import type { ToolRunLog, TurnLog } from "./store";

export interface RecorderInit {
  model: string;
  effort?: string;
  mode?: string;
  system: string;
  definitions: ToolUnion[];
  contextMessages: number;
  messages: MessageParam[];
  deviceId: string | null;
  vehicleId: string | null;
}

export interface TurnRecorder {
  id: string;
  log: TurnLogger;
  finish(outcome: string, conversationId: string | null, fresh: MessageParam[] | null): { turn: TurnLog; tools: ToolRunLog[] };
}

export const promptVersion = (system: string, definitions: ToolUnion[]): string =>
  createHash("sha256").update(system).update(JSON.stringify(definitions)).digest("hex").slice(0, 12);

export function lastQuestion(messages: MessageParam[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  if (typeof last.content === "string") return last.content;
  const text = last.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  return text === "" ? null : text;
}

export function createTurnRecorder(init: RecorderInit): TurnRecorder {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const started = Date.now();
  const tools: ToolRunLog[] = [];
  const answer: string[] = [];
  let rounds = 0;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  const question = lastQuestion(init.messages);
  const version = promptVersion(init.system, init.definitions);

  const log: TurnLogger = {
    onRound(message: Message) {
      rounds++;
      usage.input += message.usage?.input_tokens ?? 0;
      usage.output += message.usage?.output_tokens ?? 0;
      usage.cacheRead += message.usage?.cache_read_input_tokens ?? 0;
      usage.cacheCreation += message.usage?.cache_creation_input_tokens ?? 0;
      for (const b of message.content) if (b.type === "text") answer.push(b.text);
    },
    onTool(run) {
      tools.push({
        round: run.round,
        tool_use_id: run.tool_use_id,
        name: run.name,
        input: JSON.stringify(run.input ?? null),
        output: run.output === undefined ? null : JSON.stringify(run.output),
        is_error: run.is_error,
        duration_ms: run.duration_ms,
      });
    },
  };

  return {
    id,
    log,
    finish(outcome, conversationId, fresh) {
      const turn: TurnLog = {
        id,
        conversation_id: conversationId,
        device_id: init.deviceId,
        vehicle_id: init.vehicleId,
        created_at: createdAt,
        model: init.model,
        effort: init.effort ?? null,
        mode: init.mode ?? null,
        prompt_version: version,
        context_messages: init.contextMessages,
        question,
        answer: answer.length > 0 ? answer.join("") : null,
        fresh: fresh ? JSON.stringify(fresh) : null,
        outcome,
        rounds,
        input_tokens: rounds > 0 ? usage.input : null,
        output_tokens: rounds > 0 ? usage.output : null,
        cache_read_tokens: rounds > 0 ? usage.cacheRead : null,
        cache_creation_tokens: rounds > 0 ? usage.cacheCreation : null,
        duration_ms: Date.now() - started,
      };
      return { turn, tools };
    },
  };
}
