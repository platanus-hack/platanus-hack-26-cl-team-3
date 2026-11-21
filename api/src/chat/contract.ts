import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export type ErrorCode = "refusal" | "provider" | "credit" | "limit" | "internal";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Profile {
  id: string;
  name?: string;
  model: string;
  isDefault?: boolean;
  effort?: Effort;
}

export interface ChatRequest {
  profile_id?: string;
  messages: MessageParam[];
}

export type ChatEvent =
  | { event: "tool"; data: { name: string } }
  | { event: "text"; data: { block: number; text: string } }
  | { event: "citation"; data: { block: number; title: string; source: string; cited_text: string } }
  | { event: "ar"; data: { part: string; instruction: string; action?: "highlight" | "lift" | "refill" } }
  | { event: "done"; data: { messages: MessageParam[]; truncated?: true } }
  | { event: "error"; data: { code: ErrorCode; message: string } };
