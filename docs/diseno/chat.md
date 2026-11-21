# Diseño: chat y harness del asistente

> Estado: propuesta (2026-11-21), sin código. Alcance: UI del chat, conexión con el LLM y las herramientas con las que el modelo llega a los datos del auto. La AR queda fuera; solo se define el punto de contacto (`mostrar_en_ar`).
> Supuestos: PWA en TypeScript (Next.js) con una ruta de API propia; SDK oficial `@anthropic-ai/sdk`. Lo que no está verificado dice **[verificar]**.
> **Decisión posterior (2026-11-21): la app es el APK (no la PWA) y el servidor `api/` consume el modelo por OpenRouter.** Este documento sigue valiendo para las herramientas, el prompt y las citas. Para la plataforma y el proveedor manda [`docs/specs/chat-manual/README.md`](../specs/chat-manual/README.md).

## 1. Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Modelo | Se elige por **perfil** con un selector en el chat; los perfiles van en el código (sección 9). Perfil por defecto: `claude-opus-5-5`, effort `medium` explícito | El default de Opus 5.5 es `medium`. Si la demo se siente lenta, se prueban otros perfiles contra las preguntas de la sección 7 |
| Rechazos | `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) | Si el modelo declina, la misma llamada sigue en otro modelo, sin cortar la demo |
| Citas | Las herramientas devuelven bloques `search_result` con `citations: {enabled: true}` | La API pega a cada frase su `cited_text`, `source` y `title`, y el texto citado sale de lo que devolvimos. Así se cumple la regla 2 sin depender de que el modelo cite bien |
| Salida estructurada | **No** se usa `output_config.format` | Es incompatible con las citas (devuelve 400). Lo estructurado (la pieza a mostrar en AR) va por una herramienta `strict` |
| Bucle | Bucle manual con `client.beta.messages.stream()` + `finalMessage()` | Se controla qué eventos llegan a la UI y cómo se arma cada `tool_result` |
| Estado | Servidor sin estado; la conversación completa vive en el cliente (IndexedDB) y se reenvía en cada turno | Es lo más simple. **No cubre:** que el cliente edite el historial (si lo hace, la API rechaza los bloques de razonamiento) |
| Caché | `cache_control: {type: "ephemeral"}` arriba del request; `system` y `tools` fijos por vehículo | El prefijo (prompt + herramientas + historial) se reusa turno a turno. Se verifica con `usage.cache_read_input_tokens` |

`tool_choice` forzado no existe en Opus 5.5 (da 400): el prompt le dice al modelo que busque antes de responder.

## 2. Flujo de un turno

```
UI ──POST /api/chat {historial, mensaje}──▶ API
API ──stream──▶ Claude (system + tools + historial)
  Claude pide herramienta → API la ejecuta → tool_result (search_result) → otra vuelta
  Claude responde texto con citas → API reenvía deltas a la UI (SSE)
