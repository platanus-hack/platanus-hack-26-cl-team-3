import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { boxIds, boxLabel, isBox, type FuseRow, type FuseTable } from "./fuse-table";
import type { Tool, ToolOutput } from "./index";

const NO_RESULTS = 'Sin resultados en la tabla de fusibles. Prueba con filter "*" para ver la caja completa.';

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isEmpty = (f: FuseRow) => f.amps === null;

const describe = (table: FuseTable): string => {
  const ids = boxIds(table);
  const boxes = ids.map((id) => `${id} (${table.boxes[id].title}: ${table.boxes[id].location})`).join("; ");
  return (
    `Look up fuses in the owner's manual of the ${table.vehicle}. The car has ${ids.length} fuse boxes: ${boxes}. ` +
    "Each result carries the location of its box and how to check a fuse. " +
    "Filter by an exact fuse number, a substring of the circuit label as printed in the manual, " +
    'a substring of the Spanish description, or "*" for every fuse of the box. ' +
    `Fuse numbers repeat across the boxes, so when filtering by number pass box as well.` +
    (table.notes ? ` ${table.notes}` : "")
  );
};

export const lookupFuses = (table: FuseTable): Tool => {
  const ids = boxIds(table);
  const boxList = ids.map((id) => `"${id}"`).join(" | ");

  const definition: ToolDefinition = {
    name: "lookup_fuses",
    description: describe(table),
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string" },
        box: { type: "string", enum: ids },
      },
      required: ["filter"],
      additionalProperties: false,
    },
  };

  const rowToText = (f: FuseRow): string => {
    const label = boxLabel(table, f.box);
    if (isEmpty(f)) return `Posición ${f.number} — vacía según el manual — ${label}. part_id: ${f.part_id}`;
    return `Fusible ${f.number} — ${f.amps} A — ${f.circuit}: ${f.description} — ${label}. part_id: ${f.part_id}`;
  };

  const search = (q: string, boxes: string[]): FuseRow[] => {
    const inBoxes = table.fuses.filter((f) => boxes.includes(f.box));
    if (q === "*") return inBoxes.filter((f) => !isEmpty(f));
    if (/^\d+$/.test(q)) return inBoxes.filter((f) => f.number === Number(q));
    const n = normalize(q);
    return inBoxes.filter((f) => !isEmpty(f) && (normalize(f.circuit).includes(n) || normalize(f.description).includes(n)));
  };

  async function run(input: unknown): Promise<ToolOutput> {
    const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });
    if (input === null || typeof input !== "object" || typeof (input as { filter?: unknown }).filter !== "string") {
      return invalid(`Input inválido: se espera { filter: string, box?: ${boxList} }.`);
    }
    const { filter, box } = input as { filter: string; box?: unknown };
    if (box !== undefined && !isBox(table, box)) return invalid(`Input inválido: box debe ser ${ids.map((id) => `"${id}"`).join(" o ")}.`);
    const q = filter.trim();
    const matches = q === "" ? [] : search(q, box ? [box as string] : ids);
    const blocks: ToolOutput["content"] = [];
    for (const key of ids) {
      const rows = matches.filter((f) => f.box === key);
      if (rows.length === 0) continue;
      const pages = [...new Set(rows.map((f) => f.page))].join(" y ");
      blocks.push({
        type: "search_result",
        source: `${table.source_uri}/${key}`,
        title: `${table.boxes[key].title} — ${table.source}, PDF ${pages}`,
        content: [
          { type: "text", text: `${table.boxes[key].location} ${table.boxes[key].pages}.\n${table.procedure}` },
          ...rows.map((f) => ({ type: "text" as const, text: rowToText(f) })),
        ],
        citations: { enabled: true },
      });
    }
    return { content: blocks.length ? blocks : [{ type: "text", text: NO_RESULTS }] };
  }

  return { definition, run };
};
