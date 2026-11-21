import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import rows from "../data/fuses.json";
import type { Tool, ToolOutput } from "./index";

interface FuseRow {
  box: string;
  number: number;
  amps: number;
  circuit: string;
  part_id: string;
  source: string;
  page: number | null;
}

const FUSES: FuseRow[] = rows;

const SOURCE = "fusibles://outback-2016-3.6r/cabina";
const TITLE = "Tabla de fusibles — caja de la cabina (tercero, por verificar en el auto)";

const definition: ToolDefinition = {
  name: "lookup_fuses",
  description:
    "Devuelve filas de la tabla de fusibles del auto (caja, número, amperaje, circuito). " +
    "Filtra por circuito (p. ej. 'P/W') o por número de fusible.",
  input_schema: {
    type: "object",
    properties: { filter: { type: "string" } },
    required: ["filter"],
    additionalProperties: false,
  },
};

function rowToText(f: FuseRow): string {
  return `Fusible ${f.number} — ${f.amps} A — ${f.circuit} — caja de la ${f.box}. part_id: ${f.part_id}`;
}

async function run(input: unknown): Promise<ToolOutput> {
  if (input === null || typeof input !== "object" || typeof (input as { filter?: unknown }).filter !== "string") {
    return { content: [{ type: "text", text: "Input inválido: se espera { filter: string }." }], is_error: true };
  }
  const q = (input as { filter: string }).filter.trim().toLowerCase();
  const matches = q === "" ? [] : FUSES.filter((f) => f.circuit.toLowerCase().includes(q) || String(f.number).includes(q));
  if (matches.length === 0) {
    return { content: [{ type: "text", text: "Sin resultados en la tabla de fusibles." }] };
  }
  return {
    content: [
      {
        type: "search_result",
        source: SOURCE,
        title: TITLE,
        content: matches.map((f) => ({ type: "text", text: rowToText(f) })),
        citations: { enabled: true },
      },
    ],
  };
}

export const lookupFuses: Tool = { definition, run };
