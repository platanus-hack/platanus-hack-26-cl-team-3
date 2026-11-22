import type { Tool as ToolDefinition, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ChatEvent } from "../chat/contract";
import { buscarManual } from "./buscar-manual";
import { leerManual } from "./leer-manual";
import { lookupFuses } from "./lookup-fuses";
import { lookupParts } from "./lookup-parts";
import { showInCamera } from "./show-in-camera";

export interface ToolOutput {
  content: Exclude<ToolResultBlockParam["content"], string | undefined>;
  is_error?: boolean;
  events?: ChatEvent[];
}

export interface Tool {
  definition: ToolDefinition;
  run(input: unknown): Promise<ToolOutput>;
}

export type ToolRegistry = Record<string, Tool>;

export const tools: ToolRegistry = {
  [lookupFuses.definition.name]: lookupFuses,
  [lookupParts.definition.name]: lookupParts,
  [showInCamera.definition.name]: showInCamera,
  [buscarManual.definition.name]: buscarManual,
  [leerManual.definition.name]: leerManual,
};
