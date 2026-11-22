# Modo en vivo — conversar por voz con el agente mientras ve el vano

Una sola fase y una sola PR (modo hackathon).

## Done cuando

Desde el chat, con el campo vacío, tocas el botón de video y se abre el escáner AR en modo en vivo.
- Dices «¿dónde está el sapito?» y, a los 3 s de silencio, la pregunta sale sola con el recorte del vano.
- La respuesta aparece como subtítulos y la pieza queda marcada en el mapa.
- Si hablas mientras el agente responde, esa respuesta se corta. Cuando terminas de hablar, sale una sola pregunta con lo anterior y lo nuevo juntos.

## Contrato [CONGELADO]

### `POST /api/chat` (cambio aditivo)

```
Request:  { messages: MessageParam[], profile_id?: string, mode?: "vivo" }
Response: SSE igual que hoy
Errores:  400 «mode no existe» si mode viene y no es "vivo". El resto, igual que hoy.
```

- Con `mode: "vivo"`, el sistema es `SYSTEM_PROMPT + "\n\n" + VIVO_PROMPT`. Sin `mode`, nada cambia.
- `VIVO_PROMPT` vive en `api/src/chat/system-prompt.ts`:

  > Modo en vivo: la persona te habla con el teléfono apuntando al motor, y tu respuesta se lee como subtítulos. Responde en 1 a 3 frases cortas, sin listas. Cada mensaje puede traer una foto: es el recorte del vano del motor que ve la cámara en ese momento. Úsala para saber qué está mirando y orientarla («la tapa amarilla, a la izquierda de la batería»), pero los datos del auto salen solo de lookup_parts y lookup_fuses. Si el mensaje no trae foto, la cámara no está viendo el motor: si la necesitas, pídele que apunte al vano. Cuando nombres una pieza del vano, llama a show_in_camera para marcarla.

- La foto va en el mensaje del usuario como bloque estándar de Anthropic: `[{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text }]`. El servidor no la toca. Tope de cuerpo: `MAX_BODY` (1 MB) sigue igual.
- **Historial:** la foto viaja solo en el pedido de ese turno. En el historial guardado, el mensaje del usuario queda como texto plano. Así `toView` no cambia y el cuerpo no crece turno a turno.

### App: `sendTurn` y `runTurn`

- `runTurn({ messages, mode?, signal? })`:
  - Agrega `mode` al body solo si viene.
  - Le pasa `signal` al `fetch`.
  - Si `signal` se abortó, termina sin emitir ningún evento, ni siquiera el error de red.
- `sendTurn(history, text, run, onProgress, opts?: { image?: string; mode?: "vivo"; signal?: AbortSignal })`:
  - El pedido lleva el mensaje del usuario con `[image, text]` si hay `image`, o con `text` si no.
  - El `messages` del resultado guarda `{ role: "user", content: text }`, sin la foto.
- `TurnResult` suma `{ aborted: true }`.
  - `sendTurn` lo devuelve si `opts.signal` está abortado al cortar o al terminar el stream.
  - Después del abort no llama más a `onProgress`.
  - Si `done` ya había llegado, gana `done`.
- `useCameraGuide().ask(text, keepGuide?, opts?)` le pasa `opts` a `sendTurn`. Con `{ aborted: true }` no muestra error, no guarda el historial y deja `busy` en `false`.
- El servidor no cambia para cortar: `chat-handler` ya aborta la llamada a Claude cuando el cliente cierra la conexión.

### Navegación

- La ruta `/escanear` acepta `vivo=1` (`params: { vehicleId: CHAT_VEHICLE_ID, vivo: "1" }`).
- `escanear.tsx` pasa `vivo` a `EscanerAR` y lo suma a su `key`. Sin ARCore (`EscanerCamara`), `vivo` se ignora en esta fase.

## Backend (`api/`)

- `chat-handler.ts`: `validate` acepta `mode` (solo `"vivo"`) y devuelve el `system` que corresponde. `runTurn` ya recibe `system`.
- `system-prompt.ts`: exporta `VIVO_PROMPT` con el texto del contrato.
- No hay endpoints nuevos: la transcripción usa el `POST /api/transcribe` que ya existe.

## Frontend (`app/`)

- **`app/src/escaner/vivo/vad.ts` (puro, sin RN).** `crearVad(opciones?)` devuelve `push(db: number, t: number): "inicio" | "fin" | "reiniciar" | null`. Recibe una muestra de volumen (dBFS) cada ~100 ms.
  - **Umbral de voz adaptable:** piso de ruido (mediana de los últimos 2 s sin voz) + 15 dB, acotado entre -45 y -20 dB.
  - `"inicio"`: 250 ms seguidos sobre el umbral. Un golpe más corto no cuenta.
  - `"fin"`: 3000 ms seguidos bajo el umbral después de un inicio, o 30 s de frase como máximo.
  - `"reiniciar"`: 10 s sin voz y sin frase en curso. Se descarta la grabación para que no se acumule silencio.
  - Todas las cifras van como constantes con nombre, sobreescribibles por `opciones` para los tests.
