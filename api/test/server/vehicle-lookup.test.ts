import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createServer } from "../../src/server/server";

test("plate lookup normalizes input, distinguishes a missing dataset, and returns an exact match", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prt-api-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vehicleDatabase = join(directory, "vehicles.sqlite");
  const server = createServer({ vehicleDatabase });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const lookup = (plate: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vehicles/${plate}`);

  assert.equal((await lookup("AB1234")).status, 503);
  for (const badPlate of ["", "AB", "AB%2F1234", "AB%ZZ1234", "Aß1234"]) {
    assert.equal((await lookup(badPlate)).status, 400);
  }

  const db = new DatabaseSync(vehicleDatabase);
  db.exec(`
    CREATE TABLE vehicle_descriptions(id INTEGER PRIMARY KEY, make TEXT, model TEXT, year INTEGER);
    CREATE TABLE vehicles(plate TEXT PRIMARY KEY, description_id INTEGER);
    INSERT INTO vehicle_descriptions VALUES(1, 'Example', 'Compact', 2020);
    INSERT INTO vehicles VALUES('AB1234', 1);
  `);
  db.close();
  const response = await lookup("ab.%2012-34");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { plate: "AB1234", make: "Example", model: "Compact", year: 2020 });
  assert.equal((await lookup("ABCD12")).status, 404);
});
