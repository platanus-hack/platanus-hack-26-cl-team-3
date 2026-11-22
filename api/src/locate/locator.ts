import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getClient, toProviderError } from "../llm/anthropic";
import { ProviderError } from "../llm/errors";
import { resolveProfile } from "../llm/profiles";
import { PART_DESCRIPTIONS } from "./contract";
import type { LocateInput, Locator, RawPoint } from "./contract";

const MAX_TOKENS = 1024;
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

const reference = readFileSync(fileURLToPath(new URL("./reference.jpg", import.meta.url))).toString("base64");

export const SYSTEM_PROMPT = [
  "Eres un localizador de piezas en fotos del vano del motor de un Subaru Outback 2016 3.6R, visto desde el frente del auto.",
  "Para cada punto de la lista, indica si se ve en la imagen y, si se ve, el píxel de su centro.",
  "Las coordenadas son píxeles de la imagen recibida, con el origen arriba a la izquierda, x hacia la derecha e y hacia abajo.",
  "Si un punto está fuera de cuadro, tapado o no lo distingues con seguridad, márcalo con visible en false. No adivines.",
  "Entrega solo los puntos de la lista, una vez cada uno. Si un punto no se ve, deja x e y en 0.",
].join(" ");

export function buildSchema(parts: readonly string[]) {
  return {
    type: "object",
    properties: {
      landmarks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", enum: [...parts] },
            visible: { type: "boolean" },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["name", "visible", "x", "y"],
          additionalProperties: false,
        },
      },
    },
    required: ["landmarks"],
    additionalProperties: false,
  };
}

const jpeg = (data: string): ContentBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: "image/jpeg", data },
});

export function buildContent({ image, width, height, parts }: LocateInput): ContentBlockParam[] {
  const list = parts.map((p) => `- ${p}: ${PART_DESCRIPTIONS[p]}`).join("\n");
  return [
    {
      type: "text",
      text: "Imagen de referencia del mismo auto desde otro ángulo, con algunos puntos rotulados. Úsala solo para saber qué es cada punto; las posiciones cambian con el ángulo:",
    },
    jpeg(reference),
    { type: "text", text: `Imagen a analizar (${width}×${height} px):` },
    jpeg(image),
    { type: "text", text: `Puntos:\n${list}` },
  ];
}

export function parseLandmarks(text: string | undefined): RawPoint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? "");
  } catch {
    throw new ProviderError("La respuesta del modelo no se pudo interpretar.");
  }
  const landmarks = (parsed as { landmarks?: unknown } | null)?.landmarks;
  if (!Array.isArray(landmarks)) throw new ProviderError("La respuesta del modelo no se pudo interpretar.");
  return landmarks.map((l: { name?: unknown; visible?: unknown; x?: unknown; y?: unknown }) => ({
    part: String(l?.name),
    visible: l?.visible === true,
    x: typeof l?.x === "number" ? l.x : NaN,
    y: typeof l?.y === "number" ? l.y : NaN,
  }));
}

export const anthropicLocator: Locator = async (input) => {
  const model = resolveProfile("sonnet")!.model;
  let text: string | undefined;
  try {
    const response = await getClient().messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: buildSchema(input.parts) } },
        messages: [{ role: "user", content: buildContent(input) }],
      },
      { timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES },
    );
    const block = response.content.find((b) => b.type === "text");
    text = block?.type === "text" ? block.text : undefined;
  } catch (e) {
    console.error(e instanceof Error ? e.message : "locate failed");
    throw toProviderError(e);
  }
  return parseLandmarks(text);
};
