import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock, Message, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { runTurn } from "../../src/chat/orchestrator";
import type { Adapter, AdapterArgs } from "../../src/chat/orchestrator";
import type { ChatEvent, Profile } from "../../src/chat/contract";
import { tools as realTools, type Tool, type ToolRegistry } from "../../src/tools";
import { ProviderError } from "../../src/llm/errors";

type Round = { events?: ChatEvent[]; message: Pick<Message, "stop_reason" | "content"> };

const profile: Profile = { id: "p", model: "m", effort: "medium" };
const toolUse = (id: string, filter = "p/w"): ToolUseBlock => ({ type: "tool_use", id, name: "lookup_fuses", input: { filter } }) as ToolUseBlock;
const toolMsg = (...uses: ContentBlock[]): Round["message"] => ({ stop_reason: "tool_use", content: uses });
const endMsg = (content: ContentBlock[]): Round["message"] => ({ stop_reason: "end_turn", content });

function fake(rounds: Round[] | ((call: number) => Round)) {
  const calls: AdapterArgs[] = [];
  const adapter: Adapter = async function* (args) {
    calls.push(args);
    const round = typeof rounds === "function" ? rounds(calls.length) : rounds[calls.length - 1];
    for (const e of round.events ?? []) yield e;
    return round.message as Message;
  };
  return { adapter, calls };
}

function registry() {
  const executed: unknown[] = [];
  const lookup: Tool = {
    definition: { name: "lookup_fuses", input_schema: { type: "object" } },
    run: async (input) => {
      executed.push(input);
      return { content: [{ type: "text", text: "row" }] };
    },
  };
  const tools: ToolRegistry = { lookup_fuses: lookup };
  return { executed, tools };
}

async function collect(gen: AsyncGenerator<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const messages: MessageParam[] = [{ role: "user", content: "se me quedó abajo la ventana" }];

test("3: tool, text, citation and done in order; done.messages complete", async () => {
  const text = { type: "text", text: "Apaga el contacto.", citations: [{ type: "search_result_location" }] } as unknown as ContentBlock;
  const { adapter, calls } = fake([
    { events: [{ event: "tool", data: { name: "lookup_fuses" } }], message: toolMsg(toolUse("t1")) },
    {
      events: [
        { event: "text", data: { block: 0, text: "Apaga el contacto." } },
        { event: "citation", data: { block: 0, title: "T", source: "S", cited_text: "C" } },
      ],
      message: endMsg([text]),
    },
  ]);
  const reg = registry();
  const events = await collect(runTurn({ messages, profile, adapter, tools: reg.tools }));
  assert.deepEqual(events.map((e) => e.event), ["tool", "text", "citation", "done"]);
  assert.deepEqual(events[1].data, { block: 0, text: "Apaga el contacto." });
  assert.deepEqual(events[2].data, { block: 0, title: "T", source: "S", cited_text: "C" });
  assert.deepEqual(reg.executed, [{ filter: "p/w" }]);
  assert.deepEqual((events[3].data as { messages: MessageParam[] }).messages, [
    { role: "assistant", content: [toolUse("t1")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "row" }] }] },
    { role: "assistant", content: [text] },
  ]);
  assert.equal(calls[1].messages.length, 3);
});

test("the text block index grows across rounds", async () => {
  const { adapter } = fake([
    {
      events: [{ event: "text", data: { block: 0, text: "a" } }],
      message: toolMsg({ type: "text", text: "a" } as ContentBlock, toolUse("t1")),
    },
    { events: [{ event: "text", data: { block: 0, text: "b" } }], message: endMsg([{ type: "text", text: "b" } as ContentBlock]) },
  ]);
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  const blocks = events.flatMap((e) => (e.event === "text" ? [e.data.block] : []));
  assert.deepEqual(blocks, [0, 1]);
});

