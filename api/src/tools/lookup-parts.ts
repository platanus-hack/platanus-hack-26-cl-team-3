import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import rows from "../data/parts.json";
import type { Tool, ToolOutput } from "./index";

const SOURCE = "piezas://outback-2016-3.6r/vano";

const definition: ToolDefinition = {
  name: "lookup_parts",
  description:
    "Devuelve las piezas del vano del motor que el conductor puede revisar (nombre, ubicación y cómo reconocerla). " +
    "El `part` de cada una es el id que usa show_in_camera para abrir la cámara en esa pieza.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

async function run(): Promise<ToolOutput> {
  return {
    content: [
      {
        type: "search_result",
        source: SOURCE,
        title: `Piezas del vano del motor — Outback 2016 3.6R (fuente: ${[...new Set(rows.map((p) => p.source))].join("; ")})`,
        content: rows.map((p) => ({ type: "text", text: `${p.name} — ${p.detail} part: ${p.id}` })),
        citations: { enabled: true },
      },
    ],
  };
}

export const lookupParts: Tool = { definition, run };
