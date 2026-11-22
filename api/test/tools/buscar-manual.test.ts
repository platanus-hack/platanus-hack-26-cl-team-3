import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { runTurn, type Adapter, type AdapterArgs } from "../../src/chat/orchestrator";
import { tools } from "../../src/tools";
import { forgetManual } from "../../src/manual/store";

let file = "";
before(async () => {
  file = join(await mkdtemp(join(tmpdir(), "manual-")), "outback.json");
  const parrafo = "Engine oil: pull out the level gauge and read the oil level between the marks. ".repeat(12);
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      source: { title: "Manual de prueba", edition: "EE. UU. 2015", url: "https://example.test", sha256: "0".repeat(64), thirdParty: true },
      pages: [
        { pdfPage: 1, label: "11-11", section: "Maintenance and service/Engine oil", text: `${parrafo}\n\n${parrafo}\n\n${parrafo}\n\n${parrafo}` },
        { pdfPage: 2, label: "11-12", section: "Maintenance and service/Engine oil", text: "Engine oil capacity: 3.6 L models 6.5 liters." },
        { pdfPage: 3, label: null, section: null, text: "Back cover with the fuel octane rating for the gas station reference." },
      ],
    }),
  );
  process.env.MANUAL_INDEX = file;
});
afterEach(() => {
  process.env.MANUAL_INDEX = file;
  forgetManual();
});

const buscarManual = tools.buscar_manual;
const leerManual = tools.leer_manual;
const asAny = (value: unknown) => value as any;