test("4: two tool_use in one round produce a single user message with two tool_result", async () => {
  const { adapter } = fake([
    { message: toolMsg(toolUse("t1", "p/w"), toolUse("t2", "24")) },
    { message: endMsg([{ type: "text", text: "ok" } as ContentBlock]) },
  ]);
  const reg = registry();
  const events = await collect(runTurn({ messages, profile, adapter, tools: reg.tools }));
  const done = events.at(-1)!;
  assert.equal(done.event, "done");
  const m = (done.data as { messages: { role: string; content: { type: string; tool_use_id: string }[] }[] }).messages;
  assert.equal(m.length, 3);
  assert.equal(m[1].role, "user");
  assert.deepEqual(m[1].content.map((b) => [b.type, b.tool_use_id]), [["tool_result", "t1"], ["tool_result", "t2"]]);
  assert.equal(reg.executed.length, 2);
});

test("4: tool events are emitted after the round tools, in tool order, before the next round text", async () => {
  const ar = (part: string): ChatEvent => ({ event: "ar", data: { part, instruction: "i" } });
  const emitting = (name: string, events: ChatEvent[]): Tool => ({
    definition: { name, input_schema: { type: "object" } },
    run: async () => ({ content: [{ type: "text", text: "ok" }], events }),
  });
  const tools: ToolRegistry = {
    first: emitting("first", [ar("washer")]),
    second: emitting("second", [ar("battery"), ar("positive")]),
    quiet: emitting("quiet", []),
  };
  const use = (id: string, name: string) => ({ type: "tool_use", id, name, input: {} }) as ToolUseBlock;
  const { adapter } = fake([
    {
      events: [{ event: "tool", data: { name: "first" } }],
      message: toolMsg(use("t1", "first"), use("t2", "quiet"), use("t3", "second")),
    },
    { events: [{ event: "text", data: { block: 0, text: "Listo." } }], message: endMsg([{ type: "text", text: "Listo." } as ContentBlock]) },
  ]);
  const events = await collect(runTurn({ messages, profile, adapter, tools }));
  assert.deepEqual(events.map((e) => e.event), ["tool", "ar", "ar", "ar", "text", "done"]);
  assert.deepEqual(
    events.flatMap((e) => (e.event === "ar" ? [e.data.part] : [])),
    ["washer", "battery", "positive"],
  );
  const m = (events.at(-1)!.data as unknown as { messages: { content: Record<string, unknown>[] }[] }).messages;
  assert.deepEqual(Object.keys(m[1].content[0]).sort(), ["content", "tool_use_id", "type"]);
});

test("several show_in_camera calls in one turn come out as ar events in call order", async () => {
  const show = (id: string, input: Record<string, string>) => ({ type: "tool_use", id, name: "show_in_camera", input }) as ToolUseBlock;
  const { adapter } = fake([
    {
      message: toolMsg(
        show("s1", { part: "washer", instruction: "Revisa el nivel del sapito.", action: "refill" }),
        show("s2", { part: "fuses", instruction: "Abre la caja de fusibles.", action: "lift" }),
      ),
    },
    { message: toolMsg(show("s3", { part: "battery", instruction: "Mira los bornes de la batería." })) },
    { events: [{ event: "text", data: { block: 0, text: "Sigue los pasos." } }], message: endMsg([{ type: "text", text: "Sigue los pasos." } as ContentBlock]) },
  ]);
  const events = await collect(runTurn({ messages, profile, adapter, tools: realTools }));
  assert.deepEqual(events.map((e) => e.event), ["ar", "ar", "ar", "text", "done"]);
  assert.deepEqual(
    events.flatMap((e) => (e.event === "ar" ? [e.data] : [])),
    [
      { part: "washer", instruction: "Revisa el nivel del sapito.", action: "refill" },
      { part: "fuses", instruction: "Abre la caja de fusibles.", action: "lift" },
      { part: "battery", instruction: "Mira los bornes de la batería." },
    ],
  );
});

test("unknown tool produces a tool_result with is_error", async () => {
  const { adapter } = fake([
    { message: toolMsg({ type: "tool_use", id: "t1", name: "nothing", input: {} } as ToolUseBlock) },
    { message: endMsg([{ type: "text", text: "ok" } as ContentBlock]) },
  ]);
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  const m = (events.at(-1)!.data as { messages: { content: { is_error?: boolean }[] }[] }).messages;
  assert.equal(m[1].content[0].is_error, true);
});

