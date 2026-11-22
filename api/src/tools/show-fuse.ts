import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { BOX_LABEL, findFuse, type BoxKey } from "./fuse-table";
import type { Tool, ToolOutput } from "./index";

const MAX_INSTRUCTION = 200;
const MAX_NUMBERS = 4;

const definition: ToolDefinition = {
  name: "show_fuse",
  description:
    "Marca en el plano de la caja de fusibles de la app el fusible que el conductor tiene que revisar. " +
    "Úsala solo con números que devolvió lookup_fuses. Si el manual no permite elegir uno " +
    "(P/W MAIN1 y MAIN2, PASS1 y PASS2), pasa todos los candidatos. Una llamada por caja. " +
    "`instruction` es una frase corta en español que dice qué revisar.",
  input_schema: {
    type: "object",
    properties: {
      box: { type: "string", enum: ["cabina", "motor"] },
      numbers: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: MAX_NUMBERS },
      instruction: { type: "string" },
    },
    required: ["box", "numbers", "instruction"],
    additionalProperties: false,
  },
};

const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

async function run(input: unknown): Promise<ToolOutput> {
  if (input === null || typeof input !== "object") return invalid("Input inválido: se espera { box, numbers, instruction }.");
  const { box, numbers, instruction } = input as { box?: unknown; numbers?: unknown; instruction?: unknown };
  if (box !== "cabina" && box !== "motor") return invalid('box debe ser "cabina" o "motor".');
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > MAX_NUMBERS || !numbers.every(Number.isInteger)) {
    return invalid(`numbers debe ser una lista de 1 a ${MAX_NUMBERS} números enteros que devolvió lookup_fuses.`);
  }
  if (new Set(numbers).size !== numbers.length) return invalid("numbers no puede repetir números.");
  if (typeof instruction !== "string" || instruction.trim() === "") return invalid("Falta la instrucción.");
  const key: BoxKey = box;
  const rows = [];
  for (const n of numbers as number[]) {
    const row = findFuse(key, n);
    if (!row) return invalid(`Ese fusible no existe en la ${BOX_LABEL[key]}: usa un número que devolvió lookup_fuses.`);
    if (row.amps === null) return invalid(`La posición ${n} de la ${BOX_LABEL[key]} está vacía según el manual: usa un fusible que devolvió lookup_fuses.`);
    rows.push(row);
  }
  const list = rows.map((r) => `fusible ${r.number} (${r.circuit}, ${r.amps} A)`).join(", ");
  return {
    content: [{ type: "text", text: `Fusible marcado en la app: ${BOX_LABEL[key]}, ${list}. No lo menciones en tu respuesta; el texto tiene que entenderse solo.` }],
    events: [{ event: "fuse", data: { box: key, numbers: numbers as number[], instruction: instruction.trim().slice(0, MAX_INSTRUCTION) } }],
  };
}

export const showFuse: Tool = { definition, run };
