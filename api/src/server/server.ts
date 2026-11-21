import http from "node:http";
import type { Adapter } from "../chat/orchestrator";
import { handleChat } from "./chat-handler";
import { json } from "./responses";

export function createServer({ adapter }: { adapter?: Adapter } = {}): http.Server {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true });
    if (req.method === "POST" && pathname === "/api/chat") return void handleChat(req, res, adapter);
    json(res, 404, { error: "No encontrado" });
  });
}
