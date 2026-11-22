import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import { loadManual } from "../manual/store";
import { notice, pageResult } from "../manual/results";
import type { Tool, ToolOutput } from "./index";

const MAX_COUNT = 3;

const definition: ToolDefinition = {
  name: "leer_manual",
  description:
    "Lee páginas completas del manual del Outback 2016 a partir de su numeración impresa. Úsala cuando buscar_manual " +
    "encontró el procedimiento pero sigue en la página siguiente, o para ver el detalle de una página que ya apareció.",
  input_schema: {
    type: "object",
    properties: {
      page: { type: "string", description: "Numeración impresa, por ejemplo «11-9». Para las hojas sin numeración, «pdf:12»." },
      count: { type: "integer", minimum: 1, maximum: MAX_COUNT, description: "Cuántas páginas seguidas leer (1 por defecto)." },
    },
    required: ["page"],
    additionalProperties: false,
  },
};

const fail = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

async function run(input: unknown): Promise<ToolOutput> {
  const { page, count } = (input ?? {}) as { page?: unknown; count?: unknown };
  if (typeof page !== "string" || !page.trim() || page.length > 20) return fail("page debe ser una numeración como «11-9».");
  if (count !== undefined && (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_COUNT)) return fail(`count debe ser un entero entre 1 y ${MAX_COUNT}.`);

  let index;
  try {
    index = await loadManual();
  } catch {
    return fail("El manual del Outback no está cargado en este servidor. Responde que no puedes consultarlo ahora.");
  }
  const pages = index.from(page, (count as number | undefined) ?? 1);
  if (!pages.length) return { content: [{ type: "text", text: `No existe la página «${page}» en el manual. Se numeran como en el manual impreso, por ejemplo «11-9».` }] };
  return { content: [notice(index), ...pages.map((p) => pageResult(index, p, 6000))] };
}

export const leerManual: Tool = { definition, run };