test("1: buscar_manual devuelve un aviso y páginas citables con su numeración impresa", async () => {
  const { content, is_error } = await buscarManual.run({ query: "engine oil level gauge" });
  assert.notEqual(is_error, true);
  const results = asAny(content);
  const paginas = results.slice(0, -1);
  const metadata = results.at(-1);
  assert.equal(metadata.type, "search_result");
  assert.match(metadata.source, /^app:\/\//);
  const aviso = metadata.content[0];
  assert.equal(aviso.type, "text");
  assert.match(aviso.text, /copia de terceros/);
  assert.match(aviso.text, /3\.6 L \(EZ36\)/);
  assert.ok(paginas.length >= 2);
  for (const sr of paginas) {
    assert.equal(sr.type, "search_result");
    assert.equal(sr.citations.enabled, true);
    assert.ok(sr.content.every((b: { text: string }) => b.text !== aviso.text));
    assert.match(sr.source, /^manual:\/\/subaru-outback-2016-us\//);
    assert.match(sr.title, /Manual de prueba — (p\. 11-1[12]|hoja PDF 3)/);
    assert.ok(sr.content.every((b: { type: string; text: string }) => b.type === "text" && b.text.length > 0));
  }
  assert.equal(paginas[0].source, "manual://subaru-outback-2016-us/11-11");
});

test("2: una página larga se corta con el aviso de leer_manual; una corta va entera", async () => {
  const [largo, corto] = asAny((await buscarManual.run({ query: "engine oil" })).content);
  const bloquesLargo = largo.content.map((b: { text: string }) => b.text);
  assert.match(bloquesLargo.at(-1), /leer_manual/);
  assert.ok(bloquesLargo.join("").length < 3200);
  assert.ok(!corto.content.some((b: { text: string }) => /leer_manual/.test(b.text)));
});

test("3: buscar_manual en español, sin resultados y con límite", async () => {
  const es = asAny((await buscarManual.run({ query: "capacidad de aceite del motor" })).content);
  assert.equal(es[0].type, "search_result");
  assert.equal(es[0].source, "manual://subaru-outback-2016-us/11-12");
  const nada = await buscarManual.run({ query: "zzzzqqq" });
  assert.notEqual(nada.is_error, true);
  assert.match(asAny(nada.content)[0].text, /No encontré/);
  assert.equal(asAny((await buscarManual.run({ query: "engine oil", limit: 1 })).content).length, 2);
});

test("4: valida la entrada", async () => {
  for (const input of [undefined, {}, { query: "" }, { query: 5 }, { query: "x".repeat(201) }, { query: "oil", limit: 0 }, { query: "oil", limit: 9 }, { query: "oil", limit: 1.5 }]) {
    const out = await buscarManual.run(input);
    assert.equal(out.is_error, true, JSON.stringify(input));
  }
});

test("5: sin el índice cargado el error le dice al modelo que no puede consultar el manual", async () => {
  process.env.MANUAL_INDEX = join(tmpdir(), "no-existe-manual.json");
  for (const run of [() => buscarManual.run({ query: "oil" }), () => leerManual.run({ page: "11-11" })]) {
    const out = await run();
    assert.equal(out.is_error, true);
    assert.match(asAny(out.content)[0].text, /no está cargado/);
  }
});

test("6: leer_manual lee desde una página y las siguientes, por numeración o por hoja", async () => {
  const dos = asAny((await leerManual.run({ page: "11-11", count: 2 })).content);
  assert.deepEqual(dos.slice(0, -1).map((sr: { source: string }) => sr.source), ["manual://subaru-outback-2016-us/11-11", "manual://subaru-outback-2016-us/11-12"]);
  const hoja = asAny((await leerManual.run({ page: "pdf:3" })).content);
  assert.equal(hoja[0].source, "manual://subaru-outback-2016-us/pdf-3");
  assert.match(hoja[0].title, /hoja PDF 3/);
  const sinCorte = asAny((await leerManual.run({ page: "11-11" })).content)[0].content;
  assert.ok(!sinCorte.some((b: { text: string }) => /leer_manual/.test(b.text)));
});

test("7: leer_manual avisa si la página no existe y valida la entrada", async () => {
  const out = await leerManual.run({ page: "99-1" });
  assert.notEqual(out.is_error, true);
  assert.match(asAny(out.content)[0].text, /No existe la página/);
  for (const input of [{}, { page: "" }, { page: 11 }, { page: "11-11", count: 4 }, { page: "11-11", count: 0 }]) {
    assert.equal((await leerManual.run(input)).is_error, true, JSON.stringify(input));
  }
});

test("8: las descripciones cuentan el idioma, el motor y que hay que citar", () => {
  const b = buscarManual.definition;
  assert.equal(b.name, "buscar_manual");
  assert.match(b.description!, /en inglés/);
  assert.match(b.description!, /3\.6 L/);
  assert.deepEqual(b.input_schema.required, ["query"]);
  assert.deepEqual(leerManual.definition.input_schema.required, ["page"]);
});

test("9: el orquestador le entrega al modelo las páginas del manual como resultado de la herramienta", async () => {
  const use = { type: "tool_use", id: "t1", name: "buscar_manual", input: { query: "engine oil level gauge" } } as ToolUseBlock;
  const calls: AdapterArgs[] = [];
  const adapter: Adapter = async function* (args) {
    calls.push(args);
    return (calls.length === 1
      ? { stop_reason: "tool_use", content: [use] }
      : { stop_reason: "end_turn", content: [{ type: "text", text: "Mira la página 11-11 del manual." }] }) as Message;
  };
  const messages: MessageParam[] = [{ role: "user", content: "¿cómo reviso el aceite?" }];
  const events = [];
  for await (const e of runTurn({ messages, profile: { id: "p", model: "m", effort: "medium" }, adapter, tools })) events.push(e);
  assert.equal(events.at(-1)!.event, "done");
  const result = (calls[1].messages.at(-1) as { content: { type: string; is_error?: boolean; content: { type: string; source?: string }[] }[] }).content[0];
  assert.equal(result.type, "tool_result");
  assert.notEqual(result.is_error, true);
  assert.ok(result.content.length > 0);
  assert.ok(result.content.every((b) => b.type === "search_result"));
  assert.equal(result.content[0].source, "manual://subaru-outback-2016-us/11-11");
});

test("reopening legacy manual results nests their notice without changing stored messages or page offsets", async () => {
  const notice = { type: "text", text: "Edition notice" } as const;
  const page = { type: "search_result", title: "Page 1", source: "manual://subaru-outback-2016-us/1",
    content: [{ type: "text" as const, text: "Original paragraph" }], citations: { enabled: true } } as const;
  const sourcePage = { ...page, content: [...page.content] };
  const secondPage = { ...sourcePage, source: "manual://subaru-outback-2016-us/2" };
  const result = { type: "tool_result" as const, tool_use_id: "t1", content: [notice, sourcePage, secondPage] };
  const messages: MessageParam[] = [
    { role: "user", content: "Find oil" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "buscar_manual", input: { query: "oil" } }] },
    { role: "user", content: [result] },
    { role: "assistant", content: "See page 1." }, { role: "user", content: "Continue" },
  ];
  const saved = structuredClone(messages);
  let replayed: MessageParam | undefined;
  const adapter: Adapter = async function* (args) {
    replayed = args.messages[2];
    return { stop_reason: "end_turn", content: [] } as unknown as Message;
  };
  for await (const event of runTurn({ messages, profile: { id: "p", model: "m" }, adapter, tools })) {
    assert.equal(event.event, "done");
  }
  const [sent] = asAny(replayed?.content);
  assert.equal(sent.tool_use_id, result.tool_use_id);
  assert.deepEqual(sent.content.slice(0, -1), [sourcePage, secondPage]);
  assert.equal(sent.content.at(-1).type, "search_result");
  assert.match(sent.content.at(-1).source, /^app:\/\//);
  assert.deepEqual(sent.content.at(-1).content, [notice]);
  assert.deepEqual(messages, saved);
});
