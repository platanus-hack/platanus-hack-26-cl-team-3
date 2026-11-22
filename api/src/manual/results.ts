import type { SearchResultBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ManualPage } from "./pages";
import type { ManualIndex } from "./search";

const BLOCK_CHARS = 700;

export const pageName = (page: ManualPage): string => `${page.label ? `p. ${page.label}` : `hoja PDF ${page.pdfPage}`}${page.section ? ` · ${page.section}` : ""}`;

/** Párrafos juntados hasta ~700 caracteres: cada bloque es lo que el modelo puede citar. */
function blocks(text: string, maxChars: number): TextBlockParam[] {
  const out: string[] = [];
  let current = "";
  let used = 0;
  let cut = false;
  for (const paragraph of text.split("\n\n")) {
    if (used + paragraph.length > maxChars) {
      cut = true;
      break;
    }
    used += paragraph.length;
    if (current && current.length + paragraph.length > BLOCK_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  if (current) out.push(current);
  if (cut) out.push("(La página sigue: pídela completa con leer_manual.)");
  return out.map((t) => ({ type: "text", text: t }));
}

export function pageResult(index: ManualIndex, page: ManualPage, maxChars: number): SearchResultBlockParam {
  return {
    type: "search_result",
    source: `manual://subaru-outback-2016-us/${page.label ?? `pdf-${page.pdfPage}`}`,
    title: `${index.source.title} — ${pageName(page)}`,
    content: blocks(page.text, maxChars),
    citations: { enabled: true },
  };
}

/** Va antes de las páginas: recuerda de qué edición viene el texto y que el auto es 3.6 L (reglas 5 y 6 del README). */
export function notice(index: ManualIndex): TextBlockParam {
  const { edition, thirdParty } = index.source;
  return {
    type: "text",
    text:
      `Edición: ${edition}. ${thirdParty ? "Es una copia de terceros del manual oficial, sin contrastar con el manual físico del auto. " : ""}` +
      "Cubre Legacy y Outback, motores 2.5 L y 3.6 L; este auto es 3.6 L (EZ36). Usa solo lo marcado 3.6 L o lo común a ambos.",
  };
}
