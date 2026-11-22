export interface FuseRow {
  box: string;
  number: number;
  amps: number | null;
  circuit: string;
  description: string;
  part_id: string;
  page: number;
}

export interface FuseBoxInfo {
  title: string;
  location: string;
  pages: string;
}

export interface FuseTable {
  vehicle: string;
  source: string;
  source_uri: string;
  boxes: Record<string, FuseBoxInfo>;
  procedure: string;
  notes?: string;
  fuses: FuseRow[];
}

export const boxIds = (table: FuseTable): string[] => Object.keys(table.boxes);

export const isBox = (table: FuseTable, box: unknown): box is string => typeof box === "string" && Object.hasOwn(table.boxes, box);

export const boxLabel = (table: FuseTable, box: string): string => {
  const title = table.boxes[box].title;
  return title.charAt(0).toLowerCase() + title.slice(1);
};

export const findFuse = (table: FuseTable, box: string, number: number): FuseRow | undefined =>
  table.fuses.find((f) => f.box === box && f.number === number);
