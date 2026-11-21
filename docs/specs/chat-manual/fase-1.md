# Fase 1 — Pregunta por un fusible, respuesta citada en streaming

> Decisión (2026-11-21): la key de OpenRouter **no va en el APK**. Un servidor propio (`api/`) corre el bucle de herramientas y llama a OpenRouter; el APK es un cliente liviano.

## Done cuando

En el APK, al tocar «Preguntar al manual» en el menú y escribir «se me quedó abajo la ventana del conductor», la respuesta aparece en streaming. Nombra los fusibles de alzavidrios con su amperaje y muestra chips de cita que abren el texto citado de la tabla de fusibles. Al cerrar y abrir la app, la conversación sigue ahí.

## Contrato [CONGELADO]

### `POST /api/chat`

Request (`application/json`, máx. 1 MB):

```jsonc
{
  "perfil_id": "opus",               // opcional; si falta se usa el perfil por defecto
  "mensajes": [ /* conversación completa en formato Anthropic ({ role, content });
                   el último es { role: "user", content: string } */ ]
}
```

Response `200`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Cada evento va como `event: <nombre>\ndata: <JSON>\n\n`:

| Evento | `data` | Cuándo |
|---|---|---|
| `herramienta` | `{ "nombre": "consultar_fusibles" }` | Al empezar cada `tool_use` |
| `texto` | `{ "bloque": 0, "texto": "Primero apaga…" }` | Cada `text_delta`. `bloque` cuenta los bloques de texto del turno y crece entre vueltas del bucle |
| `cita` | `{ "bloque": 0, "titulo": "...", "fuente": "...", "texto_citado": "..." }` | Cada `citations_delta`; pertenece a ese `bloque` |
| `fin` | `{ "mensajes": [ /* mensajes nuevos del turno, en orden */ ] }` | `end_turn`. Son los mensajes del asistente y los `tool_result`, **sin modificar**; el cliente los agrega a su historial |
| `error` | `{ "codigo": "rechazo" \| "proveedor" \| "credito" \| "limite" \| "interno", "mensaje": "..." }` | Termina el stream |

Códigos de `error`:

- `rechazo`: `stop_reason: "refusal"`.
- `proveedor`: error de OpenRouter.
- `credito`: HTTP 402 de OpenRouter, es decir, se acabó el crédito de la key.
- `limite`: más de 6 vueltas del bucle.
- `interno`: cualquier otro.

Errores antes del stream:

- `400 { "error": "..." }`: falta `mensajes`, el último no es `role: "user"`, hay más de 40 mensajes o `perfil_id` no existe.
- `500 { "error": "Falta OPENROUTER_API_KEY" }`.

### `GET /api/salud`

`200 { "ok": true }`. Lo usa el healthcheck del contenedor.

**Tipos:** la fuente de verdad es este archivo. La app los tiene en `app/src/chat/contrato.ts`; ahí agrega el código `red` (sin conexión o stream cortado) y `config` (falta `EXPO_PUBLIC_API_URL` o el servidor respondió 500).

## Servidor (`api/`, Node, JavaScript ESM)

| Archivo | Qué hace |
|---|---|
| `server.js` | `node:http`: `GET /api/salud` y `POST /api/chat`. Valida y responde SSE con los eventos del orquestador |
| `chat.js` | Orquestador: bucle manual de herramientas. Todas las `tool_use` de una vuelta van en **un** mensaje `user` con sus `tool_result`. Sale con `error` si hay `refusal`, `max_tokens` con `tool_use` o más de 6 vueltas |
| `openrouter.js` | Adaptador: SDK `@anthropic-ai/sdk` contra la «Anthropic Skin» de OpenRouter (`OPENROUTER_BASE_URL`, por defecto `https://openrouter.ai/api`; `OPENROUTER_API_KEY` como Bearer). Request mínimo: `model`, `max_tokens: 4096`, `system`, `tools` y `messages`. Sin `fallbacks`, `cache_control`, `strict` ni `eager_input_streaming`. Un 402 se traduce a `credito` |
| `herramientas.js` | Registro `{ consultar_fusibles: { definicion, ejecutar } }`. Valida el input a mano. Responde con `search_result` y `citations: { enabled: true }`, un bloque por fila con su `pieza_id`. Sin coincidencias, un bloque «Sin resultados en la tabla de fusibles.» |
| `perfiles.js` | `[{ id: "opus", modelo: "anthropic/claude-opus-5.5", por_defecto: true }]`. El id de OpenRouter está **[por verificar]** |
| `prompt.js` | System prompt fijo |
| `data/fusibles.json` | **Solo** las 6 filas P/W de la caja de la cabina, marcadas como tercero y «por verificar en el auto». No agregar filas de memoria (regla 3) |
| `Dockerfile` | Node 22 slim, `npm ci --omit=dev`, `USER node`, `HEALTHCHECK` contra `/api/salud` |

