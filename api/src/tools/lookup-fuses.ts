import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { BOXES, BOX_LABEL, FUSES, data, type BoxKey, type FuseRow } from "./fuse-table";
import type { Tool, ToolOutput } from "./index";

const BOX_KEYS: BoxKey[] = ["cabina", "motor"];

const NO_RESULTS = 'Sin resultados en la tabla de fusibles. Prueba con filter "*" para ver la caja completa.';

const definition: ToolDefinition = {
  name: "lookup_fuses",
  description:
    "Look up fuses in the 2016 North American Subaru Outback owner's manual. The car has two fuse boxes: " +
    "cabina (under the instrument panel, driver's side) and motor (the main fuse box in the engine compartment). " +
    "Each result carries the location of its box and how to check a fuse. " +
    "Filter by an exact fuse number, a substring of the circuit label (e.g. P/W, WASH, AUDIO), " +
    "a substring of the Spanish description (e.g. limpiaparabrisas, sapito, luz baja), or \"*\" for every fuse of the box. " +
    "Fuse numbers repeat across the two boxes, so when filtering by number pass box as well. " +
    "R.LH and R.RH mean rear left and rear right. " +
    "PASS and MAIN each identify two circuits. Do not infer a unique front-door fuse from those labels.",
  input_schema: {
    type: "object",
    properties: {
      filter: { type: "string" },
      box: { type: "string", enum: ["cabina", "motor"] },
    },
    required: ["filter"],
    additionalProperties: false,
  },
};

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isEmpty = (f: FuseRow) => f.amps === null;

function rowToText(f: FuseRow): string {
  const label = BOX_LABEL[f.box as BoxKey];
  if (isEmpty(f)) return `Posición ${f.number} — vacía según el manual — ${label}. part_id: ${f.part_id}`;
  return `Fusible ${f.number} — ${f.amps} A — ${f.circuit}: ${f.description} — ${label}. part_id: ${f.part_id}`;
}

function search(q: string, boxes: BoxKey[]): FuseRow[] {
  const inBoxes = FUSES.filter((f) => boxes.includes(f.box as BoxKey));
  if (q === "*") return inBoxes.filter((f) => !isEmpty(f));
  if (/^\d+$/.test(q)) return inBoxes.filter((f) => f.number === Number(q));
  const n = normalize(q);
  return inBoxes.filter((f) => !isEmpty(f) && (normalize(f.circuit).includes(n) || normalize(f.description).includes(n)));
}

async function run(input: unknown): Promise<ToolOutput> {
  const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });
  if (input === null || typeof input !== "object" || typeof (input as { filter?: unknown }).filter !== "string") {
    return invalid("Input inválido: se espera { filter: string, box?: \"cabina\" | \"motor\" }.");
  }
  const { filter, box } = input as { filter: string; box?: unknown };
  if (box !== undefined && box !== "cabina" && box !== "motor") {
    return invalid('Input inválido: box debe ser "cabina" o "motor".');
  }
  const q = filter.trim();
  const matches = q === "" ? [] : search(q, box ? [box] : BOX_KEYS);
  const blocks: ToolOutput["content"] = [];
  for (const key of BOX_KEYS) {
    const rows = matches.filter((f) => f.box === key);
    if (rows.length === 0) continue;
    const pages = [...new Set(rows.map((f) => f.page))].join(" y ");
    blocks.push({
      type: "search_result",
      source: `fusibles://outback-2016-3.6r/${key}`,
      title: `${BOXES[key].title} — ${data.source}, PDF ${pages}`,
      content: [
        { type: "text", text: `${BOXES[key].location} ${BOXES[key].pages}.\n${data.procedure}` },
        ...rows.map((f) => ({ type: "text" as const, text: rowToText(f) })),
      ],
      citations: { enabled: true },
    });
  }
  return { content: blocks.length ? blocks : [{ type: "text", text: NO_RESULTS }] };
}

export const lookupFuses: Tool = { definition, run };
