import { ensureVehicleColumn } from "../db/sqlite";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConversationStore, Receipt } from "./store";

export function sqliteStore(db: DatabaseSync): ConversationStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      title TEXT,
      vehicle_id TEXT,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_receipts (
      device_id TEXT NOT NULL, request_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY (device_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS conversations_device_updated ON conversations (device_id, updated_at DESC);
  `);

  ensureVehicleColumn(db, "conversations");
  const insertDevice = db.prepare("INSERT INTO devices (id, created_at) VALUES (?, ?)");
  const insertConv = db.prepare(
    `INSERT INTO conversations (id, device_id, title, vehicle_id, messages, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM devices WHERE id = ?)`,
  );
  const updateConv = db.prepare(
    "UPDATE conversations SET title = ?, vehicle_id = ?, messages = ?, updated_at = ? WHERE id = ? AND device_id = ?",
  );
  const listConv = db.prepare(
    "SELECT id, title, vehicle_id, updated_at FROM conversations WHERE device_id = ? AND (updated_at, id) < (?, ?) ORDER BY updated_at DESC, id DESC LIMIT ?",
  );
  const getConv = db.prepare(
    "SELECT id, title, vehicle_id, updated_at, messages FROM conversations WHERE id = ? AND device_id = ?",
  );

  return {
    receipt(device, request) {
      const row = db.prepare("SELECT result FROM chat_receipts WHERE device_id = ? AND request_id = ?").get(device, request);
      return row ? JSON.parse(row.result as string) as Receipt : null;
    },
    complete(device, id, baseCount, data, receipt) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const now = new Date().toISOString();
        const key = id ?? randomUUID();
        const messages = JSON.stringify(data.messages);
        const saved = id
          ? db.prepare("UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ? AND device_id = ? AND json_array_length(messages) = ?")
            .run(messages, now, id, device, baseCount)
          : insertConv.run(key, device, data.title, data.vehicle_id, messages, now, now, device);
        if (saved.changes && receipt) {
          db.prepare("INSERT INTO chat_receipts VALUES (?, ?, ?)").run(device, receipt.request,
            JSON.stringify({ ...receipt.result, conversation_id: key }));
        }
        db.exec("COMMIT");
        return saved.changes ? key : null;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async createDevice() {
      const id = randomUUID();
      insertDevice.run(id, new Date().toISOString());
      return id;
    },
    async list(deviceId, limit, before) {
      return listConv.all(deviceId, before?.updated_at ?? "9999", before?.id ?? "", limit) as unknown as { id: string; title: string | null; vehicle_id: string | null; updated_at: string }[];
    },
    async get(deviceId, id) {
      const r = getConv.get(id, deviceId) as
        | { id: string; title: string | null; vehicle_id: string | null; updated_at: string; messages: string }
        | undefined;
      return r ? { ...r, messages: JSON.parse(r.messages) } : null;
    },
    async create(deviceId, data) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const res = insertConv.run(id, deviceId, data.title, data.vehicle_id, JSON.stringify(data.messages), now, now, deviceId);
      return Number(res.changes) > 0 ? id : null;
    },
    async update(deviceId, id, data) {
      const res = updateConv.run(data.title, data.vehicle_id, JSON.stringify(data.messages), new Date().toISOString(), id, deviceId);
      return Number(res.changes) > 0;
    },
  };
}
