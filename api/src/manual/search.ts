import { readFile } from "node:fs/promises";
import { GLOSSARY } from "./glossary";
import type { ManualPage } from "./pages";

export interface ManualSource {
  title: string;
  edition: string;
  url: string;
  sha256: string;
  /** Es una copia de terceros del manual oficial: se avisa en cada respuesta (regla 6 del README). */
  thirdParty: boolean;
}

export interface ManualFile {
  version: 1;
  source: ManualSource;
  pages: ManualPage[];
}

export interface Hit {
  page: ManualPage;
  score: number;
}

const STOP = new Set(
  ("the a an of to in on for and or is are be it as at by with from this that what where how do does can i my me " +
    "de la el los las un una que como donde cual mi es en y o para por con se del al lo su sus").split(" "),
);
const K1 = 1.4;
const B = 0.75;
const SECTION_WEIGHT = 3;
const MIN_SCORE = 1;

const unaccent = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Quita lo más común de las terminaciones inglesas, para que «tires» y «tire» sean lo mismo. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("es") && /(?:ch|sh|x|s)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  const words = unaccent(text.toLowerCase()).match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [];
  return words.filter((word) => !STOP.has(word)).map(stem);
}

/** Lo que el usuario escribió, más la traducción de las palabras del auto que conocemos. */
export function expandQuery(query: string): string[] {
  const words = unaccent(query.toLowerCase()).match(/[a-z0-9]+/g) ?? [];
  const extra = words.flatMap((word) => (GLOSSARY[word] ? tokenize(GLOSSARY[word]) : []));
  return [...new Set([...tokenize(query), ...extra])];
}

export class ManualIndex {
  readonly source: ManualSource;
  readonly pages: ManualPage[];
  private readonly frequencies: Map<string, number>[];
  private readonly lengths: number[];
  private readonly average: number;
  private readonly documentFrequency = new Map<string, number>();

  constructor(file: ManualFile) {
    this.source = file.source;
    this.pages = file.pages;
    this.frequencies = file.pages.map((page) => {
      const counts = new Map<string, number>();
      for (const token of tokenize(page.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
      for (const token of tokenize(page.section ?? "")) counts.set(token, (counts.get(token) ?? 0) + SECTION_WEIGHT);
      return counts;
    });
    this.lengths = this.frequencies.map((counts) => [...counts.values()].reduce((sum, n) => sum + n, 0));
    this.average = this.lengths.reduce((sum, n) => sum + n, 0) / Math.max(1, this.lengths.length);
    for (const counts of this.frequencies) for (const token of counts.keys()) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
  }

  static async load(path: string): Promise<ManualIndex> {
    const file = JSON.parse(await readFile(path, "utf8")) as ManualFile;
    if (file.version !== 1 || !Array.isArray(file.pages) || !file.pages.length) throw new Error(`Índice del manual inválido: ${path}`);
    return new ManualIndex(file);
  }

  search(query: string, limit = 4): Hit[] {
    const terms = expandQuery(query);
    if (!terms.length) return [];
    const total = this.pages.length;
    const hits: Hit[] = [];
    this.frequencies.forEach((counts, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = counts.get(term);
        if (!tf) continue;
        const df = this.documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
        score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * this.lengths[i]) / this.average));
      }
      if (score >= MIN_SCORE) hits.push({ page: this.pages[i], score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Páginas desde la que lleva esa numeración impresa («11-9») o, si no, esa hoja del PDF («pdf:491»). */
  from(reference: string, count = 1): ManualPage[] {
    const wanted = reference.trim();
    const pdf = /^pdf:(\d+)$/i.exec(wanted);
    const start = this.pages.findIndex((page) => (pdf ? page.pdfPage === Number(pdf[1]) : page.label === wanted));
    return start < 0 ? [] : this.pages.slice(start, start + count);
  }
}
