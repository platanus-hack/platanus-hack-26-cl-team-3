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

const definition: ToolDefinition = {
  name: "lookup_fuses",
  description:
    "Devuelve filas de la tabla de fusibles del auto (caja, número, amperaje, circuito). " +
    "Los circuitos usan la sigla del manual: P/W = alzavidrios (power window), R.LH / R.RH = trasera izquierda / derecha, " +
    "PASS = pasajero, MAIN = principal. Filtra por circuito con esa sigla (p. ej. 'P/W') o por número exacto de fusible (p. ej. '24').",
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
  const matches = q === "" ? [] : FUSES.filter((f) => (/^\d+$/.test(q) ? f.number === Number(q) : f.circuit.toLowerCase().includes(q)));
  if (matches.length === 0) {
    return { content: [{ type: "text", text: "Sin resultados en la tabla de fusibles." }] };
  }
  return {
    content: [
      {
        type: "search_result",
        source: SOURCE,
        title: `Tabla de fusibles — caja de la cabina (fuente: ${[...new Set(matches.map((f) => f.source))].join("; ")})`,
        content: matches.map((f) => ({ type: "text", text: rowToText(f) })),
        citations: { enabled: true },
      },
    ],
  };
}

export const lookupFuses: Tool = { definition, run };
