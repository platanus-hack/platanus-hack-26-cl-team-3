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
  page: number;
}

const FUSES: FuseRow[] = rows;

const SOURCE = "fusibles://outback-2016-3.6r/cabina";

const definition: ToolDefinition = {
  name: "lookup_fuses",
  description:
    "Look up the six cabin power-window (alzavidrios) circuits in the 2016 North American Subaru Outback owner's manual. " +
    "Filter by a circuit substring such as P/W or an exact fuse number. R.LH and R.RH mean rear left and rear right. " +
    "PASS and MAIN each identify two circuits. Do not infer a unique front-door fuse from those labels.",
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
  const pages = [...new Set(matches.map((f) => f.page))].join(" y ");
  return {
    content: [
      {
        type: "search_result",
        source: SOURCE,
        title: `Caja de fusibles de la cabina — ${matches[0].source}, PDF ${pages}`,
        content: matches.map((f) => ({ type: "text", text: rowToText(f) })),
        citations: { enabled: true },
      },
    ],
  };
}

export const lookupFuses: Tool = { definition, run };
