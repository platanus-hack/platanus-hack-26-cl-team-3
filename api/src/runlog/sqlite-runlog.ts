import type { DatabaseSync } from "node:sqlite";
import type { RunLogStore } from "./store";

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

  return {
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
