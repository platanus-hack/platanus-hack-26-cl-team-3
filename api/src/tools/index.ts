import type { Tool as ToolDefinition, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ChatEvent } from "../chat/contract";
import { buscarManual } from "./buscar-manual";
import { leerManual } from "./leer-manual";
import { lookupFuses } from "./lookup-fuses";
import { lookupParts } from "./lookup-parts";
import { showInCamera } from "./show-in-camera";
import { profiles, type VehicleProfile } from "../vehicles/registry";

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

export function toolsFor(profile: VehicleProfile): ToolRegistry {
  const list: Tool[] = [
    ...(profile.fuses ? [lookupFuses] : []),
    ...(profile.parts.length > 0 ? [lookupParts(profile), showInCamera(profile)] : []),
    ...(profile.manual ? [buscarManual, leerManual] : []),
  ];
  return Object.fromEntries(list.map((t) => [t.definition.name, t]));
}

export const tools: ToolRegistry = toolsFor(profiles.outback);
