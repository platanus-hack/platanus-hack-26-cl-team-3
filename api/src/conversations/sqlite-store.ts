import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConversationStore } from "./store";

export function sqliteStore(db: DatabaseSync): ConversationStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      title TEXT,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_device_updated ON conversations (device_id, updated_at DESC);
  `);

  const insertDevice = db.prepare("INSERT INTO devices (id, created_at) VALUES (?, ?)");
  const insertConv = db.prepare(
    `INSERT INTO conversations (id, device_id, title, messages, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM devices WHERE id = ?)`,
  );
  const updateConv = db.prepare(
    "UPDATE conversations SET title = ?, messages = ?, updated_at = ? WHERE id = ? AND device_id = ?",
  );
  const listConv = db.prepare(
    "SELECT id, title, updated_at FROM conversations WHERE device_id = ? ORDER BY updated_at DESC LIMIT ?",
  );
  const getConv = db.prepare(
    "SELECT id, title, updated_at, messages FROM conversations WHERE id = ? AND device_id = ?",
  );

  return {
    async createDevice() {
      const id = randomUUID();
      insertDevice.run(id, new Date().toISOString());
      return id;
    },
    async list(deviceId, limit) {
      return listConv.all(deviceId, limit) as unknown as { id: string; title: string | null; updated_at: string }[];
    },
    async get(deviceId, id) {
      const r = getConv.get(id, deviceId) as
        | { id: string; title: string | null; updated_at: string; messages: string }
        | undefined;
      return r ? { ...r, messages: JSON.parse(r.messages) } : null;
    },
    async create(deviceId, data) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const res = insertConv.run(id, deviceId, data.title, JSON.stringify(data.messages), now, now, deviceId);
      return Number(res.changes) > 0 ? id : null;
    },
    async update(deviceId, id, data) {
      const res = updateConv.run(data.title, JSON.stringify(data.messages), new Date().toISOString(), id, deviceId);
      return Number(res.changes) > 0;
    },
  };
}
