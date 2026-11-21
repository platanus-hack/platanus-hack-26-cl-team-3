import type { ContentBlockParam, Message, MessageParam, ToolResultBlockParam, ToolUseBlock, ToolUnion } from "@anthropic-ai/sdk/resources/messages";
import { ProviderError } from "../llm/errors";
import type { ToolRegistry } from "../tools";
import type { ChatEvent, ErrorCode, Profile } from "./contract";
import { SYSTEM_PROMPT } from "./system-prompt";

export interface AdapterArgs {
  profile: Profile;
  system: string;
  tools: ToolUnion[];
  messages: MessageParam[];
  signal?: AbortSignal;
}

export type Adapter = (args: AdapterArgs) => AsyncGenerator<ChatEvent, Message>;

export interface TurnArgs {
  messages: MessageParam[];
  profile: Profile;
  adapter: Adapter;
  tools: ToolRegistry;
  system?: string;
  signal?: AbortSignal;
}

const MAX_ROUNDS = 6;

const error = (code: ErrorCode, message: string): ChatEvent => ({ event: "error", data: { code, message } });

function errorResult(toolUseId: string, text: string): ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: toolUseId, content: [{ type: "text", text }], is_error: true };
}

interface ToolRun {
  result: ToolResultBlockParam;
  events: ChatEvent[];
}

async function runTool(tools: ToolRegistry, use: ToolUseBlock): Promise<ToolRun> {
  const tool = tools[use.name];
  if (!tool) return { result: errorResult(use.id, `Herramienta desconocida: ${use.name}`), events: [] };
  try {
    const r = await tool.run(use.input);
    const result: ToolResultBlockParam = { type: "tool_result", tool_use_id: use.id, content: r.content };
    if (r.is_error) result.is_error = true;
    return { result, events: r.events ?? [] };
  } catch (e) {
    console.error(e);
    return { result: errorResult(use.id, "Error al ejecutar la herramienta."), events: [] };
  }
}

async function* round(
  adapter: Adapter,
  args: AdapterArgs,
  offset: number,
): AsyncGenerator<ChatEvent, { message: Message; blocks: number }> {
  const it = adapter(args)[Symbol.asyncIterator]();
  let maxBlock = -1;
  for (;;) {
    const { value, done } = await it.next();
    if (done) return { message: value, blocks: maxBlock + 1 };
    if (value.event === "text" || value.event === "citation") {
      maxBlock = Math.max(maxBlock, value.data.block);
      yield { ...value, data: { ...value.data, block: value.data.block + offset } } as ChatEvent;
    } else {
      yield value;
    }
  }
}

export async function* runTurn({ messages, profile, adapter, tools, system = SYSTEM_PROMPT, signal }: TurnArgs): AsyncGenerator<ChatEvent> {
  const history = [...messages];
  const fresh: MessageParam[] = [];
  const definitions = Object.values(tools).map((t) => t.definition);
  let offset = 0;

  try {
    for (let n = 0; n < MAX_ROUNDS; n++) {
      if (signal?.aborted) return;
      const g = round(adapter, { profile, system, tools: definitions, messages: [...history], signal }, offset);
      let r: { message: Message; blocks: number };
      for (;;) {
        const { value, done } = await g.next();
        if (done) {
          r = value;
          break;
        }
        yield value;
      }
      offset += r.blocks;
      const { message } = r;

      if (message.stop_reason === "refusal") {
        yield error("refusal", "No pude responder. Revisa el manual o consulta a un mecánico.");
        return;
      }

      const assistant: MessageParam = { role: "assistant", content: message.content as ContentBlockParam[] };
      history.push(assistant);
      fresh.push(assistant);

      if (message.stop_reason === "pause_turn") continue;

      const uses = message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason === "max_tokens" && uses.length > 0) {
        yield error("internal", "La respuesta se cortó antes de terminar.");
        return;
      }
      if (message.stop_reason !== "tool_use") {
        yield { event: "done", data: message.stop_reason === "max_tokens" ? { messages: fresh, truncated: true } : { messages: fresh } };
        return;
      }

      const runs = await Promise.all(uses.map((u) => runTool(tools, u)));
      for (const r of runs) yield* r.events;
      const user: MessageParam = { role: "user", content: runs.map((r) => r.result) };
      history.push(user);
      fresh.push(user);
    }
    yield error("limit", "Demasiadas vueltas de herramientas en un solo turno.");
  } catch (e) {
    if (e instanceof ProviderError) {
      yield error(e.code, e.message);
    } else {
      console.error(e);
      yield error("internal", "Error interno.");
    }
  }
}
