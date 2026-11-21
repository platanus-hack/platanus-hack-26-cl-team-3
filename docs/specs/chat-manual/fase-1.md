# Fase 1 — Pregunta por un fusible, respuesta citada en streaming

> Decisión (2026-11-21): la key de OpenRouter **no va en el APK**. Un servidor propio (`api/`) corre el bucle de herramientas y llama a OpenRouter; el APK es un cliente liviano.

## Done cuando

En el APK, al tocar «Preguntar al manual» en el menú y escribir «se me quedó abajo la ventana del conductor», la respuesta aparece en streaming. Nombra los fusibles de alzavidrios con su amperaje y muestra chips de cita que abren el texto citado de la tabla de fusibles. Al cerrar y abrir la app, la conversación sigue ahí.

## Contrato [CONGELADO]

> El código, los nombres y el contrato van en inglés. Los textos que ve el usuario y el system prompt van en español.

### `POST /api/chat`

Request (`application/json`, máx. 1 MB):

```jsonc
{
  "profile_id": "opus",              // opcional; si falta se usa el perfil por defecto
  "messages": [ /* conversación completa en formato Anthropic ({ role, content });
                   el último es { role: "user", content: string } */ ]
}
```

Response `200`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Cada evento va como `event: <nombre>\ndata: <JSON>\n\n`:

| Evento | `data` | Cuándo |
|---|---|---|
| `tool` | `{ "name": "lookup_fuses" }` | Al empezar cada `tool_use` |
| `text` | `{ "block": 0, "text": "Primero apaga…" }` | Cada `text_delta`. `block` cuenta los bloques de texto del turno y crece entre vueltas del bucle |
| `citation` | `{ "block": 0, "title": "...", "source": "...", "cited_text": "..." }` | Cada `citations_delta`; pertenece a ese `block` |
| `done` | `{ "messages": [ /* mensajes nuevos del turno, en orden */ ] }` | `end_turn`. Son los mensajes del asistente y los `tool_result`, **sin modificar**; el cliente los agrega a su historial |
| `error` | `{ "code": "refusal" \| "provider" \| "credit" \| "limit" \| "internal", "message": "..." }` | Termina el stream. `message` va en español: la app lo muestra tal cual |

Códigos de `error`:

- `refusal`: `stop_reason: "refusal"`.
- `provider`: error de OpenRouter.
- `credit`: HTTP 402 de OpenRouter, es decir, se acabó el crédito de la key.
- `limit`: más de 6 vueltas del bucle.
- `internal`: cualquier otro.

Errores antes del stream:

- `400 { "error": "..." }`: falta `messages`, el último no es `role: "user"`, hay más de 40 mensajes o `profile_id` no existe.
- `500 { "error": "Falta OPENROUTER_API_KEY" }`.

### `GET /api/health`

`200 { "ok": true }`. Lo usa el healthcheck del contenedor.

**Tipos:** la fuente de verdad es este archivo. El servidor los define en `api/src/chat/contract.ts` y la app en `app/src/chat/contract.ts`. La app agrega `network` (sin conexión o stream cortado) y `config` (falta `EXPO_PUBLIC_API_URL` o el servidor respondió 500).

## Servidor (`api/`, Node + TypeScript)

TypeScript que corre con `tsx`, sin paso de build. El typecheck se hace con `tsc --noEmit`. Estructura por responsabilidad:

```
api/
├── src/
│   ├── index.ts                     arranca el servidor (PORT, por defecto 8787)
│   ├── server/                      capa HTTP
│   │   ├── server.ts                rutas: GET /api/health, POST /api/chat
│   │   ├── chat-handler.ts          lee y valida el cuerpo, transmite el turno por SSE
│   │   └── responses.ts             helpers de JSON y SSE
│   ├── chat/                        el harness
│   │   ├── orchestrator.ts          bucle de herramientas (runTurn)
│   │   ├── contract.ts              tipos de eventos y mensajes
│   │   └── system-prompt.ts         system prompt (contenido en español)
│   ├── llm/                         acceso al modelo
│   │   ├── openrouter.ts            adaptador: SDK de Anthropic contra OpenRouter
│   │   ├── profiles.ts              perfiles de modelo
│   │   └── errors.ts                ProviderError (provider, credit)
│   ├── tools/                       herramientas del modelo
│   │   ├── index.ts                 registro { nombre → herramienta }
│   │   └── lookup-fuses.ts          herramienta lookup_fuses
│   └── data/
│       └── fuses.json
└── test/                            espejo de src/
```

| Pieza | Qué hace |
|---|---|
| `server/` | `node:http`. Valida el request (400/500 del contrato) y responde SSE con los eventos del orquestador. No sabe de modelos ni de herramientas concretas |
| `chat/orchestrator.ts` | Bucle manual: todas las `tool_use` de una vuelta van en **un** mensaje `user` con sus `tool_result`. Sale con `error` si hay `refusal`, `max_tokens` con `tool_use` o más de 6 vueltas. Recibe el adaptador y el registro de herramientas por parámetro |
| `llm/openrouter.ts` | SDK `@anthropic-ai/sdk` contra la «Anthropic Skin» de OpenRouter (`OPENROUTER_BASE_URL`, por defecto `https://openrouter.ai/api`; `OPENROUTER_API_KEY` como Bearer). Request mínimo: `model`, `max_tokens: 4096`, `system`, `tools` y `messages`. Un 402 se traduce a `credit` |
| `llm/profiles.ts` | `[{ id: "opus", model: "anthropic/claude-opus-5.5", isDefault: true }]`; el id de OpenRouter está **[por verificar]** |
| `tools/` | Cada herramienta exporta `{ definition, run }` y el registro las indexa por nombre. `lookup_fuses` valida el input a mano y responde con `search_result` citables, un bloque por fila con su `part_id` |
| `data/fuses.json` | **Solo** las 6 filas P/W de la caja de la cabina, marcadas como tercero y «por verificar en el auto». No agregar filas de memoria (regla 3) |
| `Dockerfile` | Node 22 slim, `npm ci --omit=dev` (`tsx` es dependencia de runtime), copia solo `src/`, `USER node`, `HEALTHCHECK` contra `/api/health` |

