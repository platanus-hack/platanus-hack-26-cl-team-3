import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { boxIds, boxLabel, findFuse, isBox, type FuseTable } from "./fuse-table";
import type { Tool, ToolOutput } from "./index";

const MAX_INSTRUCTION = 200;
const MAX_NUMBERS = 4;

const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

export const showFuse = (table: FuseTable): Tool => {
  const ids = boxIds(table);

  const definition: ToolDefinition = {
    name: "show_fuse",
    description:
      "Marca en el plano de la caja de fusibles de la app el fusible que el conductor tiene que revisar. " +
      "Úsala solo con números que devolvió lookup_fuses. Si el manual no permite elegir uno, " +
      "pasa todos los candidatos. Una llamada por caja. " +
      `Auto: ${table.vehicle}. Cajas: ${ids.map((id) => `${id} (${table.boxes[id].title})`).join(", ")}. ` +
      "`instruction` es una frase corta en español que dice qué revisar." +
      (table.notes ? ` ${table.notes}` : ""),
    input_schema: {
      type: "object",
      properties: {
        box: { type: "string", enum: ids },
        numbers: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: MAX_NUMBERS },
        instruction: { type: "string", description: "One short Chilean Spanish sentence spoken to the driver at this stage. Describe only the current action." },
      },
      required: ["box", "numbers", "instruction"],
      additionalProperties: false,
    },
  };

  async function run(input: unknown): Promise<ToolOutput> {
    if (input === null || typeof input !== "object") return invalid("Input inválido: se espera { box, numbers, instruction }.");
    const { box, numbers, instruction } = input as { box?: unknown; numbers?: unknown; instruction?: unknown };
    if (!isBox(table, box)) return invalid(`box debe ser ${ids.map((id) => `"${id}"`).join(" o ")}.`);
    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > MAX_NUMBERS || !numbers.every(Number.isInteger)) {
      return invalid(`numbers debe ser una lista de 1 a ${MAX_NUMBERS} números enteros que devolvió lookup_fuses.`);
    }
    if (new Set(numbers).size !== numbers.length) return invalid("numbers no puede repetir números.");
    if (typeof instruction !== "string" || instruction.trim() === "") return invalid("Falta la instrucción.");
    const label = boxLabel(table, box);
    const rows = [];
    for (const n of numbers as number[]) {
      const row = findFuse(table, box, n);
      if (!row) return invalid(`Ese fusible no existe en la ${label}: usa un número que devolvió lookup_fuses.`);
      if (row.amps === null) return invalid(`La posición ${n} de la ${label} está vacía según el manual: usa un fusible que devolvió lookup_fuses.`);
      rows.push(row);
    }
    const list = rows.map((r) => `fusible ${r.number} (${r.circuit}, ${r.amps} A)`).join(", ");
    return {
      content: [{ type: "text", text: `Fusible marcado en la app: ${label}, ${list}. No lo menciones en tu respuesta; el texto tiene que entenderse solo.` }],
      events: [{ event: "fuse", data: { box, numbers: numbers as number[], instruction: instruction.trim().slice(0, MAX_INSTRUCTION) } }],
    };
  }

  return { definition, run };
};