API ──evento fin {contenido completo del asistente + tool_results}──▶ UI (se guarda en IndexedDB)
```

Eventos SSE hacia la UI, los mínimos:

| Evento | Cuándo | La UI muestra |
|---|---|---|
| `texto` | `content_block_delta` / `text_delta` | El texto en streaming |
| `cita` | `content_block_delta` / `citations_delta` | Un chip `[n]` en el bloque actual |
| `herramienta` | Al empezar cada `tool_use` | «Buscando en el manual…», «Revisando la tabla de fusibles…» |
| `ar` | Cuando el modelo llama `mostrar_en_ar` | Tarjeta «Ver en AR: fusible 11» |
| `fin` | El turno termina (`end_turn`) | Guarda los mensajes nuevos, **sin modificarlos** |
| `error` | `refusal` de toda la cadena, errores de la API | «No pude responder. Revisa el manual o consulta a un mecánico» |

Hay que guardar el `message.content` completo de cada vuelta, con `thinking`, `tool_use` y todo lo demás, y reenviarlo igual. Si se guarda solo el texto, se pierde el razonamiento entre turnos.

## 3. Herramientas

Son tres. El vehículo lo fija la sesión en el servidor, no el modelo (MVP: Outback 2016 3.6R).

### `buscar_manual`

```ts
{
  name: "buscar_manual",
  description:
    "Busca pasajes en el manual del propietario del auto. Devuelve fragmentos con página y sección. " +
    "Úsala antes de afirmar cualquier dato del auto. Escribe la consulta en el idioma del manual " +
    "(<idioma del manual>), con los términos que usaría el manual.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: { consulta: { type: "string" } },
    required: ["consulta"],
    additionalProperties: false,
  },
}
```

- La búsqueda es BM25 en memoria (p. ej. MiniSearch) sobre los fragmentos. Con un manual de ~566 páginas alcanza, sin embeddings.
- Devuelve hasta 5 `search_result`, cada uno así:

```ts
{
  type: "search_result",
  source: "manual://outback-2016-3.6r/p/412",          // estable; la UI saca la página de aquí
  title: "Manual del propietario Outback 2016 — Fusibles, p. 412 (copia de terceros)",
  content: [ { type: "text", text: "<párrafo 1>" }, { type: "text", text: "<párrafo 2>" } ],
  citations: { enabled: true },
}
```

- **Un bloque de texto por párrafo**: la API cita bloques enteros, así que con bloques chicos la cita queda más precisa.
- Sin resultados → `[{ type: "text", text: "Sin resultados en el manual." }]`. Si un `tool_result` trae algún `search_result`, todos sus bloques tienen que ser `search_result`.
- **Idioma:** si la copia del manual está en inglés, el modelo busca en inglés y responde en español. El popover de la cita muestra el texto original **[verificar el idioma de la copia que usemos]**.

### `consultar_fusibles`

Usa la tabla de fusibles transcrita a mano desde el manual y verificada en el auto (prueba E0). No se extrae con un LLM. Es determinista y cubre el paso crítico de la demo.

```ts
{
  name: "consultar_fusibles",
  description:
    "Devuelve filas de la tabla de fusibles del auto (caja, número, amperaje, circuito) con su página. " +
    "Filtra por circuito (p. ej. 'P/W', 'power window') o por número de fusible.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: { filtro: { type: "string" } },
    required: ["filtro"],
    additionalProperties: false,
  },
}
```

Cada fila es un bloque citable con su `pieza_id`, para que el modelo pueda pasarlo a `mostrar_en_ar`:

```ts
{
  type: "search_result",
  source: "manual://outback-2016-3.6r/p/<pág>#fusibles-cabina",
  title: "Tabla de fusibles — caja de la cabina, p. <pág>",
  content: [
    { type: "text", text: "Fusible 11 — 30 A — P/W MAIN1 — caja de la cabina. pieza_id: fusible-cabina-11" },
    { type: "text", text: "Fusible 24 — 20 A — P/W MAIN2 — caja de la cabina. pieza_id: fusible-cabina-24" },
  ],
  citations: { enabled: true },
}
```

### `mostrar_en_ar`

Es una acción de UI: el servidor no ejecuta nada, solo emite el evento `ar`.

```ts
{
  name: "mostrar_en_ar",
  description:
    "Muestra al usuario un botón para ver en AR dónde está una pieza. Llámala cuando la respuesta " +
    "lo guíe a una pieza concreta. Solo acepta piezas con calibración AR.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      pieza_id: { type: "string", enum: [/* ids del catálogo de calibración */] },
      etiqueta: { type: "string" },
    },
    required: ["pieza_id", "etiqueta"],
    additionalProperties: false,
  },
}
```

- El `enum` sale del catálogo de calibración (`piezas.json`), así el modelo no puede inventar ids.
- Resultado: texto plano, «Botón AR mostrado.». Si la pieza no tiene AR, no está en el enum y el modelo la describe con el manual.
- Como `eager_input_streaming` deja de validar en el servidor, cada input se valida con Zod antes de ejecutarlo. Si no pasa, va un `tool_result` con `is_error: true`.

## 4. System prompt (borrador)

```
Eres el asistente de capo-ar. Ayudas a un conductor sin experiencia a revisar y resolver cosas
básicas de su auto: <vehículo, año, motor>.

