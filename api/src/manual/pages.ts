/**
 * Del texto que saca `pdftotext` a páginas limpias con su numeración impresa. Solo se usa al construir el índice: el
 * servidor lee el índice ya hecho.
 *
 * Se necesitan las dos salidas de pdftotext: con `-layout` el encabezado queda en una sola línea («Capítulo/Sección
 * 11-9») y de ahí sale la numeración; sin `-layout` las dos columnas salen en orden de lectura, que es lo que se guarda.
 */
export interface ManualPage {
  /** Hoja del PDF, desde 1. */
  pdfPage: number;
  /** Numeración impresa en el manual («11-9»); null en portada, índice y portadas de capítulo, que no la traen. */
  label: string | null;
  /** Capítulo y sección del encabezado («Maintenance and service/Engine compartment overview»). */
  section: string | null;
  text: string;
}

const JUNK = [
  /^Black plate \(\d+,\d+\)$/, // marca de imprenta del archivo
  /^[–-] ?CONTINUED ?[–-]$/,
  /^北米Model\b.*$/,
  /^Model ".*" EDITED:.*$/,
  /^\d{1,2}$/, // pestaña del capítulo
];
const LABEL = "\\d{1,2}-\\d{1,3}";
const LEFT = new RegExp(`^(${LABEL})\\s+(\\S.*)$`); // «11-10 Maintenance and service/Engine…» o con más espacios
const RIGHT = new RegExp(`^(\\S.*?)\\s+(${LABEL})$`); // «Starting and operating/BSD/RCTA    7-55»

const squash = (line: string) => line.replace(/\s+/g, " ").trim();

/**
 * La tipografía del PDF hace que pdftotext lea el símbolo de grado como un «8»: «10.4 °F (−12 °C)» sale como
 * «10.48F (−128C)». Un dígito, un 8 y una F o C que no siga con letras es siempre una temperatura en este manual.
 */
export const fixDegrees = (text: string): string => text.replace(/(\d)8([FC])(?![A-Za-z])/g, "$1 °$2");

/** Numeración y sección del encabezado, que es la primera línea con texto después de la marca de imprenta. */
function header(layoutChunk: string): { label: string | null; section: string | null } {
  const lines = layoutChunk.split("\n").map((line) => line.trim()).filter(Boolean);
  const line = lines.slice(0, 3).find((candidate) => !JUNK[0].test(candidate));
  if (!line) return { label: null, section: null };
  const left = LEFT.exec(line);
  if (left) return { label: left[1], section: squash(left[2]) };
  const right = RIGHT.exec(line);
  if (right) return { label: right[2], section: squash(right[1]) };
  return { label: null, section: null };
}

function parsePage(reading: string, layout: string, pdfPage: number): ManualPage {
  const { label, section } = header(layout);
  const lines = reading.split("\n").map(squash).filter((line) => !JUNK.some((junk) => junk.test(line)));
  // El encabezado ya está en label y section: se saca de las primeras líneas (junto o suelto) para no repetirlo.
  if (label && section) {
    for (const own of [[`${label} ${section}`, `${section} ${label}`], [section], [label]]) {
      const at = lines.slice(0, 8).findIndex((line) => own.includes(line));
      if (at >= 0) lines.splice(at, 1);
    }
  }
  // Los renglones de un mismo bloque se unen; un renglón vacío separa bloques.
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join(" "));
    current = [];
  };
  for (const line of lines) {
    if (line === "") flush();
    else current.push(line);
  }
  flush();
  return { pdfPage, label, section, text: fixDegrees(blocks.join("\n\n")) };
}

export function parsePages(reading: string, layout: string): ManualPage[] {
  const layoutPages = layout.split("\f");
  return reading
    .split("\f")
    .map((chunk, i) => parsePage(chunk, layoutPages[i] ?? "", i + 1))
    .filter((page) => page.text.length >= 40);
}
