import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const CONTEXT_MESSAGES = 30;

const isRealUser = (m: MessageParam): boolean =>
  m.role === "user" && (typeof m.content === "string" || m.content.some((b) => b.type !== "tool_result"));

const withoutThinking = (m: MessageParam): MessageParam => {
  if (m.role !== "assistant" || typeof m.content === "string") return m;
  const kept = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
  if (kept.length === m.content.length) return m;
  const content: ContentBlockParam[] = kept.length > 0 ? kept : [{ type: "text", text: "…" }];
  return { ...m, content };
};

export function contextWindow(messages: MessageParam[], max = CONTEXT_MESSAGES): MessageParam[] {
  if (messages.length <= max) return messages;
  let start = messages.length - max;
  while (start < messages.length - 1 && !isRealUser(messages[start])) start++;
  return messages.slice(start).map(withoutThinking);
}
