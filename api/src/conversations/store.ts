import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export interface ConversationSummary { id: string; title: string | null; updated_at: string; vehicle_id: string | null }
export interface Conversation extends ConversationSummary { messages: MessageParam[] }
export type ConversationData = { title: string | null; messages: MessageParam[]; vehicle_id: string | null };

export interface ConversationStore {
  createDevice(): Promise<string>;
  list(deviceId: string, limit: number): Promise<ConversationSummary[]>;
  get(deviceId: string, id: string): Promise<Conversation | null>;
  create(deviceId: string, data: ConversationData): Promise<string | null>;
  update(deviceId: string, id: string, data: ConversationData): Promise<boolean>;
}
