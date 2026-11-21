import Anthropic from "@anthropic-ai/sdk";
import { ErrorProveedor } from "./chat.js";

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api";
const MAX_TOKENS = 4096;

let client;

export async function* openrouter({ perfil, system, herramientas, mensajes }) {
  client ??= new Anthropic({ baseURL: BASE_URL, authToken: process.env.OPENROUTER_API_KEY, apiKey: null });
  try {
    const stream = client.messages.stream({
      model: perfil.modelo,
      max_tokens: MAX_TOKENS,
      ...(perfil.effort ? { output_config: { effort: perfil.effort } } : {}),
      system,
      tools: herramientas,
      messages: mensajes,
    });
    let bloque = -1;
    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        if (ev.content_block.type === "text") bloque++;
        else if (ev.content_block.type === "tool_use") yield { evento: "herramienta", datos: { nombre: ev.content_block.name } };
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") {
          yield { evento: "texto", datos: { bloque, texto: ev.delta.text } };
        } else if (ev.delta.type === "citations_delta" && ev.delta.citation.type === "search_result_location") {
          const c = ev.delta.citation;
          yield { evento: "cita", datos: { bloque, titulo: c.title ?? "", fuente: c.source, texto_citado: c.cited_text } };
        }
      }
    }
    return await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      if (e.status === 402) throw new ErrorProveedor("Se acabó el crédito de la key de OpenRouter.", "credito");
      throw new ErrorProveedor(e.message, "proveedor");
    }
    throw e;
  }
}
