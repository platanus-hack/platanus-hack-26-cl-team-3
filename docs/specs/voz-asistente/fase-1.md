# Fase 1 — El modo vivo lee en voz alta sus respuestas

## Done cuando

Con «Leer respuestas en el modo vivo (experimental)» encendido en Ajustes, preguntas «¿dónde está el sapito?» en el modo vivo y escuchas la respuesta con la voz de ElevenLabs mientras aparece en la tarjeta. Si tocas la tarjeta mientras habla, se calla al instante y vuelve a escucharte. Con el ajuste apagado (por defecto), el modo vivo queda exactamente como antes.

## Contrato [CONGELADO]

### `GET /api/speak?text=<frase>`

```
Query:    text: string (1 a 500 caracteres después de limpiarlo)
Headers:  x-chat-token si el servidor tiene CHAT_TOKEN (mismo chequeo que /api/transcribe)
Response: 200, content-type audio/mpeg, cuerpo en streaming tal como llega de ElevenLabs
Errores (JSON { error }):
  400 «Falta el texto.» si text viene vacío o queda vacío al limpiarlo
  400 «El texto es muy largo.» si pasa de 500 caracteres
  401 «No autorizado.» con CHAT_TOKEN y sin el header correcto
  500 «Falta ELEVENLABS_API_KEY en el servidor.»
  500 «La key de ElevenLabs no es válida o no tiene permiso de Text to Speech.» (401/403 de ElevenLabs)
  503 «El servicio de voz está ocupado. Inténtalo de nuevo.» (429 de ElevenLabs)
  502 «No pude generar la voz. Inténtalo de nuevo.» (cualquier otra falla)
```

### Feature flag: ajuste `vozVivo` (app, `app/src/ajustes.ts`)

```
type Ajustes = { modelo; esfuerzo; anclajeConModelo; vozVivo: boolean }
Por defecto: vozVivo = false
Se guarda en el mismo JSON de KEY ('capo-ar:ajustes:v1'); un JSON viejo sin el campo toma el valor por defecto.
```

Con `vozVivo` en false no se pide ninguna frase a `/api/speak`, no se pausa el micrófono y la tarjeta no muestra el estado «Hablando». Cuando se valide, el valor por defecto pasa a true en otra PR.

Llamada a ElevenLabs:

```
POST https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream?output_format=mp3_44100_64
Headers: xi-api-key, content-type: application/json
Body:    { "text": "<texto limpio>", "model_id": "eleven_flash_v2_5", "language_code": "es" }
```

- `VOICE_ID` es una constante en `api/src/speak/elevenlabs.ts`, no una variable de entorno: no es secreto y así no hay que configurar el host.
- Si el cliente corta la conexión (la persona tocó la tarjeta), el servidor aborta la llamada a ElevenLabs.

## Backend (`api/`)

- `api/src/speak/limpiar.ts`: `limpiarParaVoz(texto)`, función pura. Quita markdown (`**`, `__`, `#`, backticks), viñetas al inicio de línea (`- `, `* `, `• `), enlaces `[texto](url)` → `texto`, URLs sueltas y referencias `[1]`; colapsa espacios.
- `api/src/speak/elevenlabs.ts`: `elevenlabsSpeaker: Speaker`, con `type Speaker = (texto: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>`. Errores con su propio `SpeakError` de clases `config | auth | busy | upstream`, como `api/src/transcribe/elevenlabs.ts`.
- `api/src/speak/handler.ts`: `handleSpeak(req, res, speaker = elevenlabsSpeaker)`. Mismo esqueleto que `handleTranscribe`: chequeo de `CHAT_TOKEN`, validación, mapa de errores, y `Readable.fromWeb(stream).pipe(res)`. Escucha `close` del request para abortar.
- `api/src/server/server.ts`: ruta `GET /api/speak` con `speaker` inyectable en `createServer`, igual que `transcriber`.
- Sin variables de entorno nuevas: usa `ELEVENLABS_API_KEY`.

## App (`app/`)

