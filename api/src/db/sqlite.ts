import { DatabaseSync } from "node:sqlite";

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  return db;
}
