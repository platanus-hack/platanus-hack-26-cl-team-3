import http from "node:http";
import { fileURLToPath } from "node:url";
import { turno } from "./chat.js";
import { openrouter } from "./openrouter.js";
import { herramientas } from "./herramientas.js";
import { resolverPerfil } from "./perfiles.js";

const MAX_BODY = 1024 * 1024;
const MAX_MENSAJES = 40;

const json = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY) { reject(new Error("grande")); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function validar(body) {
  if (body === null || typeof body !== "object") return { error: "Cuerpo inválido" };
  if (!Array.isArray(body.mensajes)) return { error: "Falta `mensajes` (array)" };
  if (body.mensajes.length > MAX_MENSAJES) return { error: `Máximo ${MAX_MENSAJES} mensajes` };
  const ultimo = body.mensajes.at(-1);
  if (!ultimo || ultimo.role !== "user") return { error: "El último mensaje debe ser role: user" };
  const perfil = resolverPerfil(body.perfil_id);
  if (!perfil) return { error: "perfil_id no existe" };
  return { perfil, mensajes: body.mensajes };
}

async function chat(req, res, adaptador) {
  let body;
  try {
    body = JSON.parse(await leerCuerpo(req));
  } catch {
    return json(res, 400, { error: "JSON inválido o demasiado grande" });
  }
  const v = validar(body);
  if (v.error) return json(res, 400, { error: v.error });
  if (!adaptador && !process.env.OPENROUTER_API_KEY) return json(res, 500, { error: "Falta OPENROUTER_API_KEY" });

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  });
  let cerrado = false;
  res.on("close", () => { cerrado = true; });
  try {
    for await (const e of turno({ mensajes: v.mensajes, perfil: v.perfil, adaptador: adaptador ?? openrouter, herramientas })) {
      if (cerrado) break;
      res.write(`event: ${e.evento}\ndata: ${JSON.stringify(e.datos)}\n\n`);
    }
  } catch {
    if (!cerrado) res.write(`event: error\ndata: ${JSON.stringify({ codigo: "interno", mensaje: "Error interno." })}\n\n`);
  }
  res.end();
}

export function crearServidor({ adaptador } = {}) {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    if (req.method === "GET" && pathname === "/api/salud") return json(res, 200, { ok: true });
    if (req.method === "POST" && pathname === "/api/chat") return void chat(req, res, adaptador);
    json(res, 404, { error: "No encontrado" });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PORT ?? 8787);
  crearServidor().listen(puerto, "0.0.0.0", () => console.log(`api escuchando en :${puerto}`));
}
