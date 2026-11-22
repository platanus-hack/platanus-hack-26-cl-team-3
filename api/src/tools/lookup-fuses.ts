import { fuseSource, type FuseCatalog } from "../data/fuse-catalog";
import type { Tool } from "./index";

export function lookupFuses(catalog: FuseCatalog): Tool {
  return {
    definition: {
      name: "lookup_fuses",
      description: `Search the verified fuse positions for ${catalog.title} by number, circuit label or Spanish description. Use box to distinguish the same number on different panels. Cite the matching result so the app can open that slot. For P/W (alzavidrios), R.LH and R.RH mean rear left and rear right; PASS and MAIN can each match multiple circuits. Use an empty filter to list all positions.`,
      input_schema: {
        type: "object",
        properties: {
          filter: { type: "string" },
          box: { type: "string", enum: ["engine", "cabin"] },
        },
        required: ["filter"],
        additionalProperties: false,
      },
    },
    async run(input) {
      const { filter, box } = (input ?? {}) as { filter?: unknown; box?: unknown };
      if (typeof filter !== "string" || (box !== undefined && box !== "engine" && box !== "cabin")) {
        return { is_error: true, content: [{ type: "text", text: "Filtro o caja inválidos." }] };
      }
      const matches = catalog.search(filter, box);
      if (!matches.length) return { content: [{ type: "text", text: "Sin resultados en la tabla de fusibles." }] };
      return { content: matches.map(slot => {
        const panel = slot.box === "cabin" ? "Habitáculo" : "Motor";
        const name = slot.label === "Empty" ? "Posición" : "Fusible";
        return {
          type: "search_result",
          source: fuseSource(catalog, slot),
          title: `${catalog.title} · ${panel} · ${name} ${slot.number} · págs. ${catalog.pages[slot.box]}`,
          content: [{ type: "text", text: `${name} ${slot.number} · ${panel} · ${slot.label} · ${slot.description}${slot.amps === null ? "" : ` · ${slot.amps} A`}` }],
          citations: { enabled: true },
        };
      }) };
    },
  };
}
