import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export interface ConversationSummary { id: string; title: string | null; updated_at: string; vehicle_id: string | null }
export interface Conversation extends ConversationSummary { messages: MessageParam[] }
export type ConversationData = { title: string | null; messages: MessageParam[]; vehicle_id: string | null };

export type PageCursor = { updated_at: string; id: string };
export type Receipt = { fingerprint: string; conversation_id: string; turn_id: string; messages: MessageParam[]; truncated?: true };

export interface ConversationStore {
  receipt(device: string, request: string): Receipt | null;
  complete(device: string, id: string | undefined, baseCount: number, data: ConversationData,
    receipt?: { request: string; result: Omit<Receipt, "conversation_id"> }): string | null;
  createDevice(): Promise<string>;
  list(deviceId: string, limit: number, before?: PageCursor): Promise<ConversationSummary[]>;
  get(deviceId: string, id: string): Promise<Conversation | null>;
  create(deviceId: string, data: ConversationData): Promise<string | null>;
  update(deviceId: string, id: string, data: ConversationData): Promise<boolean>;
}
