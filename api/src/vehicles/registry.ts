import outbackParts from "../data/parts/outback.json";
import swiftParts from "../data/parts/swift.json";
import outbackFuses from "../data/fuses/outback.json";
import swiftFuses from "../data/fuses/swift.json";
import type { FuseTable } from "../tools/fuse-table";

export interface PartRow {
  id: string;
  name: string;
  detail: string;
  source: string;
}

export interface VehicleProfile {
  id: string;
  label: string;
  parts: PartRow[];
  partsSource: string;
  partsTitle: string;
  sources: string;
  actions: (part: string) => string[];
  fuses: FuseTable | null;
  manual: boolean;
}

const OUTBACK_OPENING = new Set(["washer", "fuses", "oil_cap", "dipstick", "positive", "brake_cap", "brake_fluid"]);

const outback: VehicleProfile = {
  id: "outback",
  label: "Subaru Outback 2016, motor 3.6R",
  parts: outbackParts,
  partsSource: "piezas://outback-2016-3.6r/vano",
  partsTitle: "Piezas del vano del motor",
  sources: `Fuentes: solo lo que devuelvan lookup_fuses, lookup_parts, buscar_manual y leer_manual. Busca antes de
responder cualquier dato del auto. Si no aparece, di «No lo encuentro en el manual» y sugiere consultar
a un mecánico. No completes datos de memoria (amperajes, tipos de ampolleta, líquidos).

Manual: para mantención, capacidades, procedimientos, luces del tablero, ampolletas o neumáticos usa
buscar_manual. El manual está en inglés: escribe la consulta en inglés con sus palabras («engine oil
level gauge») y responde tú en español. Si el procedimiento sigue en otra página, usa leer_manual. Cubre
los motores 2.5 L y 3.6 L: este auto es 3.6 L, usa solo lo marcado 3.6 L o lo común a ambos. Cita la
página impresa («manual, pág. 11-11»). Es una copia de terceros: en datos críticos o de seguridad
(presiones, capacidades, fusibles, batería) pide confirmarlo con el manual físico de la guantera. Cuenta
lo que dice el manual, sin agregar pasos que no estén."`,
  actions: (part) => [
    "highlight",
    "lift",
    ...(part === "washer" ? ["refill"] : []),
    ...(OUTBACK_OPENING.has(part) ? ["open"] : []),
  ],
  fuses: outbackFuses,
  manual: true,
};

const swift: VehicleProfile = {
  id: "swift",
  label: "Suzuki Swift 2017, motor 1.2",
  parts: swiftParts,
  partsSource: "piezas://swift-2017-1.2/vano",
  partsTitle: "Piezas del vano del motor",
  sources:
    "Fuentes: solo lo que devuelvan lookup_parts y lookup_fuses. lookup_parts son fichas de Hoodini sin manual verificado; lookup_fuses es la tabla del manual del propietario del Swift, base edición Myanmar (copia de terceros). No tienes el manual completo de este auto. Fusibles: usa solo lo que devuelva lookup_fuses y no completes amperajes ni circuitos de memoria. Las posiciones marcadas «según versión» dependen del equipamiento del auto: dilo en la respuesta y pide confirmarlo con la etiqueta del reverso de la tapa de la caja de fusibles. Si te piden un dato que no está en las fichas ni en la tabla (capacidades, tipos de líquido, presiones), di «No tengo ese dato verificado para el Swift» y sugiere el manual del propietario o un mecánico. No completes datos de memoria.",
  actions: () => ["highlight", "lift"],
  fuses: swiftFuses,
  manual: false,
};

export const profiles: Record<string, VehicleProfile> = { outback, swift };

export const genericProfile = (id: string): VehicleProfile => ({
  id,
  label: "un auto que Hoodini todavía no tiene en su catálogo verificado",
  parts: [],
  partsSource: "",
  partsTitle: "",
  sources:
    "No tienes información verificada de este auto. Dilo de entrada: Hoodini todavía no tiene datos de este modelo. Sugiere el manual del propietario o un mecánico y no des datos de memoria.",
  actions: () => [],
  fuses: null,
  manual: false,
});

export function resolveVehicle(id: unknown): VehicleProfile {
  if (id === undefined || id === null) return outback;
  const key = String(id);
  return Object.hasOwn(profiles, key) ? profiles[key] : genericProfile(key);
}
