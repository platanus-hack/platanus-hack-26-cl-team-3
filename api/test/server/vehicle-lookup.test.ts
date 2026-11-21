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

test("the seed supplements existing registrations and publishes atomically on first startup", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prt-layer-"));
  const vehicleDatabase = join(directory, "operator.sqlite");
  const seed = join(directory, "seed.sqlite");
  const previous = process.env.PRT_SEED_PATH;
  process.env.PRT_SEED_PATH = seed;
  t.after(async () => {
    if (previous === undefined) delete process.env.PRT_SEED_PATH;
    else process.env.PRT_SEED_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const server = createServer({ vehicleDatabase });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const lookup = (plate: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vehicles/${plate}`);
  const populate = (file: string, plates: string[], model: string) => {
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE vehicle_descriptions(id INTEGER PRIMARY KEY, make TEXT, model TEXT, year INTEGER); CREATE TABLE vehicles(plate TEXT PRIMARY KEY, description_id INTEGER)");
    db.prepare("INSERT INTO vehicle_descriptions VALUES(1,'Example',?,2020)").run(model);
    for (const plate of plates) db.prepare("INSERT INTO vehicles VALUES(?,1)").run(plate);
    db.close();
  };

  assert.equal((await lookup("ABCD12")).status, 503);
  populate(seed, ["ABCD12", "WXYZ34"], "Seed");
  assert.equal((await (await lookup("ABCD12")).json()).model, "Seed");
  populate(vehicleDatabase, ["ABCD12", "BCDF56"], "Existing");
  assert.equal((await (await lookup("ABCD12")).json()).model, "Existing");
  assert.equal((await (await lookup("BCDF56")).json()).model, "Existing");
  assert.equal((await (await lookup("WXYZ34")).json()).model, "Seed");
  assert.equal((await lookup("ZZZZ99")).status, 404);
});
