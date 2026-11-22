import { rmSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { ManualPage } from "./pages";
import { expandWords, type Hit, type ManualFile, type ManualIndex, type ManualSource } from "./search";

/** El título de la sección pesa el triple que el cuerpo, igual que en el índice en memoria. */
const SECTION_WEIGHT = 3;

interface Row {
  pdf_page: number;
  label: string | null;
  section: string | null;
  text: string;
  score?: number;
}

const toPage = (row: Row): ManualPage => ({ pdfPage: row.pdf_page, label: row.label, section: row.section, text: row.text });

/** Escribe el índice como un archivo SQLite con una tabla FTS5 (BM25 incluido en SQLite, sin dependencias). */
export function writeSqliteIndex(path: string, file: ManualFile): void {
  rmSync(path, { force: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE pages (pdf_page INTEGER PRIMARY KEY, label TEXT, section TEXT, text TEXT NOT NULL);
    CREATE INDEX pages_label ON pages (label);
    CREATE VIRTUAL TABLE fts USING fts5(section, text, content='pages', content_rowid='pdf_page',
      tokenize='porter unicode61 remove_diacritics 2');
  `);
  db.prepare("INSERT INTO meta VALUES ('version', ?), ('source', ?)").run(String(file.version), JSON.stringify(file.source));
  const insert = db.prepare("INSERT INTO pages VALUES (?, ?, ?, ?)");
  db.exec("BEGIN");
  for (const page of file.pages) insert.run(page.pdfPage, page.label, page.section, page.text);
  db.exec("COMMIT");
  db.exec("INSERT INTO fts(fts) VALUES ('rebuild'); INSERT INTO fts(fts) VALUES ('optimize');");
  db.close();
}

export class FtsIndex implements ManualIndex {
  readonly source: ManualSource;
  private readonly searchRows: StatementSync;
  private readonly fromRows: StatementSync;
  private readonly fromPdf: StatementSync;

  private constructor(private readonly db: DatabaseSync) {
    const meta = db.prepare("SELECT value FROM meta WHERE key = ?");
    if ((meta.get("version") as { value: string } | undefined)?.value !== "1") throw new Error("Índice del manual inválido (versión).");
    this.source = JSON.parse((meta.get("source") as { value: string }).value) as ManualSource;
    this.searchRows = db.prepare(
      `SELECT p.pdf_page, p.label, p.section, p.text, -bm25(fts, ${SECTION_WEIGHT}.0, 1.0) AS score
         FROM fts JOIN pages p ON p.pdf_page = fts.rowid WHERE fts MATCH ? ORDER BY score DESC LIMIT ?`,
    );
    this.fromRows = db.prepare("SELECT * FROM pages WHERE pdf_page >= (SELECT MIN(pdf_page) FROM pages WHERE label = ?) ORDER BY pdf_page LIMIT ?");
    this.fromPdf = db.prepare("SELECT * FROM pages WHERE pdf_page >= ? ORDER BY pdf_page LIMIT ?");
  }

  static open(path: string): FtsIndex {
    return new FtsIndex(new DatabaseSync(path, { readOnly: true }));
  }

  search(query: string, limit = 4): Hit[] {
    const terms = expandWords(query);
    if (!terms.length) return [];
    // Cada palabra entre comillas: solo lleva letras, dígitos y puntos, así que no puede romper la sintaxis de FTS5.
    const match = terms.map((term) => `"${term}"`).join(" OR ");
    return (this.searchRows.all(match, limit) as unknown as Row[]).map((row) => ({ page: toPage(row), score: row.score ?? 0 }));
  }

  from(reference: string, count = 1): ManualPage[] {
    const wanted = reference.trim();
    const pdf = /^pdf:(\d+)$/i.exec(wanted);
    const rows = (pdf ? this.fromPdf.all(Number(pdf[1]), count) : this.fromRows.all(wanted, count)) as unknown as Row[];
    return rows.map(toPage);
  }

  close(): void {
    this.db.close();
  }
}
