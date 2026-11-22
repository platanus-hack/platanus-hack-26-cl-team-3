export type ContentBlock = { type: string; [field: string]: unknown };

export type AnthropicMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

export type ErrorCode = 'refusal' | 'provider' | 'credit' | 'limit' | 'internal' | 'network' | 'config';

export type ChatEvent =
  | { type: 'tool'; name: string }
  | { type: 'text'; block: number; text: string }
  | { type: 'citation'; block: number; title: string; source: string; cited_text: string }
  | { type: 'ar'; part: string; instruction: string; action?: unknown }
  | { type: 'done'; messages: AnthropicMessage[]; truncated?: boolean; conversationId?: string }
  | { type: 'error'; code: ErrorCode; message: string };
