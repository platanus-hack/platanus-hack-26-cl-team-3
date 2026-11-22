import http from "node:http";
import type { Adapter } from "../chat/orchestrator";
import type { Locator } from "../locate/contract";
import { handleLocate } from "../locate/handler";
import { handleConversations } from "../conversations/handler";
import type { ConversationStore } from "../conversations/store";
import type { RunLogStore } from "../runlog/store";
import { handleChat } from "./chat-handler";
import { handleTranscribe } from "../transcribe/handler";
import type { Transcriber } from "../transcribe/handler";
import { json } from "./responses";
import { defaultVehicleDatabase, handleVehicleLookup } from "./vehicle-lookup";

export function createServer({
  adapter, locator, heartbeatMs, transcriber, vehicleDatabase = defaultVehicleDatabase,
  conversations = null, runlog = null,
}: { adapter?: Adapter; locator?: Locator; heartbeatMs?: number; transcriber?: Transcriber; vehicleDatabase?: string; conversations?: ConversationStore | null; runlog?: RunLogStore | null } = {}): http.Server {
  return http.createServer((req, res) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      return json(res, 400, { error: "URL inválida" });
    }
    if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && (pathname === "/api/vehicles" || pathname.startsWith("/api/vehicles/"))) {
      return handleVehicleLookup(res, pathname.slice("/api/vehicles/".length), vehicleDatabase);
    }
    if (req.method === "POST" && pathname === "/api/chat") return void handleChat(req, res, adapter, heartbeatMs, { conversations, runlog });
    if (req.method === "POST" && pathname === "/api/locate") return void handleLocate(req, res, locator);
    if (req.method === "POST" && pathname === "/api/transcribe") return void handleTranscribe(req, res, transcriber);
    if (pathname === "/api/devices" || pathname === "/api/conversations" || pathname.startsWith("/api/conversations/")) {
      return void handleConversations(req, res, pathname, conversations);
    }
    json(res, 404, { error: "No encontrado" });
  });
}
