# Fase 2 — El chat abre la cámara en la pieza (fase D del plan)

> Decisiones (2026-11-21): el chat conoce las 9 piezas del vano del Outback con una herramienta nueva, `lookup_parts`. El caso de ejemplo es «no sale agua del limpiaparabrisas» → sapito.

## Done cuando

En el APK, al escribir «no sale agua del limpiaparabrisas», la respuesta cita la ficha del sapito y muestra una tarjeta «Abrir cámara: Sapito». Al tocarla se abre el escáner del Outback con el sapito ya elegido, la instrucción del paso arriba y un botón «Volver al chat». Al volver, el chat ofrece «Listo, ¿qué sigue?» y «No lo encuentro», y la conversación sigue. Al cerrar y abrir la app, la tarjeta sigue en el historial.

## Contrato [CONGELADO]

Todo es aditivo sobre [`fase-1.md`](fase-1.md): `POST /api/chat` no cambia su request ni sus eventos actuales.

### Evento SSE nuevo: `ar`

| Evento | `data` | Cuándo |
|---|---|---|
| `ar` | `{ "part": "washer", "instruction": "Busca la tapa amarilla junto a la batería." }` | Una vez por cada `show_in_camera` válida, después de su evento `tool` y antes del texto de la vuelta siguiente |

`part` es un `PartId`: `fuses`, `washer`, `dipstick`, `coolant`, `air_filter`, `oil_cap`, `brake_fluid`, `battery` o `positive`. `instruction` es una frase en español, de 200 caracteres como máximo.

### Herramientas nuevas (las ve el modelo, no el cliente)

- `lookup_parts`, sin parámetros (`{}`). Devuelve un `search_result` con `source: "piezas://outback-2016-3.6r/vano"`, `citations: { enabled: true }` y un bloque de texto por pieza: `<nombre> — <detalle> part: <id>`.
- `show_in_camera({ part, instruction })`. `part` es un `enum` con los 9 ids; los dos campos son obligatorios. Responde con un texto («Tarjeta mostrada: Abrir cámara en <nombre>.») y emite el evento `ar`. Con un `part` desconocido o sin `instruction` responde `is_error: true` y no emite nada.

### Historial

`done.messages` no cambia: la llamada queda como un bloque `tool_use` con `name: "show_in_camera"` e `input: { part, instruction }`. La app reconstruye la tarjeta desde ese bloque, así que no se guarda nada aparte.

### Ruta de la cámara

`/escanear?vehicleId=outback&part=<PartId>&instruction=<texto>`. `part` e `instruction` son opcionales: sin ellos, el escáner se comporta como hoy.

**Tipos:** el servidor agrega `ar` a `ChatEvent` en `api/src/chat/contract.ts`; la app agrega `{ type: 'ar'; part: string; instruction: string }` en `app/src/chat/contract.ts`.

## Servidor (`api/`)

| Archivo | Cambio |
|---|---|
| `src/data/parts.json` (nuevo) | Las 9 piezas del Outback: `{ id, name, detail, source }`. `name` y `detail` se copian tal cual de `parts` y `partDetails.outback` en `app/src/engine-maps/catalog.ts`. `source`: `"catalog.ts del Outback (páginas del manual por verificar)"` |
| `src/tools/lookup-parts.ts` (nuevo) | Mismo patrón que `lookup-fuses.ts` |
| `src/tools/show-in-camera.ts` (nuevo) | Valida el input contra los ids de `parts.json` y devuelve `events` |
| `src/tools/index.ts` | `ToolOutput` gana `events?: ChatEvent[]`. Se registran las dos herramientas |
| `src/chat/orchestrator.ts` | Después de correr las herramientas de una vuelta, emite los `events` de cada resultado, en orden. Genérico: el bucle no conoce el nombre de ninguna herramienta |
| `src/chat/contract.ts` | Evento `ar` |
| `src/chat/system-prompt.ts` | Ver abajo |

**System prompt**, tres cambios:
1. Las fuentes son `lookup_fuses` y `lookup_parts`.
2. Cuando un paso pide ubicar una pieza del vano del motor, explica el paso y llama a `show_in_camera` con esa pieza y una instrucción de una frase. Solo para piezas que devolvió `lookup_parts`; la caja de fusibles de la cabina no está en la cámara.
3. Si el usuario vuelve con «Listo, ¿qué sigue?», continúa con el paso siguiente; con «No lo encuentro», da una pista visual sacada de la ficha de la pieza.

