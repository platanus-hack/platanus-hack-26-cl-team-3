import type { Tool as ToolDefinition, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { lookupFuses } from "./lookup-fuses";

export interface ToolOutput {
  content: Exclude<ToolResultBlockParam["content"], string | undefined>;
  is_error?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  run(input: unknown): Promise<ToolOutput>;
}

export type ToolRegistry = Record<string, Tool>;

export const tools: ToolRegistry = {
  [lookupFuses.definition.name]: lookupFuses,
};
