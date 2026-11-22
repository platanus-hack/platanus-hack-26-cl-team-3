import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogForVehicle, resolveFuseSource } from "../../src/data/fuse-catalog";
import { tools } from "../../src/tools";

const { run } = tools.lookup_fuses;

test("every numbered panel position and the main fuse have a distinct navigable citation", async () => {
  const { content } = await run({ filter: "" });
  assert.equal(content.length, 77);
  const sources = new Set<string>();
  for (const row of content) {
    assert.equal(row.type, "search_result");
    if (row.type !== "search_result") throw Error("Missing citation");
    const target = resolveFuseSource(row.source);
    assert.equal(target?.vehicle, "outback");
    assert.ok(target?.slot);
    assert.equal(row.citations?.enabled, true);
    sources.add(row.source);
  }
  assert.equal(sources.size, 77);
  assert.equal(catalogForVehicle("unknown"), undefined);
  assert.equal(resolveFuseSource("fusibles://swift/engine/1"), null);
});

test("searches both panels and preserves circuit and amperage distinctions", async () => {
  const matches = async (filter: string, box?: string) => (await run({ filter, box })).content.flatMap(row =>
    row.type === "search_result" ? [resolveFuseSource(row.source)!.slot] : []);
  assert.deepEqual((await matches("17")).map(f => [f.box, f.amps, f.label]), [["engine", 25, "O2 HTR"], ["cabin", 7.5, "MIR"]]);
  assert.deepEqual((await matches("p/w")).map(f => f.number), [6, 11, 16, 21, 24, 29]);
  assert.deepEqual((await matches("radio")).map(f => f.label), ["AUDIO", "AUDIO NAVI"]);
  assert.deepEqual((await matches("BLOWER", "engine")).map(f => f.number), [32, 33]);
  assert.deepEqual((await matches("Empty")).map(f => f.number), [13, 25, 30, 36]);
  assert.deepEqual((await matches("principal", "engine")).map(f => [f.number, f.amps]), [["A", null]]);
  assert.deepEqual((await matches("Fusible principal A")).map(f => f.number), ["A"]);
  assert.deepEqual(await matches("94"), []);
  assert.equal((await run({ filter: 5 })).is_error, true);
  assert.equal((await run({ filter: "1", box: "unknown" })).is_error, true);
});
