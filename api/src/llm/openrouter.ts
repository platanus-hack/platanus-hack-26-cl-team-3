import Anthropic from "@anthropic-ai/sdk";
import type { Adapter } from "../chat/orchestrator";
import { ProviderError } from "./errors";

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api";
const MAX_TOKENS = 4096;

let client: Anthropic | undefined;

export const openrouter: Adapter = async function* ({ profile, system, tools, messages }) {
  client ??= new Anthropic({ baseURL: BASE_URL, authToken: process.env.OPENROUTER_API_KEY, apiKey: null });
  try {
    const stream = client.messages.stream({
      model: profile.model,
      max_tokens: MAX_TOKENS,
      ...(profile.effort ? { output_config: { effort: profile.effort } } : {}),
      system,
      tools,
      messages,
    });
    let block = -1;
    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        if (ev.content_block.type === "text") block++;
        else if (ev.content_block.type === "tool_use") yield { event: "tool", data: { name: ev.content_block.name } };
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") {
          yield { event: "text", data: { block, text: ev.delta.text } };
        } else if (ev.delta.type === "citations_delta" && ev.delta.citation.type === "search_result_location") {
          const c = ev.delta.citation;
          yield { event: "citation", data: { block, title: c.title ?? "", source: c.source, cited_text: c.cited_text } };
        }
      }
    }
    return await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      if (e.status === 402) throw new ProviderError("Se acabó el crédito de la key de OpenRouter.", "credit");
      throw new ProviderError(e.message, "provider");
    }
    throw e;
  }
};
