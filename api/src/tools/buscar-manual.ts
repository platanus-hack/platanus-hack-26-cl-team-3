import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { loadManual } from "../manual/store";
import { notice, pageResult } from "../manual/results";
import type { Tool, ToolOutput } from "./index";

const MAX_QUERY = 200;
const MAX_LIMIT = 5;

const definition: ToolDefinition = {
  name: "buscar_manual",
  description:
    "Busca en el manual del propietario del Subaru Outback 2016 (edición de EE. UU., en inglés). Úsala para cualquier duda " +
    "del auto: mantención, capacidades, procedimientos, luces del tablero, ampolletas, neumáticos, arranque con cables. " +
    "Escribe la consulta en inglés con las palabras del manual (por ejemplo «engine oil level gauge», «windshield washer " +
    "fluid», «replace headlight bulb»); si va en español se traducen algunas palabras comunes. Devuelve las páginas más " +
    "relevantes con su numeración impresa (por ejemplo 11-9). Muchas páginas distinguen los motores 2.5 L y 3.6 L: este " +
    "auto es 3.6 L, usa solo lo marcado 3.6 L o común. Si no devuelve nada útil, di que no lo encuentras en el manual.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Qué buscar, en inglés y con las palabras del manual." },
      limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: "Cuántas páginas devolver (4 por defecto)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const fail = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

async function run(input: unknown): Promise<ToolOutput> {
  const { query, limit } = (input ?? {}) as { query?: unknown; limit?: unknown };
  if (typeof query !== "string" || !query.trim() || query.length > MAX_QUERY) return fail(`query debe ser un texto de hasta ${MAX_QUERY} caracteres.`);
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIMIT)) return fail(`limit debe ser un entero entre 1 y ${MAX_LIMIT}.`);

  let index;
  try {
    index = await loadManual();
  } catch {
    return fail("El manual del Outback no está cargado en este servidor. Responde que no puedes consultarlo ahora.");
  }
  const hits = index.search(query, (limit as number | undefined) ?? 4);
  if (!hits.length) return { content: [{ type: "text", text: "No encontré páginas del manual para esa búsqueda. Prueba otras palabras en inglés." }] };
  return { content: [notice(index), ...hits.map(({ page }) => pageResult(index, page, 2400))] };
}

export const buscarManual: Tool = { definition, run };
