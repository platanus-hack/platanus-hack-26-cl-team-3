import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import rows from "../data/parts.json";
import type { Tool, ToolOutput } from "./index";

const openingParts = new Set(["washer", "fuses", "oil_cap", "dipstick", "positive", "brake_cap", "brake_fluid"]);
const MAX_INSTRUCTION = 200;

const definition: ToolDefinition = {
  name: "show_in_camera",
  description:
    "Agrega un paso a la guía de cámara: la app marca la pieza del vano del motor y guía al conductor hasta ella. " +
    "Úsala solo con piezas que devolvió lookup_parts. `instruction` es una frase corta en español que dice qué buscar " +
    "o qué hacer en ese paso. Primero marca la pieza sin action; la animación va en una llamada posterior con la misma pieza.",
  input_schema: {
    type: "object",
    properties: {
      part: { type: "string", enum: rows.map((p) => p.id) },
      instruction: { type: "string" },
      action: {
        type: "string", enum: ["highlight", "lift", "refill", "open"],
        description:
          "Animación 3D del paso, para cuando el conductor ya encontró la pieza. Omítela en la llamada que marca la pieza " +
          "por primera vez. highlight la hace destellar y lift la levanta en 3D (cualquier pieza); refill muestra cómo " +
          `rellenar el sapito (solo washer); open muestra cómo se abre la tapa o cubierta, o sale la varilla (${[...openingParts].join(", ")}).`,
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
  if (action !== undefined && !(action === "highlight" || action === "lift" || (action === "refill" && part === "washer") || (action === "open" && openingParts.has(row.id)))) {
    return invalid("Unsupported inspection action for this part.");
  }
  const text = instruction.trim().slice(0, MAX_INSTRUCTION);
  return {
    content: [{ type: "text", text: `Paso agregado a la guía de cámara: ${row.name}. No lo menciones en tu respuesta; el texto tiene que entenderse solo.` }],
    events: [{ event: "ar", data: { part: row.id, instruction: text, ...(action ? { action } : {}) } }],
  };
}

export const showInCamera: Tool = { definition, run };
