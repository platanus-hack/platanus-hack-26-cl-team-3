import { test } from "node:test";
import assert from "node:assert/strict";
import { turno } from "./chat.js";

const perfil = { id: "p", modelo: "m", effort: "medium" };
const toolUse = (id, filtro = "p/w") => ({ type: "tool_use", id, name: "consultar_fusibles", input: { filtro } });
const msgTool = (...usos) => ({ stop_reason: "tool_use", content: usos });
const msgFin = (content) => ({ stop_reason: "end_turn", content });

function falso(vueltas) {
  const llamadas = [];
  const adaptador = async function* (args) {
    llamadas.push(args);
    const v = typeof vueltas === "function" ? vueltas(llamadas.length) : vueltas[llamadas.length - 1];
    for (const e of v.eventos ?? []) yield e;
    return v.message;
  };
  adaptador.llamadas = llamadas;
  return adaptador;
}

function registro() {
  const ejecutadas = [];
  return {
    ejecutadas,
    consultar_fusibles: {
      definicion: { name: "consultar_fusibles" },
      ejecutar: async (input) => {
        ejecutadas.push(input);
        return { content: [{ type: "text", text: "fila" }] };
      },
    },
  };
}

async function recoger(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

const mensajes = [{ role: "user", content: "se me quedó abajo la ventana" }];

test("3: herramienta, texto, cita y fin en orden; fin.mensajes completos", async () => {
  const texto = { type: "text", text: "Apaga el contacto.", citations: [{ type: "search_result_location" }] };
  const adaptador = falso([
    { eventos: [{ evento: "herramienta", datos: { nombre: "consultar_fusibles" } }], message: msgTool(toolUse("t1")) },
    {
      eventos: [
        { evento: "texto", datos: { bloque: 0, texto: "Apaga el contacto." } },
        { evento: "cita", datos: { bloque: 0, titulo: "T", fuente: "S", texto_citado: "C" } },
      ],
      message: msgFin([texto]),
    },
  ]);
  const reg = registro();
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: reg }));
  assert.deepEqual(evs.map((e) => e.evento), ["herramienta", "texto", "cita", "fin"]);
  assert.deepEqual(evs[1].datos, { bloque: 0, texto: "Apaga el contacto." });
  assert.deepEqual(evs[2].datos, { bloque: 0, titulo: "T", fuente: "S", texto_citado: "C" });
  assert.deepEqual(reg.ejecutadas, [{ filtro: "p/w" }]);
  assert.deepEqual(evs[3].datos.mensajes, [
    { role: "assistant", content: [toolUse("t1")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "fila" }] }] },
    { role: "assistant", content: [texto] },
  ]);
  assert.equal(adaptador.llamadas[1].mensajes.length, 3);
});

test("el bloque de texto crece entre vueltas", async () => {
  const adaptador = falso([
    {
      eventos: [{ evento: "texto", datos: { bloque: 0, texto: "a" } }],
      message: { stop_reason: "tool_use", content: [{ type: "text", text: "a" }, toolUse("t1")] },
    },
    { eventos: [{ evento: "texto", datos: { bloque: 0, texto: "b" } }], message: msgFin([{ type: "text", text: "b" }]) },
  ]);
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.deepEqual(evs.filter((e) => e.evento === "texto").map((e) => e.datos.bloque), [0, 1]);
});

test("4: dos tool_use en la misma vuelta generan un solo mensaje user con dos tool_result", async () => {
  const adaptador = falso([
    { message: msgTool(toolUse("t1", "p/w"), toolUse("t2", "24")) },
    { message: msgFin([{ type: "text", text: "ok" }]) },
  ]);
  const reg = registro();
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: reg }));
  const fin = evs.at(-1);
  assert.equal(fin.evento, "fin");
  const m = fin.datos.mensajes;
  assert.equal(m.length, 3);
  assert.equal(m[1].role, "user");
  assert.deepEqual(m[1].content.map((b) => [b.type, b.tool_use_id]), [["tool_result", "t1"], ["tool_result", "t2"]]);
  assert.equal(reg.ejecutadas.length, 2);
});

test("herramienta desconocida produce tool_result con is_error", async () => {
  const adaptador = falso([
    { message: msgTool({ type: "tool_use", id: "t1", name: "nada", input: {} }) },
    { message: msgFin([{ type: "text", text: "ok" }]) },
  ]);
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.equal(evs.at(-1).datos.mensajes[1].content[0].is_error, true);
});

test("5: refusal produce error rechazo y no ejecuta herramientas", async () => {
  const adaptador = falso([{ message: { stop_reason: "refusal", content: [toolUse("t1")] } }]);
  const reg = registro();
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: reg }));
  assert.deepEqual(evs.map((e) => e.evento), ["error"]);
  assert.equal(evs[0].datos.codigo, "rechazo");
  assert.equal(reg.ejecutadas.length, 0);
});

test("max_tokens con tool_use produce error interno sin ejecutar", async () => {
  const adaptador = falso([{ message: { stop_reason: "max_tokens", content: [toolUse("t1")] } }]);
  const reg = registro();
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: reg }));
  assert.equal(evs.at(-1).datos.codigo, "interno");
  assert.equal(reg.ejecutadas.length, 0);
});

test("pause_turn repite la vuelta con el assistant agregado", async () => {
  const pausa = [{ type: "text", text: "..." }];
  const adaptador = falso([
    { message: { stop_reason: "pause_turn", content: pausa } },
    { message: msgFin([{ type: "text", text: "listo" }]) },
  ]);
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.equal(evs.at(-1).evento, "fin");
  assert.deepEqual(evs.at(-1).datos.mensajes[0], { role: "assistant", content: pausa });
});

test("6: más de 6 vueltas produce error limite", async () => {
  const adaptador = falso(() => ({ message: msgTool(toolUse("t")) }));
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.equal(evs.at(-1).evento, "error");
  assert.equal(evs.at(-1).datos.codigo, "limite");
  assert.equal(adaptador.llamadas.length, 6);
});

test("error no-API se reintenta hasta 2 veces; luego interno", async () => {
  let n = 0;
  const adaptador = async function* () {
    n++;
    throw new SyntaxError("json");
  };
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.equal(n, 3);
  assert.equal(evs.at(-1).datos.codigo, "interno");
});

test("error del proveedor termina con codigo proveedor sin reintentar", async () => {
  const { ErrorProveedor } = await import("./chat.js");
  let n = 0;
  const adaptador = async function* () {
    n++;
    throw new ErrorProveedor("503");
  };
  const evs = await recoger(turno({ mensajes, perfil, adaptador, herramientas: registro() }));
  assert.equal(n, 1);
  assert.equal(evs.at(-1).datos.codigo, "proveedor");
});