**Compose:** servicio `api` con `build: ./api` y `OPENROUTER_API_KEY` desde el entorno. Traefik lo enruta con `Host(${CAPO_AR_DOMAIN:-ph26.berguecio.cl}) && PathPrefix(/api)`, con el mismo entrypoint, TLS y middleware que `web`, al puerto 8787. Las labels de `web` no cambian.

## App (`app/`, Expo SDK 58 + expo-router)

| Archivo | Qué hace |
|---|---|
| `src/chat/client.ts` | `runTurn({ messages })`: `POST ${EXPO_PUBLIC_API_URL}/api/chat` con el `fetch` de `expo/fetch` (con streaming). Lee `res.body.getReader()` y emite los eventos del contrato. Sin conexión o con el stream cortado, emite `network`; con un HTTP distinto de 200, el `error` del JSON |
| `src/chat/sse.ts` | `splitEvents(buffer)`: separa los eventos completos y devuelve el resto para la próxima lectura |
| `src/chat/contract.ts` | Tipos `ChatEvent`, `ErrorCode` y `AnthropicMessage` |
| `src/chat/history.ts` | AsyncStorage (`capo-ar:chat-v1`) y `toView(messages)`, que arma las burbujas desde el formato Anthropic: ignora `tool_result` y junta los assistant consecutivos |
| `src/app/ask.tsx` | La pantalla (ruta `/ask`): barra con volver y «Nueva conversación», burbujas, chips `[n]` con un `Modal` para la cita, línea de estado, input con enviar. Mientras corre un turno, el input queda bloqueado. Con `done` guarda; con `error` muestra el mensaje y devuelve la pregunta al input |
| `src/app/index.tsx` | «Preguntar al manual» deja de estar en «Próximamente» y pasa a una tarjeta activa que abre `/ask` |

El código nuevo va en inglés. Los componentes y tokens existentes de la app (`Boton`, `Tarjeta`, `color.fondo`, …) se usan tal cual: no se renombra código ajeno en esta fase.

**Configuración:** `app/.env.local` con `EXPO_PUBLIC_API_URL=https://ph26.berguecio.cl` (no se commitea). Esta URL no es secreta, pero se inlinea al compilar: si cambia, hay que recompilar el APK. El APK release bloquea HTTP en claro, así que el servidor tiene que ir por HTTPS.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `lookup_fuses({ filter: "p/w" })` devuelve un `search_result` con 6 bloques y cada uno trae su `part_id` | api | unit |
| 2 | `lookup_fuses({ filter: "radio" })` devuelve el bloque «Sin resultados…» | api | unit |
| 3 | Con un adaptador falso (`tool_use` → `end_turn` con cita), el orquestador emite `tool`, `text`, `citation` y `done`, en ese orden | api | unit |
| 4 | Dos `tool_use` en una vuelta generan **un** mensaje `user` con dos `tool_result` | api | unit |
| 5 | `refusal` emite `error { code: "refusal" }` sin ejecutar herramientas | api | unit |
| 6 | Más de 6 vueltas emite `error { code: "limit" }` | api | unit |
| 7 | `POST /api/chat` sin `messages`, o con el último mensaje del asistente, responde 400 | api | unit |
| 8 | `splitEvents` separa los eventos completos, deja el resto para la próxima lectura e ignora JSON roto | app | unit |
| 9 | `toView()` con `tool_use`/`tool_result` en el historial muestra 2 burbujas con sus citas | app | unit |
| 10 | `npx tsc --noEmit` en `app/` sin errores | app | typecheck |

Se corren con `cd api && npm test` (más `npm run typecheck`) y `cd app && npx tsx --test src/chat/*.test.ts`, sin red.

## Verificación manual (con la key de OpenRouter)

- **Servidor local:** `cd api && OPENROUTER_API_KEY=… npm start` y `curl -N -X POST localhost:8787/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"se me quedó abajo la ventana del conductor"}]}'`. Llegan `tool`, `text`, `citation` y `done`. Si las citas no pasan por OpenRouter, avisar antes de seguir (estrategia de marcadores, `docs/diseno/chat.md` §9).
- **APK:** compilar con `EXPO_PUBLIC_API_URL` apuntando al servidor por HTTPS. El texto llega de a poco, los chips abren la cita y el historial sigue después de cerrar la app.
- **Imagen api:** `docker build ./api` y el healthcheck queda `healthy`.

## Fuera de alcance en esta fase

La ida y vuelta con la cámara y `show_in_camera` (fase 2), el selector de perfiles (fase 3), `search_manual` (fase 4), markdown, voz, reintentos y filas de fusibles que no sean P/W.