- **`app/src/escaner/vivo/useEscuchaViva.ts`.**
  - Usa el `useAudioRecorder` de `expo-audio` con medición de volumen activada (`isMeteringEnabled`) y muestras cada 100 ms (`useAudioRecorderState`). Antes de escribir, confirma los nombres reales en los `.d.ts` instalados.
  - Le pasa las muestras al VAD.
  - Con `"fin"`: para la grabación, llama a `transcribeAudio(uri)` (ya existe) y entrega el texto con `onFrase(texto)`. Si el texto viene vacío, no entrega nada.
  - Con `"reiniciar"`: para y vuelve a grabar.
  - Estados: `"escuchando" | "oyendo" | "transcribiendo" | "silenciado"`.
  - El micrófono sigue abierto mientras el agente responde, porque así se puede interrumpir. `silenciado` lo controla solo el botón de silenciar.
  - Callbacks: `onInicio()` cuando el VAD da `"inicio"` y `onFrase(texto)` cuando la frase quedó transcrita.
  - Pide el permiso de micrófono y los errores salen por `onError(mensaje)`, igual que `Dictado.tsx`.
- **`app/src/escaner/vivo/pregunta.ts` (puro).** `juntarPregunta(pendiente: string, nueva: string): string` une con un espacio, recorta y deja fuera las partes vacías.
- **`app/src/escaner/vivo/foto.ts`.** `vanoParaChat(uri, bay)` recorta con `cropRectForBay` (de `engine-maps/landmarks/sonnet.ts`), achica a 1024 px de ancho como máximo, comprime a JPEG 0.7 y devuelve el base64. Si no hay recorte válido, devuelve `null`.
- **`app/src/escaner/vivo/ModoVivo.tsx`.**
  - Muestra arriba una píldora de estado: «Te escucho», «…» mientras oye, «Transcribiendo…» o «Pensando…».
  - Tiene un botón para silenciar o reactivar el micrófono.
  - Recibe `{ capturarVano: () => Promise<string | null>, preguntar: (texto, imagen, signal) => Promise<unknown> }`.
  - Guarda en refs `pendiente`, la pregunta del turno en curso, y el `AbortController` de ese turno.
  - `onInicio`: si hay un turno en curso, lo aborta. Su texto se queda en `pendiente`.
  - `onFrase(nueva)`:
    - Arma `texto = juntarPregunta(pendiente, nueva)` y aborta el turno anterior si sigue vivo.
    - Deja `pendiente = texto` y crea un controller nuevo.
    - Llama `imagen = await capturarVano()` y luego `await preguntar(texto, imagen, controller.signal)`.
    - Si ese turno no se abortó, `pendiente = ""`.
- **`EscanerAR.tsx`: solo lo mínimo, unas 12 líneas.**
  - Prop `vivo?: boolean`.
  - `capturarVano` = si hay `vano` y `ar.current`, entonces `cap = await ar.current.capturar()` y `vanoParaChat(cap.uri, vano)`; si no, `null`.
  - Renderiza `{vivo && <ModoVivo … preguntar={(t, img, signal) => cameraGuide.ask(t, false, { image: img ?? undefined, mode: 'vivo', signal })} />}`.
  - Los subtítulos y la pieza marcada ya salen de `useCameraGuide`.
- **`ask.tsx`.**
  - Con el campo vacío se ven micrófono y video. Con texto, micrófono y enviar.
  - El botón de video, de 40x40 dentro de la caja como los otros, hace `router.push` a `/escanear` con `vivo: "1"`.
  - Ícono: el de video que exista en `Icono`, o uno de `@expo/vector-icons`.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `mode: "vivo"` → el adapter recibe `SYSTEM_PROMPT + VIVO_PROMPT` | api | server.test con adapter falso |
| 2 | sin `mode` → el adapter recibe `SYSTEM_PROMPT` tal cual | api | server.test |
| 3 | `mode: "otro"` → 400 «mode no existe» | api | server.test |
| 4 | VAD: 250 ms sobre el umbral → `"inicio"`; 100 ms → nada | app | unit (vad.test.ts) |
| 5 | VAD: después de un inicio, 2,9 s de silencio → nada; 3 s → `"fin"` | app | unit |
| 6 | VAD: frase de 30 s seguidos → `"fin"` forzado | app | unit |
| 7 | VAD: 10 s sin voz → `"reiniciar"` | app | unit |
| 8 | VAD: el umbral se adapta al piso de ruido y respeta el piso (-45) y el techo (-20) | app | unit |
| 9 | `sendTurn` con `image`: el pedido lleva `[image, text]` y `mode`; el historial devuelto guarda el usuario como texto | app | unit (turn.test.ts con `run` falso) |
| 10 | `sendTurn` sin opts: el pedido es igual que hoy | app | unit |
| 11 | `sendTurn` abortado a mitad del stream → `{ aborted: true }` y ningún `onProgress` después del abort | app | unit |
| 12 | `sendTurn` abortado después de `done` → devuelve `messages` | app | unit |
| 13 | `juntarPregunta`: `("", "hola")` → `"hola"`; `("dónde está", "el sapito")` → `"dónde está el sapito"`; espacios y vacíos | app | unit |

## Verificación manual (en un teléfono con ARCore)

- El permiso de micrófono se pide una vez y el modo vive junto a la cámara sin cortarla.
- Calibrar el umbral con ruido real de taller. Si corta frases o no arranca, ajustar `+15 dB` o los topes.
- Medir la latencia desde el fin de la frase hasta el primer subtítulo, en 5 turnos.
- Confirmar que a Anthropic va el recorte y no la foto completa (log del tamaño de la imagen en el servidor o inspección del pedido).
- Requiere el `api` desplegado con `/api/transcribe` y `ELEVENLABS_API_KEY`.

## Fuera de alcance en esta fase

- Voz del agente (TTS): por ahora solo subtítulos.
- Modo en vivo sin ARCore (`EscanerCamara`).
- Mandar video o varios cuadros: va una foto por turno.