Fuentes: solo lo que devuelvan buscar_manual y consultar_fusibles. Busca antes de responder
cualquier dato del auto. Si no aparece, di «No lo encuentro en el manual» y sugiere consultar
a un mecánico. No completes datos de memoria (amperajes, tipos de ampolleta, líquidos).

Seguridad: antes de tocar fusibles o piezas eléctricas, pide apagar el contacto. No digas que algo
«no tiene peligro» ni que «ahí no hay nada»: solo cuenta lo que dice el manual.

Si falta un dato para responder bien (qué ventana, desde cuándo), pregúntalo en una línea.

Respuestas: pasos numerados, cortos, en español de Chile, tratando de tú. Cuando un paso lleve a
una pieza concreta, llama a mostrar_en_ar. El aviso legal lo muestra la app; no lo repitas.
```

Va fijo por vehículo y sin fecha ni ids variables, para no romper la caché.

## 5. UI del chat

- **Primer uso:** el aviso obligatorio (regla 9.1) con «Entendido». También queda accesible desde el menú.
- **Cabecera:** el vehículo («Subaru Outback 2016 · 3.6R»). Por ahora es fijo; el selector viene después.
- **Mensajes:** el texto llega en streaming. Las citas aparecen como chips `[1]` que abren una hoja inferior con el `title`, la página y el `cited_text`, y la marca «copia de terceros» cuando corresponde.
- **Estado de herramientas:** una línea gris mientras corren («Buscando en el manual…»).
- **Tarjeta de cámara:** «Abrir cámara: caja de fusibles del motor». Mientras no exista la AR, abre la vista «Escanear capó» con la instrucción del paso arriba y un botón «Volver al chat». Al volver, la conversación sigue igual y aparecen las respuestas rápidas «Listo, ¿qué sigue?» y «No lo encuentro».
- **Sin fuente:** si una respuesta termina sin ninguna cita, lleva la marca «sin fuente del manual» y se registra en el log. Regenerarla queda para después, si hace falta.
- **Después:** dictado por voz (Web Speech API), respuestas rápidas sugeridas.

## 6. Datos que necesita el harness

| Archivo | Contenido | Cómo se arma |
|---|---|---|
| `fragmentos.json` | `{id, pagina, seccion, parrafos[]}` | Script: PDF → texto por página → párrafos bajo cada título |
| `fusibles.json` | `{caja, numero, amperaje, circuito, pagina, fuente, pieza_id}` | A mano, desde el manual, verificado en el auto |
| `piezas.json` | `{pieza_id, nombre, tiene_ar}` | Lo comparte con la calibración AR |

**Licencias (regla 7):** el texto del manual no va en el repo si es público. Se guarda fuera (p. ej. Blob privado o variable de despliegue) y la ruta de API lo carga al arrancar **[por decidir]**.

## 7. Cómo sabemos que funciona

**Hackathon:** a mano. Se prueban en el chat las preguntas del guion de la demo, cambiando de perfil con el selector:

- «se me quedó abajo la ventana del conductor»
- «¿dónde está el sapito?»
- una pregunta que el manual no cubre, que debe terminar en «No lo encuentro»

*Después, si hace falta:* convertir esas preguntas en un banco de pruebas automático (sección 9).

## 8. Pendiente

- Idioma de la copia del manual y si trae la tabla de fusibles con número de página.
- Dónde viven los datos del manual (regla 7).
- Si `effort: "low"` o el modo rápido (`speed: "fast"`, al doble de precio) hacen falta para que la demo se sienta ágil. Se mide, no se adivina.

## 9. Capa de modelos intercambiable

Objetivo: cambiar de modelo, de effort o de versión del prompt desde la UI, sin desplegar.

### Lo esencial (hackathon)

- Los perfiles van en una lista en el código (`perfiles.ts`): Opus 5.5, Sonnet 5.5 y Haiku 5.5, con su effort.
- El chat tiene un selector de perfil, guarda la elección en el teléfono y manda `perfil_id` en cada pregunta.
- El orquestador resuelve `perfil_id` → modelo y llama al adaptador de Claude.
- Agregar un perfil es agregar una entrada en `perfiles.ts` y desplegar.

Todo lo que sigue en esta sección (almacén de perfiles, API de ajustes, mapa de capacidades, banco de pruebas, trazas, otros proveedores) es **después, si hace falta**. La interfaz del adaptador se respeta desde el principio para que agregarlo no obligue a reescribir.

### Piezas

- **Perfil de modelo:** la unidad que se elige y se compara.

  ```ts
  type PerfilModelo = {
    id: string;
    nombre: string;                 // "Opus 5.5 medium", "Sonnet 5.5 low"…
    proveedor: Proveedor;           // hoy solo "anthropic"
    modelo: string;                 // "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    speed?: "fast";
    max_tokens: number;
    prompt_version: string;         // el system prompt va versionado en el repo
    por_defecto: boolean;
  };
  ```

- **Mapa de capacidades por proveedor:** se declara en un registro, no con `if (proveedor === …)` dentro del orquestador.

  ```ts
  const CAPACIDADES = {
    anthropic: { citas: "nativas", toolsStrict: true, effort: ["low", "medium", "high", "xhigh", "max"], fallbacks: true },
  } satisfies Record<Proveedor, Capacidades>;
  ```

  `citas` decide cómo se arman las citas: `nativas` usa los bloques `search_result`; `marcadores` (cuando haya un proveedor sin citas nativas) usa marcas `[p412]` que el harness valida contra lo devuelto. Hoy solo existe `nativas`.

- **Adaptador por proveedor:** traduce un turno al formato nativo y devuelve eventos normalizados (`texto`, `cita`, `tool_use`, `fin`, `error`). El orquestador solo ve esos eventos.

  ```ts
  interface AdaptadorLLM {
    capacidades: Capacidades;
    listarModelos(): Promise<ModeloDisponible[]>;    // Claude: Models API
    turno(p: PerfilModelo, ctx: ContextoTurno): AsyncIterable<EventoTurno>;
    resultadoHerramienta(toolUseId: string, r: ResultadoHerramienta): unknown;
  }
  ```

- **Registro de modelos:** es el **único dueño** de los perfiles. Los lee y los guarda, los valida contra las capacidades al guardarlos y resuelve `perfil_id` → adaptador + parámetros. La API de ajustes no escribe perfiles por su cuenta: pasa por el registro.

### Reglas

- El chat manda `perfil_id`. Si no viene, se usa el perfil por defecto. En modo dev hay un selector en la cabecera para comparar rápido.
- **Cambiar de perfil a mitad de conversación** solo dentro del mismo proveedor. Con Claude, los bloques de razonamiento que el modelo nuevo no lee la API los descarta sola, pero la caché es por modelo y se pierde. Cambiar de proveedor abre una conversación nueva.
- **Perfiles por defecto en el código**, así la app funciona sin el almacén. El almacén (KV) guarda los que se crean desde la UI.
- **Ajustes y banco** van detrás de una clave del equipo (variable de entorno). Las keys de los proveedores nunca salen del servidor.

### Iterar

- **Banco de pruebas:** corre las preguntas de la sección 7 en los N perfiles elegidos, con el mismo orquestador que el chat. Guarda por respuesta: `perfil_id`, `modelo_servido` (cambia si actuó el fallback), si acertó (fusible y página), tiempo al primer token, tiempo total, tokens (entrada, salida y caché), costo estimado, número de citas y `stop_reason`.
- **Trazas:** el chat real deja el mismo registro por turno. `refusal`, `max_tokens` y error de la API se guardan por separado, para no mezclar causas distintas.
- **Costo:** cada corrida del banco cuesta tokens, así que la UI muestra cuántas llamadas hará y pide confirmar.
- **Otro proveedor:** se agrega como un adaptador más, con su SDK, más su fila en `CAPACIDADES`. El harness y la UI no cambian. Queda para después, si hace falta; para la demo alcanza con comparar Opus, Sonnet y Haiku.
