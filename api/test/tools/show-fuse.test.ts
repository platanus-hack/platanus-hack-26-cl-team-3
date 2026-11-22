import { test } from "node:test";
import assert from "node:assert/strict";
import { showFuse } from "../../src/tools/show-fuse";
import outbackTable from "../../src/data/fuses/outback.json";
import type { FuseTable } from "../../src/tools/fuse-table";

const table: FuseTable = outbackTable;
const FUSES = table.fuses;
const { run } = showFuse(table);
const real = FUSES.find((f) => f.box === "motor" && f.amps !== null)!;
const other = FUSES.find((f) => f.box === "motor" && f.amps !== null && f.number !== real.number)!;

test("un número válido devuelve texto y evento fuse", async () => {
  const r = await run({ box: "motor", numbers: [real.number], instruction: "  Revisa este fusible.  " });
  assert.notEqual(r.is_error, true);
  assert.deepEqual(r.events, [{ event: "fuse", data: { box: "motor", numbers: [real.number], instruction: "Revisa este fusible." } }]);
  const text = (r.content[0] as { text: string }).text;
  assert.ok(text.includes(`caja de fusibles del motor, fusible ${real.number} (${real.circuit}, ${real.amps} A)`), text);
});

test("dos candidatos van en un solo evento", async () => {
  const r = await run({ box: "motor", numbers: [real.number, other.number], instruction: "x" });
  assert.deepEqual((r.events![0] as { data: { numbers: number[] } }).data.numbers, [real.number, other.number]);
});

test("la instrucción se recorta a 200 caracteres", async () => {
  const r = await run({ box: "motor", numbers: [real.number], instruction: "y".repeat(300) });
  assert.equal((r.events![0] as { data: { instruction: string } }).data.instruction.length, 200);
});

test("errores: no hay evento", async () => {
  const empty = FUSES.find((f) => f.box === "cabina" && f.amps === null);
  assert.ok(empty, "la tabla debe tener una posición vacía en la cabina");
  const inputs: unknown[] = [
    { box: "motor", numbers: [9999], instruction: "x" },
    { box: "cabina", numbers: [empty!.number], instruction: "x" },
    { box: "techo", numbers: [real.number], instruction: "x" },
    { box: "motor", numbers: [1, 2, 3, 4, 5], instruction: "x" },
    { box: "motor", numbers: [real.number, real.number], instruction: "x" },
    { box: "motor", numbers: [], instruction: "x" },
    { box: "motor", numbers: [1.5], instruction: "x" },
    { box: "motor", numbers: [real.number], instruction: "  " },
    { box: "motor", numbers: [real.number] },
    null,
  ];
  for (const input of inputs) {
    const r = await run(input);
    assert.equal(r.is_error, true, JSON.stringify(input));
    assert.equal(r.events, undefined);
  }
});

test("las cajas del enum salen de la tabla del auto", () => {
  const def = showFuse(table).definition;
  assert.deepEqual((def.input_schema.properties as any).box.enum, ["cabina", "motor"]);
  const other: FuseTable = { ...table, boxes: { frente: table.boxes.cabina }, fuses: [] };
  assert.deepEqual((showFuse(other).definition.input_schema.properties as any).box.enum, ["frente"]);
});
