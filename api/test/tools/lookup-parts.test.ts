import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../../src/tools";
import parts from "../../src/data/parts.json";

test("1: lookup_parts returns a search_result with 27 citable blocks ending in part: <id>", async () => {
  const { run, definition } = tools.lookup_parts;
  assert.deepEqual(definition.input_schema.properties ?? {}, {});
  const { content, is_error } = await run({});
  assert.notEqual(is_error, true);
  assert.equal(content.length, 1);
  const [sr] = content as any[];
  assert.equal(sr.type, "search_result");
  assert.equal(sr.source, "piezas://outback-2016-3.6r/vano");
  assert.equal(sr.citations.enabled, true);
  assert.equal(sr.content.length, 27);
  sr.content.forEach((b: { type: string; text: string }, i: number) => {
    assert.equal(b.type, "text");
    assert.ok(b.text.endsWith(` part: ${parts[i].id}`), b.text);
  });
  const washer = sr.content.find((b: { text: string }) => b.text.endsWith(" part: washer"));
  assert.match(washer.text, /limpiaparabrisas/);
  assert.ok(washer.text.startsWith("Sapito — "));
});

test("the description says what it returns and how part is used", () => {
  const d = tools.lookup_parts.definition.description!;
  assert.match(d, /vano del motor/);
  assert.match(d, /show_in_camera/);
});
