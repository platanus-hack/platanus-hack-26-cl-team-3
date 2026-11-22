import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../../src/tools";
import parts from "../../src/data/parts/outback.json";
import swiftParts from "../../src/data/parts/swift.json";

const { run, definition } = tools.show_in_camera;

test("2: a valid call returns text and an ar event", async () => {
  const instruction = "Busca la tapa amarilla junto a la batería.";
  const r = await run({ part: "washer", instruction });
  assert.notEqual(r.is_error, true);
  assert.deepEqual(r.content, [{ type: "text", text: "Paso agregado a la guía de cámara: Sapito. No lo menciones en tu respuesta; el texto tiene que entenderse solo." }]);
  assert.deepEqual(r.events, [{ event: "ar", data: { part: "washer", instruction } }]);
});

test("3: an unknown part or a missing instruction returns is_error and no events", async () => {
  const inputs = [
    { part: "wheel", instruction: "x" },
    { part: "washer" },
    { part: "washer", instruction: "   " },
    { part: "washer", instruction: 5 },
    { instruction: "x" },
    null,
    "washer",
  ];
  for (const input of inputs) {
    const r = await run(input);
    assert.equal(r.is_error, true, JSON.stringify(input));
    assert.equal(r.events, undefined);
    assert.equal((r.content as { type: string }[])[0].type, "text");
  }
});

test("5: the part enum equals the ids in parts.json", () => {
  const schema = definition.input_schema as unknown as { properties: { part: { type: string; enum: string[] }; instruction: { type: string } }; required: string[]; additionalProperties: boolean };
  assert.deepEqual(schema.properties.part.enum, parts.map((p) => p.id));
  assert.equal(schema.properties.part.type, "string");
  assert.equal(schema.properties.instruction.type, "string");
  assert.deepEqual([...schema.required].sort(), ["instruction", "part"]);
  assert.equal(schema.additionalProperties, false);
});

test("the instruction is trimmed and cut to 200 characters", async () => {
  const r = await run({ part: "battery", instruction: `  ${"a".repeat(300)}  ` });
  assert.deepEqual(r.events, [{ event: "ar", data: { part: "battery", instruction: "a".repeat(200) } }]);
});

test("every catalog part supports inspection and only the washer supports refill", async () => {
  for (const { id } of parts) {
    for (const action of ["highlight", "lift", "refill"]) {
      const input = { part: id, instruction: "Inspect this part.", action };
      const result = await run(input);
      if (action === "refill" && id !== "washer") assert.equal(result.is_error, true);
      else assert.deepEqual(result.events, [{ event: "ar", data: input }]);
    }
  }
});

test("opening actions are accepted only on mapped service components", async () => {
  const supported = ["washer", "fuses", "dipstick", "oil_cap", "positive", "brake_cap", "brake_fluid"];
  for (const { id } of parts) {
    const input = { part: id, instruction: "Inspect the opening.", action: "open" };
    const result = await run(input);
    if (supported.includes(id)) assert.deepEqual(result.events, [{ event: "ar", data: input }]);
    else assert.equal(result.is_error, true);
  }
});

test("the Outback camera exposes its 27 components and rejects parts exclusive to other vehicles", async () => {
  assert.equal(parts.length, 27);
  const outbackIds = new Set(parts.map((p) => p.id));
  const ram700Only = ["battery_terminal", "terminal_boot", "valve_cover", "wiring_harness", "steering_fluid", "steering_cap"];
  for (const id of [...swiftParts.map((p) => p.id).filter((id) => !outbackIds.has(id)), ...ram700Only]) {
    const response = await run({ part: id, instruction: "Locate this part." });
    assert.equal(response.is_error, true, id);
    assert.equal(response.events, undefined, id);
  }
});
