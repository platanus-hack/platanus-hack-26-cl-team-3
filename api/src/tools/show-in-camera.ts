import type { Tool as ToolDefinition } from "@anthropic-ai/sdk/resources/messages";
import type { VehicleProfile } from "../vehicles/registry";
import type { Tool, ToolOutput } from "./index";

type ArAction = "highlight" | "lift" | "open" | "refill";
const MAX_INSTRUCTION = 200;
const ACTION_ORDER = ["highlight", "lift", "refill", "open"];

const invalid = (text: string): ToolOutput => ({ content: [{ type: "text", text }], is_error: true });

function actionDescription(profile: VehicleProfile): string {
  const partsFor = (action: string) => profile.parts.filter((p) => profile.actions(p.id).includes(action)).map((p) => p.id);
  const refill = partsFor("refill");
  const open = partsFor("open");
  const extra = [
    ...(refill.length > 0 ? [`refill muestra cómo rellenar el sapito (solo ${refill.join(", ")})`] : []),
    ...(open.length > 0 ? [`open muestra cómo se abre la tapa o cubierta, o sale la varilla (${open.join(", ")})`] : []),
  ];
  return (
    "Animación 3D del paso, para cuando el conductor ya encontró la pieza. Omítela en la llamada que marca la pieza " +
    "por primera vez. highlight la hace destellar y lift la levanta en 3D (cualquier pieza)" +
    (extra.length > 0 ? `; ${extra.join("; ")}.` : ".")
  );
}

export function showInCamera(profile: VehicleProfile): Tool {
  const rows = profile.parts;
  const actions = ACTION_ORDER.filter((a) => rows.some((p) => profile.actions(p.id).includes(a)));
  const definition: ToolDefinition = {
    name: "show_in_camera",
    description:
      "Agrega un paso a la guía de cámara: la app marca la pieza del vano del motor y guía al conductor hasta ella. " +
      "Úsala solo con piezas que devolvió lookup_parts. `instruction` es una frase corta en español que dice qué buscar " +
      "o qué hacer en ese paso. Primero marca la pieza sin action; la animación va en una llamada posterior con la misma pieza.",
    input_schema: {
      type: "object",
      properties: {
        part: { type: "string", enum: rows.map((p) => p.id) },
        instruction: { type: "string", description: "One short Chilean Spanish sentence spoken to the driver at this stage. Describe only the current action." },
        action: { type: "string", enum: actions, description: actionDescription(profile) },
      },
      required: ["part", "instruction"],
      additionalProperties: false,
    },
  };

  async function run(input: unknown): Promise<ToolOutput> {
    if (input === null || typeof input !== "object") return invalid("Input inválido: se espera { part, instruction }.");
    const { part, instruction, action } = input as { part?: unknown; instruction?: unknown; action?: unknown };
    const row = typeof part === "string" ? rows.find((p) => p.id === part) : undefined;
    if (!row) return invalid("Pieza desconocida: usa un part que devolvió lookup_parts.");
    if (typeof instruction !== "string" || instruction.trim() === "") return invalid("Falta la instrucción.");
    if (action !== undefined && !(typeof action === "string" && profile.actions(row.id).includes(action))) {
      return invalid("Unsupported inspection action for this part.");
    }
    const text = instruction.trim().slice(0, MAX_INSTRUCTION);
    return {
      content: [{ type: "text", text: `Paso agregado a la guía de cámara: ${row.name}. No lo menciones en tu respuesta; el texto tiene que entenderse solo.` }],
      events: [{ event: "ar", data: { part: row.id, instruction: text, ...(action ? { action: action as ArAction } : {}) } }],
    };
  }

  return { definition, run };
}
