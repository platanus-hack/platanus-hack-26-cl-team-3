import data from "../data/fuses.json";

export type BoxKey = "cabina" | "motor";

export interface FuseRow {
  box: string;
  number: number;
  amps: number | null;
  circuit: string;
  description: string;
  part_id: string;
  page: number;
}

export { data };
export const FUSES = data.fuses as FuseRow[];
export const BOXES = data.boxes as Record<BoxKey, { title: string; location: string; pages: string }>;
export const BOX_LABEL: Record<BoxKey, string> = { cabina: "caja de la cabina", motor: "caja del motor" };
