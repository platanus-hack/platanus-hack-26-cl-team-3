import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import rows from "../data/parts.json";
import type { Tool, ToolOutput } from "./index";

const MAX_INSTRUCTION = 200;

const definition: ToolDefinition = {
  name: "show_in_camera",
  description:
    "Muestra al conductor una tarjeta para abrir la cámara en una pieza del vano del motor. " +
    "Úsala solo con piezas que devolvió lookup_parts. `instruction` es una frase corta en español que dice qué buscar.",
  input_schema: {
    type: "object",
    properties: {
      part: { type: "string", enum: rows.map((p) => p.id) },
      instruction: { type: "string" },
      action: {
        type: "string", enum: ["highlight", "lift", "refill"],
        description: "Optional 3D inspection after camera registration. Highlight or lift any mapped part. Refill demonstrates the washer only.",
      },
    },
    required: ["part", "instruction"],
    additionalProperties: false,
  },
};

const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

async function run(input: unknown): Promise<ToolOutput> {
  if (input === null || typeof input !== "object") return invalid("Input inválido: se espera { part, instruction }.");
  const { part, instruction, action } = input as { part?: unknown; instruction?: unknown; action?: unknown };
  const row = typeof part === "string" ? rows.find((p) => p.id === part) : undefined;
  if (!row) return invalid("Pieza desconocida: usa un part que devolvió lookup_parts.");
  if (typeof instruction !== "string" || instruction.trim() === "") return invalid("Falta la instrucción.");
  if (action !== undefined && !(action === "highlight" || action === "lift" || (action === "refill" && part === "washer"))) {
    return invalid("Unsupported inspection action for this part.");
  }
  const text = instruction.trim().slice(0, MAX_INSTRUCTION);
  return {
    content: [{ type: "text", text: `Tarjeta mostrada: Abrir cámara en ${row.name}.` }],
    events: [{ event: "ar", data: { part: row.id, instruction: text, ...(action ? { action } : {}) } }],
  };
}

export const showInCamera: Tool = { definition, run };
