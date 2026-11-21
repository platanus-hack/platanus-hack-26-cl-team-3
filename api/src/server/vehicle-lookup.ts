import type { ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { json } from "./responses";

export const defaultVehicleDatabase = fileURLToPath(new URL("../../data/vehicles.sqlite", import.meta.url));

export function handleVehicleLookup(res: ServerResponse, plateSegment: string, databasePath: string): void {
  let plate: string;
  try {
    const input = decodeURIComponent(plateSegment);
    if (!/^[A-Za-z0-9 .-]+$/.test(input)) throw new Error("Invalid plate characters");
    plate = input.replace(/[ .-]/g, "").toUpperCase();
    if (plate.length !== 6) throw new Error("Invalid plate length");
  } catch {
    return json(res, 400, { error: "Ingresa una patente de seis caracteres." });
  }

  let db: DatabaseSync | undefined;
  try {
    // Opening the published snapshot per lookup also picks up atomic replacements.
    db = new DatabaseSync(databasePath, { readOnly: true });
    const vehicle = db.prepare(`
      SELECT v.plate, d.make, d.model, d.year
      FROM vehicles v JOIN vehicle_descriptions d ON d.id = v.description_id
      WHERE v.plate = ?
    `).get(plate);
    if (!vehicle) return json(res, 404, { error: "No hay registros PRT para esta patente." });
    json(res, 200, vehicle);
  } catch {
    json(res, 503, { error: "La base de revisiones técnicas no está disponible." });
  } finally {
    db?.close();
  }
}
