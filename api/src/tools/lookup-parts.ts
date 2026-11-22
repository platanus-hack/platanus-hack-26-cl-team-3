import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import type { VehicleProfile } from "../vehicles/registry";
import type { Tool, ToolOutput } from "./index";

const definition: ToolDefinition = {
  name: "lookup_parts",
  description:
    "Devuelve las piezas del vano del motor que el conductor puede revisar (nombre, ubicación y cómo reconocerla). " +
    "El `part` de cada una es el id que usa show_in_camera para abrir la cámara en esa pieza.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

export function lookupParts(profile: VehicleProfile): Tool {
  const rows = profile.parts;
  const sources = [...new Set(rows.map((p) => p.source))].join("; ");
  return {
    definition,
    async run(): Promise<ToolOutput> {
      return {
        content: [
          {
            type: "search_result",
            source: profile.partsSource,
            title: `${profile.partsTitle} — ${profile.label} (fuente: ${sources})`,
            content: rows.map((p) => ({ type: "text", text: `${p.name} — ${p.detail} part: ${p.id}` })),
            citations: { enabled: true },
          },
        ],
      };
    },
  };
}
