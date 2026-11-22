import { DatabaseSync } from "node:sqlite";

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function ensureVehicleColumn(db: DatabaseSync, table: "turns" | "conversations") {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === "vehicle_id")) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN vehicle_id TEXT`);
  }
}
