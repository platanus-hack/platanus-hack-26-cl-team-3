import { createServer } from "./server/server";
import { openDatabase } from "./db/sqlite";
import { sqliteStore } from "./conversations/sqlite-store";
import { sqliteRunLog } from "./runlog/sqlite-runlog";

const port = Number(process.env.PORT ?? 8787);
const db = process.env.HISTORIAL_DB ? openDatabase(process.env.HISTORIAL_DB) : null;
const conversations = db ? sqliteStore(db) : null;
const runlog = db ? sqliteRunLog(db) : null;
createServer({ conversations, runlog }).listen(port, "0.0.0.0", () => console.log(`api listening on :${port}`));
