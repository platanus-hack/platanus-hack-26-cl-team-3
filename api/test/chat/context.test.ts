import { test } from "node:test";
import assert from "node:assert/strict";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { contextWindow } from "../../src/chat/context";

const user = (text: string): MessageParam => ({ role: "user", content: text });
const toolUse = (id: string) => ({ type: "tool_use", id, name: "lookup_fuses", input: {} }) as const;
const thinking = { type: "thinking", thinking: "hmm", signature: "sig" } as never;
const redacted = { type: "redacted_thinking", data: "x" } as never;
const assistantTool = (id: string): MessageParam => ({ role: "assistant", content: [thinking, toolUse(id)] });
const toolResult = (id: string): MessageParam => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "r" }] });

function history(pairs: number): MessageParam[] {
  const out: MessageParam[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push(user(`q${i}`), assistantTool(`t${i}`), toolResult(`t${i}`), { role: "assistant", content: [redacted, { type: "text", text: `a${i}` }] });
  }
  out.push(user("última"));
  return out;
}

test("con 30 mensajes o menos devuelve la misma referencia, con thinking", () => {
  const h = history(7).slice(0, 30);
  assert.equal(contextWindow(h), h);
  assert.equal(contextWindow(h, 40), h);
});

test("con más de 30 empieza en un user real y no deja tool_result huérfano", () => {
  const h = history(10);
  assert.equal(h.length, 41);
  for (let max = 25; max <= 32; max++) {
    const w = contextWindow(h, max);
    assert.ok(w.length <= max);
    const first = w[0];
    assert.equal(first.role, "user");
    assert.ok(typeof first.content === "string" || first.content.some((b) => b.type !== "tool_result"));
    assert.equal(w.at(-1), h.at(-1));
  }
  const w = contextWindow(h, 30);
  assert.equal(w[0].content, "q3");
});

test("quita thinking y redacted_thinking al cortar sin mutar la entrada", () => {
  const h = history(10);
  const before = JSON.stringify(h);
  const w = contextWindow(h, 30);
  for (const m of w) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      assert.ok(m.content.every((b) => b.type !== "thinking" && b.type !== "redacted_thinking"));
      assert.ok(m.content.length > 0);
    }
  }
  assert.equal(JSON.stringify(h), before);
});

test("un assistant que solo tenía thinking queda con un texto", () => {
  const h: MessageParam[] = [user("a"), user("b"), { role: "assistant", content: [thinking] }, user("c")];
  const w = contextWindow(h, 3);
  assert.deepEqual(w[1], { role: "assistant", content: [{ type: "text", text: "…" }] });
});

test("sin user real a la vista conserva al menos el último mensaje", () => {
  const h: MessageParam[] = [user("a"), assistantTool("t1"), toolResult("t1"), assistantTool("t2"), toolResult("t2")];
  const w = contextWindow(h, 2);
  assert.deepEqual(w, [toolResult("t2")]);
});