- `app/src/ajustes.ts`: `vozVivo` en `parseAjustes`, `cargarAjustes` y `guardarAjustes`. `app/src/app/ajustes.tsx`: un `Switch` «Leer respuestas en el modo vivo (experimental)», con el mismo estilo que el de «Anclaje con Sonnet».
- `app/src/escaner/vivo/frases.ts`: `crearCortador()`, función pura con estado:
  - `push(textoCompleto): string[]` recibe el texto acumulado de la tarjeta (crece a medida que llega la respuesta) y devuelve solo las frases nuevas que ya terminaron.
  - Corta en `.`, `!`, `?` seguidos de espacio o salto de línea, y en saltos de línea. No corta en decimales (`13.5`), abreviaturas con número (`N.º`) ni marcas de lista (`1.`).
  - Junta las frases de menos de 20 caracteres con la siguiente.
  - Si el texto nuevo no empieza con el anterior (otra respuesta u otro paso), reinicia.
  - `terminar(): string[]` entrega el resto cuando la respuesta terminó.
- `app/src/chat/voz.ts`: `fuenteVoz(frase)` → `{ uri: \`${API_URL}/api/speak?text=${encodeURIComponent(frase)}\`, headers: tokenHeaders() }`.
- `app/src/escaner/vivo/useVoz.ts`: cola de reproducción.
  - `decir(frases)` encola; reproduce de a una con `createAudioPlayer(fuenteVoz(frase))` y precarga la siguiente.
  - `callar()` para la actual, libera los reproductores y vacía la cola.
  - `hablando: boolean` es true desde que suena la primera frase hasta 300 ms después de la última.
  - Si una frase falla, se salta en silencio: el texto sigue en la tarjeta.
- `useModoVivo` / `ProveedorVivo`: carga `vozVivo` con `cargarAjustes()` al montar. Recibe `caption` y `busy` de `cameraGuide` (props desde `EscanerAR`). Solo si `vozVivo` es true: cuando `caption.pensando` es false y el texto cambia, lo pasa por el cortador y encola las frases. Cuando `busy` pasa a false, encola `terminar()`. Expone `hablando` y `callar`.
- `useEscuchaViva`: nueva opción `pausado` (= `hablando`). Mientras está pausado no pasa audio al VAD y manda al WebSocket de transcripción trozos de silencio (PCM en cero) en vez del micrófono, para que la sesión no se corte a los 15 s. Al salir de la pausa descarta `huboVoz` y el parcial.
- `TarjetaVivo`: estado nuevo «Hablando», con ícono de parlante, la etiqueta «Hablando · toca para callar» y el texto de la tarjeta en el cuerpo. La tarjeta es tocable solo en ese estado y llama a `callar()`.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | `limpiarParaVoz` quita markdown, viñetas, enlaces, URLs y referencias, y colapsa espacios | api | unit |
| 2 | `GET /api/speak` sin texto, con texto que queda vacío y con más de 500 caracteres → 400 | api | unit |
| 3 | `GET /api/speak` con un speaker falso → 200 `audio/mpeg` y el cuerpo es el del stream | api | unit |
| 4 | Errores `config`, `auth`, `busy`, `upstream` → 500, 500, 503, 502; con `CHAT_TOKEN` y sin header → 401 | api | unit |
| 5 | El cortador entrega las frases completas en orden mientras el texto crece, sin repetir | app | unit |
| 6 | El cortador no corta en `13.5`, `N.º 3` ni `1.`; junta fragmentos de menos de 20 caracteres | app | unit |
| 7 | Texto que no extiende al anterior reinicia; `terminar()` entrega el resto y deja el cortador vacío | app | unit |
| 8 | `fuenteVoz` codifica el texto en la URL y agrega `x-chat-token` si existe | app | unit |
| 9 | `parseAjustes` sin `vozVivo` → false; respeta un booleano guardado e ignora valores que no son booleanos | app | unit |

## Verificación manual

- Latencia hasta el primer audio desde Chile: ElevenLabs no lista Sudamérica en su tabla de regiones.
- Que el micrófono no transcriba la voz del asistente y que una respuesta de más de 15 s no corte la sesión de transcripción.
- Que tocar la tarjeta calle al instante y no quede audio en la cola.
- Que suene por el parlante con `allowsRecording` activo.
- Que la key tenga permiso de Text to Speech: `curl "https://ph26.berguecio.cl/api/speak?text=hola" -o hola.mp3`.

## Fuera de alcance en esta fase

- El chat y su ajuste (fase 2).
- Encender la voz por defecto: va en otra PR cuando se valide.
- Interrumpir hablando encima: necesita cancelación de eco.
- Que la tarjeta avance al ritmo del audio, avisos de cuota y caché (fase 3).
- Elegir la voz desde la app.
