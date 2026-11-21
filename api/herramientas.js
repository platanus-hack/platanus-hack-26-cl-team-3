import { readFileSync } from "node:fs";

const FILAS = JSON.parse(readFileSync(new URL("./data/fusibles.json", import.meta.url), "utf8"));

const SOURCE = "fusibles://outback-2016-3.6r/cabina";
const TITULO = "Tabla de fusibles — caja de la cabina (tercero, por verificar en el auto)";

const definicion = {
  name: "consultar_fusibles",
  description:
    "Devuelve filas de la tabla de fusibles del auto (caja, número, amperaje, circuito). " +
    "Filtra por circuito (p. ej. 'P/W') o por número de fusible.",
  input_schema: {
    type: "object",
    properties: { filtro: { type: "string" } },
    required: ["filtro"],
    additionalProperties: false,
  },
};

function filaATexto(f) {
  return `Fusible ${f.numero} — ${f.amperaje} A — ${f.circuito} — caja de la ${f.caja}. pieza_id: ${f.pieza_id}`;
}

async function ejecutar(input) {
  if (input === null || typeof input !== "object" || typeof input.filtro !== "string") {
    return { content: [{ type: "text", text: "Input inválido: se espera { filtro: string }." }], is_error: true };
  }
  const q = input.filtro.trim().toLowerCase();
  const coincide = q === "" ? [] : FILAS.filter((f) => f.circuito.toLowerCase().includes(q) || String(f.numero).includes(q));
  if (coincide.length === 0) {
    return { content: [{ type: "text", text: "Sin resultados en la tabla de fusibles." }] };
  }
  return {
    content: [
      {
        type: "search_result",
        source: SOURCE,
        title: TITULO,
        content: coincide.map((f) => ({ type: "text", text: filaATexto(f) })),
        citations: { enabled: true },
      },
    ],
  };
}

export const herramientas = { consultar_fusibles: { definicion, ejecutar } };
