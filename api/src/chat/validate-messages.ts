import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function block(value: unknown): boolean {
  if (!object(value)) return false;
  switch (value.type) {
    case "text":
      return typeof value.text === "string" && (value.citations == null ||
        (Array.isArray(value.citations) && value.citations.every(c => object(c) && typeof c.type === "string")));
    case "image":
      return object(value.source) && value.source.type === "base64" && typeof value.source.data === "string" &&
        ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(String(value.source.media_type));
    case "tool_use":
      return typeof value.id === "string" && typeof value.name === "string" && object(value.input);
    case "tool_result":
      return typeof value.tool_use_id === "string" && (value.is_error === undefined || typeof value.is_error === "boolean") &&
        (value.content === undefined || typeof value.content === "string" ||
          (Array.isArray(value.content) && value.content.every(item => object(item) &&
            (item.type === "text" || item.type === "image" || item.type === "search_result") && block(item))));
    case "search_result":
      return typeof value.title === "string" && typeof value.source === "string" && Array.isArray(value.content) &&
        value.content.every(item => object(item) && item.type === "text" && block(item));
    case "thinking":
      return typeof value.thinking === "string" && typeof value.signature === "string";
    case "redacted_thinking":
      return typeof value.data === "string";
    default:
      return false;
  }
}

export function validMessage(value: unknown): value is MessageParam {
  return object(value) && (value.role === "user" || value.role === "assistant") &&
    (typeof value.content === "string" || (Array.isArray(value.content) && value.content.length > 0 && value.content.every(block)));
}
