import { test } from "node:test";
import assert from "node:assert/strict";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { stripImages, titleFrom } from "../../src/conversations/sanitize";

const img = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } } as const;

test("stripImages reemplaza imágenes de user y no muta la entrada", () => {
  const input: MessageParam[] = [
    { role: "user", content: [img, { type: "text", text: "dónde está?" }] },
    { role: "assistant", content: [{ type: "text", text: "ahí" }] },
  ];
  const copy = structuredClone(input);
  const out = stripImages(input);
  assert.deepEqual(out[0].content, [{ type: "text", text: "[foto del vano]" }, { type: "text", text: "dónde está?" }]);
  assert.deepEqual(out[1], input[1]);
  assert.deepEqual(input, copy);
});

test("titleFrom: string, bloque text, colapsa espacios, corta a 60", () => {
  assert.equal(titleFrom([{ role: "user", content: "  hola \n  mundo " }]), "hola mundo");
  assert.equal(titleFrom([{ role: "user", content: [img, { type: "text", text: "con foto" }] }]), "con foto");
  const t = titleFrom([{ role: "user", content: "a".repeat(100) }]);
  assert.equal(t, `${"a".repeat(60)}…`);
});

test("titleFrom: null sin mensaje user o sin texto", () => {
  assert.equal(titleFrom([]), null);
  assert.equal(titleFrom([{ role: "assistant", content: "hola" }]), null);
  assert.equal(titleFrom([{ role: "user", content: [img] }]), null);
});