test("5: refusal produces error refusal and runs no tools", async () => {
  const { adapter } = fake([{ message: { stop_reason: "refusal", content: [toolUse("t1")] } }]);
  const reg = registry();
  const events = await collect(runTurn({ messages, profile, adapter, tools: reg.tools }));
  assert.deepEqual(events.map((e) => e.event), ["error"]);
  assert.equal((events[0].data as { code: string }).code, "refusal");
  assert.equal(reg.executed.length, 0);
});

test("max_tokens with tool_use produces error internal without running tools", async () => {
  const { adapter } = fake([{ message: { stop_reason: "max_tokens", content: [toolUse("t1")] } }]);
  const reg = registry();
  const events = await collect(runTurn({ messages, profile, adapter, tools: reg.tools }));
  assert.equal((events.at(-1)!.data as { code: string }).code, "internal");
  assert.equal(reg.executed.length, 0);
});

test("pause_turn repeats the round with the assistant message appended", async () => {
  const paused = [{ type: "text", text: "..." }] as ContentBlock[];
  const { adapter } = fake([
    { message: { stop_reason: "pause_turn", content: paused } },
    { message: endMsg([{ type: "text", text: "listo" } as ContentBlock]) },
  ]);
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  assert.equal(events.at(-1)!.event, "done");
  assert.deepEqual((events.at(-1)!.data as { messages: unknown[] }).messages[0], { role: "assistant", content: paused });
});

test("6: more than 6 rounds produces error limit", async () => {
  const { adapter, calls } = fake(() => ({ message: toolMsg(toolUse("t")) }));
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  assert.equal(events.at(-1)!.event, "error");
  assert.equal((events.at(-1)!.data as { code: string }).code, "limit");
  assert.equal(calls.length, 6);
});

test("an adapter that emits text and then throws ends with a single error and no duplicated text", async () => {
  let n = 0;
  const adapter: Adapter = async function* () {
    n++;
    yield { event: "text", data: { block: 0, text: "parcial" } };
    throw new SyntaxError("json");
  };
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  assert.equal(n, 1);
  assert.deepEqual(events.map((e) => e.event), ["text", "error"]);
  assert.equal((events[1].data as { code: string }).code, "internal");
});

test("aborting the signal before the second round does not call the adapter again", async () => {
  const controller = new AbortController();
  let n = 0;
  const adapter: Adapter = async function* () {
    n++;
    controller.abort();
    return toolMsg(toolUse("t1")) as Message;
  };
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools, signal: controller.signal }));
  assert.equal(n, 1);
  assert.equal(events.some((e) => e.event === "done"), false);
});

test("max_tokens without tool_use ends with done truncated", async () => {
  const { adapter } = fake([{ message: { stop_reason: "max_tokens", content: [{ type: "text", text: "a" } as ContentBlock] } }]);
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  assert.equal(events.at(-1)!.event, "done");
  assert.equal((events.at(-1)!.data as { truncated?: boolean }).truncated, true);
});

test("end_turn and stop_sequence ends with done without truncated", async () => {
  for (const stop_reason of ["end_turn", "stop_sequence"] as const) {
    const { adapter } = fake([{ message: { stop_reason, content: [{ type: "text", text: "a" } as ContentBlock] } }]);
    const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
    assert.equal(events.at(-1)!.event, "done");
    assert.equal("truncated" in events.at(-1)!.data, false);
  }
});

test("a provider error ends with code provider without retrying", async () => {
  let n = 0;
  const adapter: Adapter = async function* () {
    n++;
    throw new ProviderError("503");
  };
  const events = await collect(runTurn({ messages, profile, adapter, tools: registry().tools }));
  assert.equal(n, 1);
  assert.equal((events.at(-1)!.data as { code: string }).code, "provider");
});
