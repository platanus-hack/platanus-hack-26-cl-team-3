import Anthropic from "@anthropic-ai/sdk";
import type { Adapter } from "../chat/orchestrator";
import { ProviderError } from "./errors";

const MAX_TOKENS = 4096;

let client: Anthropic | undefined;

export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const PROVIDER_MESSAGE = "El proveedor del modelo falló. Inténtalo de nuevo.";
const CREDIT_MESSAGE = "Se acabó el crédito de la key de Anthropic.";

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { type?: unknown; error?: { type?: unknown } } | undefined;
    if (e.status === 402 || body?.error?.type === "billing_error" || body?.type === "billing_error") {
      return new ProviderError(CREDIT_MESSAGE, "credit");
    }
  }
  return new ProviderError(PROVIDER_MESSAGE, "provider");
}

export const anthropic: Adapter = async function* ({ profile, system, tools, messages, signal }) {
  try {
    const stream = getClient().messages.stream(
      {
        model: profile.model,
        max_tokens: MAX_TOKENS,
        ...(profile.effort ? { output_config: { effort: profile.effort } } : {}),
        system,
        tools,
        messages,
      },
      { signal },
    );
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
    if (!signal?.aborted) console.error(e);
    throw toProviderError(e);
  }
};
