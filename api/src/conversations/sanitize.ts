import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const PHOTO_PLACEHOLDER = { type: "text", text: "[foto del vano]" } as const;
const MAX_TITLE = 60;

export function stripImages(messages: MessageParam[]): MessageParam[] {
  return messages.map((m) => {
    if (m.role === "system" || !Array.isArray(m.content)) return m;
    return { ...m, content: m.content.map(block => {
      if (block.type === "image") return PHOTO_PLACEHOLDER;
      if (block.type !== "tool_result" || !Array.isArray(block.content)) return block;
      return { ...block, content: block.content.map(item => item.type === "image" ? PHOTO_PLACEHOLDER : item) };
    }) } as MessageParam;
  });
}

export function titleFrom(messages: MessageParam[]): string | null {
  const first = messages.find((m) => m.role === "user");
  if (!first) return null;
  let text: string | undefined;
  if (typeof first.content === "string") text = first.content;
  else text = (first.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text;
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE)}…` : t;
}
