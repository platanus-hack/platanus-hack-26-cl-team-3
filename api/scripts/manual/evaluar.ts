/**
 * Mide un índice del manual con preguntas de conductores.
 *   tsx scripts/manual/evaluar.ts <índice.json|índice.sqlite> [otro índice…]
 *
 * Cada pregunta trae un dato que tiene que aparecer en la página devuelta (eval/manual/preguntas.json): no se juzga si
 * la página «parece buena», sino si contiene la respuesta. Se mide con la pregunta en español, tal como la escribe el
 * conductor, y con la consulta en inglés, tal como la escribe el modelo. Necesita el índice real: no corre en `npm test`.
 */
import { readFileSync, statSync } from "node:fs";
import { openManual } from "../../src/manual/store";
import type { ManualIndex } from "../../src/manual/search";

interface Pregunta { id: string; es: string; en: string; dato: string }
const preguntas = JSON.parse(readFileSync(new URL("../../eval/manual/preguntas.json", import.meta.url), "utf8")) as Pregunta[];
const LIMITE = 5;
const REPETICIONES = 200;

const percentil = (valores: number[], p: number) => [...valores].sort((a, b) => a - b)[Math.min(valores.length - 1, Math.floor((p / 100) * valores.length))];
const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(0)} %`;

async function medir(path: string) {
  const t0 = performance.now();
  const index: ManualIndex = await openManual(path);
  const carga = performance.now() - t0;
  const filas: { id: string; idioma: string; rango: number | null }[] = [];
  const tiempos: number[] = [];
  for (const q of preguntas) {
    const dato = new RegExp(q.dato, "i");
    for (const idioma of ["es", "en"] as const) {
      const hits = index.search(q[idioma], LIMITE);
      const rango = hits.findIndex((h) => dato.test(h.page.text));
      filas.push({ id: q.id, idioma, rango: rango < 0 ? null : rango + 1 });
      for (let i = 0; i < REPETICIONES; i++) {
        const t = performance.now();
        index.search(q[idioma], 4);
        tiempos.push(performance.now() - t);
      }
    }
  }
  return { path, carga, bytes: statSync(path).size, filas, tiempos };
}

function resumen(filas: { rango: number | null }[]) {
  const n = filas.length;
  const en = (k: number) => filas.filter((f) => f.rango !== null && f.rango <= k).length;
  const mrr = filas.reduce((sum, f) => sum + (f.rango ? 1 / f.rango : 0), 0) / n;
  return { n, top1: en(1), top3: en(3), top4: en(4), top5: en(5), mrr };
}

const resultados = [];
for (const path of process.argv.slice(2)) resultados.push(await medir(path));
if (!resultados.length) {
  console.error("Uso: tsx scripts/manual/evaluar.ts <índice.json|índice.sqlite> [otro índice…]");
  process.exit(2);
}

// Que el dato exista en el manual: si no, la pregunta no se puede acertar con ningún índice.
const index = await openManual(process.argv[2]);
const pagina = (re: RegExp) => (index as unknown as { pages?: { text: string }[] }).pages?.filter((p) => re.test(p.text)).length;
const sinDato = preguntas.filter((q) => pagina(new RegExp(q.dato, "i")) === 0).map((q) => q.id);
if (sinDato.length) console.log(`ATENCIÓN: el dato no aparece en el manual para: ${sinDato.join(", ")}\n`);

console.log(`${preguntas.length} preguntas × 2 idiomas, ${LIMITE} páginas por consulta.\n`);
console.log("| Índice | Idioma | Top-1 | Top-3 | Top-4 | Top-5 | MRR |\n|---|---|---|---|---|---|---|");
for (const r of resultados) {
  for (const idioma of ["es", "en", "todo"]) {
    const s = resumen(r.filas.filter((f) => idioma === "todo" || f.idioma === idioma));
    console.log(`| ${r.path.split("/").pop()} | ${idioma} | ${pct(s.top1, s.n)} | ${pct(s.top3, s.n)} | ${pct(s.top4, s.n)} | ${pct(s.top5, s.n)} | ${s.mrr.toFixed(2)} |`);
  }
}
console.log("\n| Índice | Carga | Tamaño | Consulta p50 | p95 | p99 |\n|---|---|---|---|---|---|");
for (const r of resultados) {
  console.log(`| ${r.path.split("/").pop()} | ${r.carga.toFixed(0)} ms | ${(r.bytes / 1e6).toFixed(2)} MB | ${percentil(r.tiempos, 50).toFixed(2)} ms | ${percentil(r.tiempos, 95).toFixed(2)} ms | ${percentil(r.tiempos, 99).toFixed(2)} ms |`);
}
console.log("\nPreguntas sin la respuesta entre las 4 primeras páginas:");
for (const r of resultados) {
  const falla = r.filas.filter((f) => f.rango === null || f.rango > 4).map((f) => `${f.id}(${f.idioma}${f.rango ? `, rango ${f.rango}` : ""})`);
  console.log(`- ${r.path.split("/").pop()}: ${falla.length ? falla.join(", ") : "ninguna"}`);
}
