import http from "node:http";
import type { Adapter } from "../chat/orchestrator";
import { handleChat } from "./chat-handler";
import { json } from "./responses";
import { defaultVehicleDatabase, handleVehicleLookup } from "./vehicle-lookup";

export function createServer({
  adapter, heartbeatMs, vehicleDatabase = defaultVehicleDatabase,
}: { adapter?: Adapter; heartbeatMs?: number; vehicleDatabase?: string } = {}): http.Server {
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
    if (req.method === "POST" && pathname === "/api/chat") return void handleChat(req, res, adapter, heartbeatMs);
    json(res, 404, { error: "No encontrado" });
  });
}
