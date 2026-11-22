import { resolve } from "node:path";
import { FtsIndex } from "./fts";
import { MemoryIndex, type ManualIndex } from "./search";

/** El índice es un archivo que se prepara aparte (scripts/manual/preparar-manual.sh): el manual no vive en el repo. */
export function manualPath(): string {
  return process.env.MANUAL_INDEX || resolve(import.meta.dirname, "../../.manual/outback-2016.json");
}

/** `.sqlite` se abre como base de datos con FTS5; cualquier otra cosa es el índice en JSON, que se carga a memoria. */
export async function openManual(path: string): Promise<ManualIndex> {
  return path.endsWith(".sqlite") ? FtsIndex.open(path) : MemoryIndex.load(path);
}

let loading: Promise<ManualIndex> | null = null;

/** Se carga la primera vez que alguien pregunta; si falla no se recuerda el fallo, para que baste dejar el archivo. */
export function loadManual(): Promise<ManualIndex> {
  loading ??= openManual(manualPath()).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export function forgetManual(): void {
  loading = null;
}
