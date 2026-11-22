export interface TurnLog {
  id: string;
  conversation_id: string | null;
  device_id: string | null;
  created_at: string;
  model: string;
  effort: string | null;
  mode: string | null;
  prompt_version: string;
  context_messages: number;
  question: string | null;
  answer: string | null;
  fresh: string | null;
  outcome: string;
  rounds: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  duration_ms: number;
}

export interface ToolRunLog {
  round: number;
  tool_use_id: string;
  name: string;
  input: string;
  output: string | null;
  is_error: boolean;
  duration_ms: number;
}

export interface LogCursor {
  created_at: string;
  id: string;
}

export interface TurnSummary {
  id: string;
  conversation_id: string | null;
  created_at: string;
  outcome: string;
}

export interface ToolRunDetail {
  id: number;
  round: number;
  tool_use_id: string;
  name: string;
  input: unknown;
  output: unknown;
  is_error: boolean;
  duration_ms: number;
}

export type TurnDetail = Omit<TurnLog, "fresh"> & { messages: unknown; tools: ToolRunDetail[] };

export interface Page<T> {
  items: T[];
  next: LogCursor | null;
}

export interface RunLogStore {
  saveTurn(turn: TurnLog, tools: ToolRunLog[]): void;
  listTurns(limit: number, cursor: LogCursor | null): Page<TurnSummary>;
  conversationTurns(
    turnId: string,
    limit: number,
    cursor: LogCursor | null,
  ): (Page<TurnDetail> & { conversation_id: string | null }) | null;
}
