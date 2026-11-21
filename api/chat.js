import { SYSTEM_PROMPT } from "./prompt.js";

const MAX_VUELTAS = 6;
const MAX_REINTENTOS = 2;

export class ErrorProveedor extends Error {
  constructor(mensaje, codigo = "proveedor") {
    super(mensaje);
    this.codigo = codigo;
  }
}

const error = (codigo, mensaje) => ({ evento: "error", datos: { codigo, mensaje } });

async function ejecutarHerramienta(herramientas, uso) {
  const h = herramientas[uso.name];
  if (!h) {
    return { type: "tool_result", tool_use_id: uso.id, content: [{ type: "text", text: `Herramienta desconocida: ${uso.name}` }], is_error: true };
  }
  try {
    const r = await h.ejecutar(uso.input);
    const res = { type: "tool_result", tool_use_id: uso.id, content: r.content };
    if (r.is_error) res.is_error = true;
    return res;
  } catch (e) {
    return { type: "tool_result", tool_use_id: uso.id, content: [{ type: "text", text: "Error al ejecutar la herramienta." }], is_error: true };
  }
}

async function* vuelta(adaptador, args, offset) {
  for (let intento = 0; ; intento++) {
    try {
      const it = adaptador(args)[Symbol.asyncIterator]();
      let maxBloque = -1;
      for (;;) {
        const { value, done } = await it.next();
        if (done) return { message: value, bloques: maxBloque + 1 };
        if (value.datos && typeof value.datos.bloque === "number") {
          maxBloque = Math.max(maxBloque, value.datos.bloque);
          yield { ...value, datos: { ...value.datos, bloque: value.datos.bloque + offset } };
        } else {
          yield value;
        }
      }
    } catch (e) {
      if (e instanceof ErrorProveedor) throw e;
      if (intento >= MAX_REINTENTOS) throw e;
    }
  }
}

export async function* turno({ mensajes, perfil, adaptador, herramientas, system = SYSTEM_PROMPT }) {
  const historial = [...mensajes];
  const nuevos = [];
  const defs = Object.values(herramientas).map((h) => h.definicion);
  let offset = 0;

  try {
    for (let n = 0; n < MAX_VUELTAS; n++) {
      const g = vuelta(adaptador, { perfil, system, herramientas: defs, mensajes: [...historial] }, offset);
      let r;
      for (;;) {
        const { value, done } = await g.next();
        if (done) { r = value; break; }
        yield value;
      }
      offset += r.bloques;
      const { message } = r;

      if (message.stop_reason === "refusal") {
        yield error("rechazo", "No pude responder. Revisa el manual o consulta a un mecánico.");
        return;
      }

      const asistente = { role: "assistant", content: message.content };
      historial.push(asistente);
      nuevos.push(asistente);

      if (message.stop_reason === "pause_turn") continue;

      const usos = message.content.filter((b) => b.type === "tool_use");
      if (message.stop_reason === "max_tokens" && usos.length > 0) {
        yield error("interno", "La respuesta se cortó antes de terminar.");
        return;
      }
      if (message.stop_reason !== "tool_use") {
        yield { evento: "fin", datos: { mensajes: nuevos } };
        return;
      }

      const resultados = await Promise.all(usos.map((u) => ejecutarHerramienta(herramientas, u)));
      const user = { role: "user", content: resultados };
      historial.push(user);
      nuevos.push(user);
    }
    yield error("limite", "Demasiadas vueltas de herramientas en un solo turno.");
  } catch (e) {
    if (e instanceof ErrorProveedor) yield error(e.codigo, e.message);
    else yield error("interno", "Error interno.");
  }
}
