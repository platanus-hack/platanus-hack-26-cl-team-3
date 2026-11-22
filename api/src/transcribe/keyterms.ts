import outbackParts from "../data/parts/outback.json";
import swiftParts from "../data/parts/swift.json";

const rows = [...outbackParts, ...swiftParts];

const COLLOQUIAL = [
  "sapito", "varilla del aceite", "tapa del aceite", "refrigerante", "líquido de frenos",
  "caja de fusibles", "fusible", "batería", "borne positivo", "filtro de aire",
  "limpiaparabrisas", "capó", "Outback", "Subaru",
];

const valid = (t: string) => t.length > 0 && t.length <= 50 && t.split(/\s+/).length <= 5;

export const KEYTERMS: string[] = [...new Set([...rows.map((r) => r.name.trim()), ...COLLOQUIAL])].filter(valid);
