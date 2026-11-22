import { createServer } from "./server/server";
import { sqliteStore } from "./conversations/sqlite-store";

const port = Number(process.env.PORT ?? 8787);
const conversations = process.env.HISTORIAL_DB ? sqliteStore(process.env.HISTORIAL_DB) : null;
createServer({ conversations }).listen(port, "0.0.0.0", () => console.log(`api listening on :${port}`));
