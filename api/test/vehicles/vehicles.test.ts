import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { createServer } from "../../src/server/server";
import type { Adapter, AdapterArgs } from "../../src/chat/orchestrator";
import { SYSTEM_PROMPT, systemPrompt } from "../../src/chat/system-prompt";
import { genericProfile, profiles, resolveVehicle } from "../../src/vehicles/registry";
import { toolsFor } from "../../src/tools";
import swiftParts from "../../src/data/parts/swift.json";

let server: Server;
let url: string;
let calls: AdapterArgs[] = [];

const spy: Adapter = async function* (args) {
  calls.push(args);
  return { stop_reason: "end_turn", content: [{ type: "text", text: "hola" }] } as Message;
};

before(async () => {
  server = createServer({ adapter: spy });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});

const send = async (extra: object) => {
  calls = [];
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hola" }], ...extra }),
  });
  await res.text();
  return res;
};

const toolNames = (a: AdapterArgs) => a.tools.map((t) => (t as { name: string }).name);

test("el prompt del Outback es idéntico byte a byte al fixture", () => {
  const expected = readFileSync(join(process.cwd(), "test/chat/fixtures/outback-prompt.txt"), "utf8");
  assert.equal(SYSTEM_PROMPT, expected);
  assert.equal(systemPrompt(profiles.outback), expected);
});

test("sin vehicle_id: prompt del Outback y las 6 tools", async () => {
  await send({});
  assert.equal(calls[0].system, SYSTEM_PROMPT);
  assert.deepEqual(toolNames(calls[0]), ["lookup_fuses", "show_fuse", "lookup_parts", "show_in_camera", "buscar_manual", "leer_manual"]);
});

test("swift: prompt del Swift sin Outback, con fusibles, piezas y cámara pero sin manual", async () => {
  await send({ vehicle_id: "swift" });
  assert.match(calls[0].system, /Suzuki Swift 2017/);
  assert.doesNotMatch(calls[0].system, /Outback|Subaru/);
  assert.deepEqual(toolNames(calls[0]), ["lookup_fuses", "show_fuse", "lookup_parts", "show_in_camera"]);
});

test("swift: lookup_parts devuelve las filas del Swift", async () => {
  const { lookup_parts } = toolsFor(profiles.swift);
  const [sr] = (await lookup_parts.run({})).content as any[];
  assert.equal(sr.source, "piezas://swift-2017-1.2/vano");
  assert.equal(sr.content.length, swiftParts.length);
  assert.ok(sr.content.every((b: { text: string }, i: number) => b.text.endsWith(` part: ${swiftParts[i].id}`)));
});

test("swift: show_in_camera acepta highlight y rechaza open y piezas del Outback", async () => {
  const { show_in_camera } = toolsFor(profiles.swift);
  const ok = await show_in_camera.run({ part: "washer", instruction: "Busca la tapa azul.", action: "highlight" });
  assert.notEqual(ok.is_error, true);
  assert.deepEqual(ok.events, [{ event: "ar", data: { part: "washer", instruction: "Busca la tapa azul.", action: "highlight" } }]);
  assert.equal((await show_in_camera.run({ part: "washer", instruction: "x", action: "open" })).is_error, true);
  assert.equal((await show_in_camera.run({ part: "washer", instruction: "x", action: "refill" })).is_error, true);
  assert.equal((await show_in_camera.run({ part: "engine_cover", instruction: "x" })).is_error, true);
  const schema = show_in_camera.definition.input_schema as unknown as { properties: { action: { enum: string[] } } };
  assert.deepEqual(schema.properties.action.enum, ["highlight", "lift"]);
});

test("auto desconocido: perfil genérico sin tools ni párrafo de cámara", async () => {
  await send({ vehicle_id: "onix" });
  assert.deepEqual(calls[0].tools, []);
  assert.match(calls[0].system, /todavía no tiene en su catálogo verificado/);
  assert.doesNotMatch(calls[0].system, /show_in_camera|Outback/);
  assert.equal(resolveVehicle("onix").id, "onix");
  assert.equal(genericProfile("x").parts.length, 0);
});

test("vehicle_id inválido responde 400", async () => {
  for (const bad of ["X!", "", "a".repeat(41), 5]) {
    const res = await send({ vehicle_id: bad });
    assert.equal(res.status, 400);
    assert.equal(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "vehicle_id inválido", "vehicle_id inválido");
  }
});

test("modo vivo usa las herramientas del auto, sin nombrar las del Outback", async () => {
  await send({ vehicle_id: "swift", mode: "vivo" });
  assert.match(calls[0].system, /salen solo de tus herramientas/);
  assert.doesNotMatch(calls[0].system, /buscar_manual/);
});

test("show_fuse solo existe en los autos con tabla de fusibles", () => {
  assert.ok(toolsFor(profiles.outback).show_fuse);
  assert.ok(toolsFor(profiles.swift).show_fuse);
  assert.equal(toolsFor(genericProfile("x")).show_fuse, undefined);
  assert.equal(toolsFor(genericProfile("x")).lookup_fuses, undefined);
  assert.doesNotMatch(systemPrompt(genericProfile("x")), /show_fuse/);
  assert.match(systemPrompt(profiles.swift), /show_fuse/);
});

test("swift: lookup_fuses y show_fuse usan la tabla del Swift", async () => {
  const { lookup_fuses, show_fuse } = toolsFor(profiles.swift);
  assert.match(lookup_fuses.definition.description!, /Suzuki Swift 2017/);
  assert.doesNotMatch(lookup_fuses.definition.description!, /Outback/);
  const [sr] = (await lookup_fuses.run({ filter: "*", box: "cabina" })).content as any[];
  assert.equal(sr.source, "fusibles://swift-2017-1.2/cabina");
  assert.match(sr.content[1].text, /part_id: fusible-cabina-\d+$/);
  const ok = await show_fuse.run({ box: "cabina", numbers: [1], instruction: "Revisa este fusible." });
  assert.notEqual(ok.is_error, true);
  assert.deepEqual(ok.events, [{ event: "fuse", data: { box: "cabina", numbers: [1], instruction: "Revisa este fusible." } }]);
  assert.match(systemPrompt(profiles.swift), /según versión/);
});
