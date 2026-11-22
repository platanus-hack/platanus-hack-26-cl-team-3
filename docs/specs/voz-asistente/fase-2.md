# Fase 2 — El chat también lee sus respuestas

## Done cuando

Con «Leer respuestas en el chat (experimental)» encendido en Ajustes, preguntas en el chat y escuchas la respuesta mientras se escribe. En cualquier respuesta anterior, el botón de parlante la lee de nuevo y el mismo botón la calla. Con el ajuste apagado (por defecto), el chat no muestra el botón ni pide audio.

## Contrato [CONGELADO]

Sin cambios en el servidor: reusa `GET /api/speak` de la fase 1 tal cual.

### Ajustes (app, `app/src/ajustes.ts`)

```
type Ajustes = { modelo; esfuerzo; anclajeConModelo; vozVivo: boolean; vozChat: boolean }
Por defecto: vozChat = false (vozVivo ya existe desde la fase 1, también en false)
Se guarda en el mismo JSON de KEY ('capo-ar:ajustes:v1'); un JSON viejo sin el campo toma el valor por defecto.
```

## App (`app/`)

- Mover `frases.ts` (con su test) y `useVoz.ts` de `app/src/escaner/vivo/` a `app/src/chat/`, sin cambiar su comportamiento. El modo vivo los importa desde ahí.
- `frases.ts`: agregar `frasesDe(texto): string[]`, que pasa un texto completo por el cortador y devuelve todas sus frases (`push` + `terminar`).
- `ajustes.ts`: `vozChat` en `parseAjustes`, `cargarAjustes` y `guardarAjustes`.
- `app/src/app/ajustes.tsx`: un `Switch` «Leer respuestas en el chat (experimental)», junto al del modo vivo.
- `app/src/app/(main)/ask.tsx`:
  - Con `vozChat` encendido, mientras llega la respuesta, el texto de `progress.parts` pasa por el cortador y `useVoz` lee las frases. Al terminar el turno, encola `terminar()`.
  - Solo con `vozChat` encendido: botón de parlante en cada respuesta del asistente: si no está sonando esa respuesta, `callar()` y `decir(frasesDe(texto))`; si está sonando, `callar()`. Ícono `volume-high` o `stop`, con `accessibilityLabel` «Escuchar respuesta» o «Callar respuesta».
  - `callar()` al enviar una pregunta nueva, al empezar a dictar, al borrar la conversación y al salir de la pantalla.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `parseAjustes` sin `vozChat` → false | app | unit |
| 2 | `parseAjustes` respeta `vozChat` guardado e ignora valores que no son booleanos | app | unit |
| 3 | `frasesDe` devuelve todas las frases de un texto, incluida la última sin punto final | app | unit |
| 4 | Los tests del cortador de la fase 1 siguen pasando desde su nueva ubicación | app | unit |

## Verificación manual

- Que la voz del chat no se encime con el dictado: al tocar el micrófono, se calla.
- Que el botón de parlante de una respuesta vieja corte la que estaba sonando.
- Que con el ajuste apagado el chat quede exactamente como antes.

## Fuera de alcance en esta fase

- Que la tarjeta del modo vivo avance al ritmo del audio, avisos de cuota y caché (fase 3).
- Elegir la voz o la velocidad desde Ajustes.