**Compose:** servicio `api` con `build: ./api` y `OPENROUTER_API_KEY` desde el entorno. Traefik lo enruta con `Host(${CAPO_AR_DOMAIN:-ph26.berguecio.cl}) && PathPrefix(/api)`, con el mismo entrypoint, TLS y middleware que `web`, al puerto 8787. Las labels de `web` no cambian.

## App (`app/`, Expo SDK 58 + expo-router)

| Archivo | Qué hace |
|---|---|
| `src/chat/api.ts` | `turno({ mensajes })`: `POST ${EXPO_PUBLIC_API_URL}/api/chat` con el `fetch` de `expo/fetch` (con streaming). Lee `res.body.getReader()` y emite los eventos del contrato. Sin conexión o con el stream cortado, emite `red`; con un HTTP distinto de 200, el `error` del JSON |
| `src/chat/sse.ts` | `separarEventos(buffer)`: separa los eventos completos y devuelve el resto para la próxima lectura |
| `src/chat/contrato.ts` | Tipos `Evento`, `CodigoError` y `MensajeAnthropic` |
| `src/chat/historial.ts` | AsyncStorage (`capo-ar:chat-v1`) y `aVista(mensajes)`, que arma las burbujas desde el formato Anthropic: ignora `tool_result` y junta los assistant consecutivos |
| `src/app/preguntar.tsx` | La pantalla: barra con volver y «Nueva conversación», burbujas, chips `[n]` con un `Modal` para la cita, línea de estado, input con enviar. Mientras corre un turno, el input queda bloqueado. Con `fin` guarda; con `error` muestra el mensaje y devuelve la pregunta al input |
| `src/app/index.tsx` | «Preguntar al manual» deja de estar en «Próximamente» y pasa a una tarjeta activa |

**Configuración:** `app/.env.local` con `EXPO_PUBLIC_API_URL=https://ph26.berguecio.cl` (no se commitea). Esta URL no es secreta, pero se inlinea al compilar: si cambia, hay que recompilar el APK. El APK release bloquea HTTP en claro, así que el servidor tiene que ir por HTTPS.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `consultar_fusibles({ filtro: "p/w" })` devuelve un `search_result` con 6 bloques y cada uno trae su `pieza_id` | api | unit |
| 2 | `consultar_fusibles({ filtro: "radio" })` devuelve el bloque «Sin resultados…» | api | unit |
| 3 | Con un adaptador falso (`tool_use` → `end_turn` con cita), el orquestador emite `herramienta`, `texto`, `cita` y `fin`, en ese orden | api | unit |
| 4 | Dos `tool_use` en una vuelta generan **un** mensaje `user` con dos `tool_result` | api | unit |
| 5 | `refusal` emite `error { codigo: "rechazo" }` sin ejecutar herramientas | api | unit |
| 6 | Más de 6 vueltas emite `error { codigo: "limite" }` | api | unit |
| 7 | `POST /api/chat` sin `mensajes`, o con el último mensaje del asistente, responde 400 | api | unit |
| 8 | `separarEventos` separa los eventos completos, deja el resto para la próxima lectura e ignora JSON roto | app | unit |
| 9 | `aVista()` con `tool_use`/`tool_result` en el historial muestra 2 burbujas con sus citas | app | unit |
| 10 | `npx tsc --noEmit` en `app/` sin errores | app | typecheck |

Se corren con `cd api && npm test` y `cd app && npx tsx --test src/chat/*.test.ts`, sin red.

## Verificación manual (con la key de OpenRouter)

- **Servidor local:** `OPENROUTER_API_KEY=… node api/server.js` y `curl -N -X POST localhost:8787/api/chat -H 'content-type: application/json' -d '{"mensajes":[{"role":"user","content":"se me quedó abajo la ventana del conductor"}]}'`. Llegan `herramienta`, `texto`, `cita` y `fin`. Si las citas no pasan por OpenRouter, avisar antes de seguir (estrategia de marcadores, `docs/diseno/chat.md` §9).
- **APK:** compilar con `EXPO_PUBLIC_API_URL` apuntando al servidor por HTTPS. El texto llega de a poco, los chips abren la cita y el historial sigue después de cerrar la app.
- **Imagen api:** `docker build ./api` y el healthcheck queda `healthy`.

## Fuera de alcance en esta fase

La ida y vuelta con la cámara y `mostrar_en_ar` (fase 2), el selector de perfiles (fase 3), `buscar_manual` (fase 4), markdown, voz, reintentos y filas de fusibles que no sean P/W.
