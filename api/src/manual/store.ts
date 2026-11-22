import { resolve } from "node:path";
import { ManualIndex } from "./search";

/** El índice es un archivo que se prepara aparte (scripts/manual/preparar-manual.sh): el manual no vive en el repo. */
export function manualPath(): string {
  return process.env.MANUAL_INDEX || resolve(import.meta.dirname, "../../.manual/outback-2016.json");
}

let loading: Promise<ManualIndex> | null = null;

/** Se carga la primera vez que alguien pregunta; si falla no se recuerda el fallo, para que baste dejar el archivo. */
export function loadManual(): Promise<ManualIndex> {
  loading ??= ManualIndex.load(manualPath()).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export function forgetManual(): void {
  loading = null;
}
