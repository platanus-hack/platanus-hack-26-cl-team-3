import type { DatabaseSync } from "node:sqlite";
import type { LogCursor, Page, RunLogStore, ToolRunDetail, TurnDetail, TurnLog, TurnSummary } from "./store";

type ToolRow = Omit<ToolRunDetail, "input" | "output" | "is_error"> & {
  turn_id: string;
  input: string;
  output: string | null;
  is_error: number;
};

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pageOf<T extends { created_at: string; id: string }>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, next: rows.length > limit && last ? { created_at: last.created_at, id: last.id } : null };
}

export function sqliteRunLog(db: DatabaseSync): RunLogStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      device_id TEXT,
      created_at TEXT NOT NULL,
      model TEXT NOT NULL,
      effort TEXT,
      mode TEXT,
      prompt_version TEXT NOT NULL,
      context_messages INTEGER NOT NULL,
      question TEXT,
      answer TEXT,
      fresh TEXT,
      outcome TEXT NOT NULL,
      rounds INTEGER NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER,
      duration_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS turns_conversation_created ON turns (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS turns_created ON turns (created_at, id);
    CREATE TABLE IF NOT EXISTS tool_runs (
      id INTEGER PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id),
      round INTEGER NOT NULL,
      tool_use_id TEXT NOT NULL,
      name TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      is_error INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tool_runs_turn ON tool_runs (turn_id);
  `);

  const insertTurn = db.prepare(
    `INSERT INTO turns (id, conversation_id, device_id, created_at, model, effort, mode, prompt_version, context_messages,
       question, answer, fresh, outcome, rounds, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTool = db.prepare(
    `INSERT INTO tool_runs (turn_id, round, tool_use_id, name, input, output, is_error, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const summaryColumns = "id, conversation_id, created_at, outcome";
  const listFirst = db.prepare(`SELECT ${summaryColumns} FROM turns ORDER BY created_at DESC, id DESC LIMIT ?`);
  const listAfter = db.prepare(
    `SELECT ${summaryColumns} FROM turns WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?`,
  );
  const findTurn = db.prepare("SELECT * FROM turns WHERE id = ?");
  const conversationFirst = db.prepare(
    "SELECT * FROM turns WHERE conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT ?",
  );
  const conversationAfter = db.prepare(
    "SELECT * FROM turns WHERE conversation_id = ? AND (created_at, id) > (?, ?) ORDER BY created_at ASC, id ASC LIMIT ?",
  );

  function withTools(rows: (TurnLog & { id: string })[]): TurnDetail[] {
    const byTurn = new Map<string, ToolRunDetail[]>();
    if (rows.length > 0) {
      const marks = rows.map(() => "?").join(", ");
      const tools = db
        .prepare(`SELECT * FROM tool_runs WHERE turn_id IN (${marks}) ORDER BY round ASC, id ASC`)
        .all(...rows.map((r) => r.id)) as unknown as ToolRow[];
      for (const { turn_id, ...t } of tools) {
        const list = byTurn.get(turn_id) ?? [];
        list.push({ ...t, input: parseJson(t.input), output: parseJson(t.output), is_error: t.is_error === 1 });
        byTurn.set(turn_id, list);
      }
    }
    return rows.map(({ fresh, ...turn }) => ({ ...turn, messages: parseJson(fresh), tools: byTurn.get(turn.id) ?? [] }));
  }

  return {
    listTurns(limit, cursor) {
      const rows = (cursor
        ? listAfter.all(cursor.created_at, cursor.id, limit + 1)
        : listFirst.all(limit + 1)) as unknown as TurnSummary[];
      return pageOf(rows, limit);
    },
    conversationTurns(turnId, limit, cursor) {
      const turn = findTurn.get(turnId) as unknown as TurnLog | undefined;
      if (!turn) return null;
      let rows: TurnLog[];
      if (turn.conversation_id === null) rows = cursor ? [] : [turn];
      else {
        rows = (cursor
          ? conversationAfter.all(turn.conversation_id, cursor.created_at, cursor.id, limit + 1)
          : conversationFirst.all(turn.conversation_id, limit + 1)) as unknown as TurnLog[];
      }
      const page = pageOf(rows, limit);
      return { conversation_id: turn.conversation_id, items: withTools(page.items), next: page.next };
    },
    saveTurn(t, tools) {
      db.exec("BEGIN");
      try {
        insertTurn.run(
          t.id, t.conversation_id, t.device_id, t.created_at, t.model, t.effort, t.mode, t.prompt_version, t.context_messages,
          t.question, t.answer, t.fresh, t.outcome, t.rounds, t.input_tokens, t.output_tokens, t.cache_read_tokens,
          t.cache_creation_tokens, t.duration_ms,
        );
        for (const r of tools) {
          insertTool.run(t.id, r.round, r.tool_use_id, r.name, r.input, r.output, r.is_error ? 1 : 0, r.duration_ms);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