## App (`app/`)

| Archivo | Cambio |
|---|---|
| `src/chat/contract.ts`, `src/chat/sse.ts` | Evento `ar` |
| `src/chat/history.ts` | `ViewCard = { part: PartId; instruction: string }` y `Bubble.cards`. `toView` arma las tarjetas desde los `tool_use` de `show_in_camera`; ignora un `part` que no esté en `parts` de `catalog.ts`. Un mensaje del asistente que solo trae `tool_use` no crea una burbuja vacía: su tarjeta queda en la burbuja del asistente que lo rodea |
| `src/app/ask.tsx` | Tarjeta «Abrir cámara: <nombre>» al pie de la burbuja, también durante el streaming (con el evento `ar`). Al tocarla: `router.push` a la ruta de arriba. Al recuperar el foco después de abrir la cámara, muestra dos respuestas rápidas sobre el input; tocarlas las envía como mensaje. Desaparecen al enviar cualquier mensaje. El texto de estado por herramienta sale de un mapa `{ nombre → texto }`. El ejemplo de la pantalla vacía pasa a «no sale agua del limpiaparabrisas» |
| `src/escaner/GuideBanner.tsx` (nuevo) | Nombre de la pieza, instrucción y botón «Volver al chat» (`router.back()`), bajo la barra superior |
| `src/app/escanear.tsx` | Lee `part` e `instruction`, muestra `GuideBanner` sobre cualquiera de los dos escáneres y pasa `initialPart` a `EscanerAR` |
| `src/escaner/EscanerAR.tsx` | Prop `initialPart?: PartId`: es la selección inicial, y también la que queda después de «Empezar de nuevo». Cambio mínimo: no tocar nada más de este archivo |

El chat solo conoce el Outback, así que el `vehicleId` de la ruta es una constante en `src/chat/`.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `lookup_parts({})` devuelve un `search_result` con 9 bloques citables; cada uno termina en `part: <id>` y el del sapito menciona «limpiaparabrisas» | api | unit |
| 2 | `show_in_camera({ part: "washer", instruction })` devuelve un texto y `events: [{ event: "ar", data: { part, instruction } }]` | api | unit |
| 3 | `show_in_camera` con `part` desconocido, o sin `instruction`, devuelve `is_error: true` y ningún evento | api | unit |
| 4 | Con un adaptador falso y una herramienta que devuelve `events`, el orquestador emite `tool`, `ar`, `text` y `done`, en ese orden | api | unit |
| 5 | El `enum` de `show_in_camera` es igual a los ids de `parts.json` | api | unit |
| 6 | `splitEvents` convierte un evento `ar` en `{ type: 'ar', part, instruction }` | app | unit |
| 7 | `toView` con un `tool_use` de `show_in_camera` deja una tarjeta en la burbuja del asistente; con un `part` desconocido, ninguna; un mensaje con solo `tool_use` no crea una burbuja vacía | app | unit |
| 8 | Los ids de `api/src/data/parts.json` son los mismos que las claves de `parts` en `catalog.ts` | app | unit |
| 9 | `npm run typecheck` en `api/` y `npx tsc --noEmit` en `app/`, sin errores | ambos | typecheck |

Se corren con `cd api && npm test` y `cd app && npx tsx --test src/chat/*.test.ts`, sin red.

## Verificación manual

- **Servidor, con la key:** `curl -N` a `/api/chat` con «no sale agua del limpiaparabrisas». Tienen que llegar `tool` (`lookup_parts`), `citation`, `tool` (`show_in_camera`), `ar` y `done`.
- **APK:** el recorrido del «Done cuando», en un teléfono con ARCore y en uno sin ARCore (el banner tiene que verse igual).
- Que el modelo de verdad llame a `show_in_camera`: depende del prompt y los tests no lo cubren.

## Fuera de alcance en esta fase

El resaltado nuevo de la pieza (fase B), la flecha y la distancia (fase C), que el chat vea la cámara (fase H), la voz (fase I), `search_manual` y los fusibles con página (fase G), otros autos en el chat, y verificar contra el manual las páginas de `parts.json`.
