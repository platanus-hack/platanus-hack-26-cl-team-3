/**
 * Arma el índice del manual a partir del texto de pdftotext.
 *   tsx scripts/manual/construir-indice.ts <lectura.txt> <layout.txt> <salida.json> <sha256-del-pdf>
 * La salida es JSON (índice en memoria) o, si termina en .sqlite, una base con FTS5. Lo corre
 * scripts/manual/preparar-manual.sh. La salida NO se sube al repo (regla 7 del README).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { writeSqliteIndex } from "../../src/manual/fts";
import { parsePages } from "../../src/manual/pages";
import type { ManualFile } from "../../src/manual/search";

const [readingPath, layoutPath, outPath, sha256] = process.argv.slice(2);
if (!readingPath || !layoutPath || !outPath || !sha256) {
  console.error("Uso: tsx scripts/manual/construir-indice.ts <lectura.txt> <layout.txt> <salida.json> <sha256-del-pdf>");
  process.exit(2);
}
const pages = parsePages(readFileSync(readingPath, "utf8"), readFileSync(layoutPath, "utf8"));
const file: ManualFile = {
  version: 1,
  source: {
    title: "Manual del propietario Subaru Outback 2016",
    edition: "Norteamérica (EE. UU.), en inglés, octubre de 2015",
    url: "https://www.startmycar.com/subaru/outback/info/manuals/2016",
    sha256,
    thirdParty: true,
  },
  pages,
};
if (outPath.endsWith(".sqlite")) writeSqliteIndex(outPath, file);
else writeFileSync(outPath, JSON.stringify(file));
const labelled = pages.filter((page) => page.label).length;
console.log(`${pages.length} páginas (${labelled} con numeración impresa) → ${outPath}`);
