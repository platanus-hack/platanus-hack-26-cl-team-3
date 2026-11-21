# Feature: «Preguntar al manual» (chat)

> Slug: `chat-manual` · Rama: `feat/chat-manual`, desde `dev` · **APK** (Expo/React Native, `app/`) + **servidor propio** (`api/`) que llama a **OpenRouter** · Diseño: [`docs/diseno/chat.md`](../../diseno/chat.md), sección 9 «Lo esencial».
> Hackathon: lo que importa es que funcione. Sin evals ni trazas.

## Qué se construye

Una pantalla «Preguntar al manual» en el APK. El conductor escribe la falla y recibe pasos cortos en streaming, con citas del manual. Un servidor chico (`api/`) corre el bucle de herramientas y llama al modelo por OpenRouter. La key vive en el servidor, **no en el APK**.

## Arquitectura

| Pieza | Decisión | Alternativa descartada |
|---|---|---|
| Dónde corre el bucle | Servicio `api` en el `docker-compose.yml` de `dev`. Traefik manda `Host(...) && PathPrefix(/api)` al contenedor | Todo en el APK: la key quedaba dentro de la app |
| Proveedor | OpenRouter, «Anthropic Skin» (`https://openrouter.ai/api`), con el SDK `@anthropic-ai/sdk` en el servidor | Formato OpenAI de OpenRouter: obliga a reescribir el adaptador y las citas |
| Servidor | `node:http` en JavaScript ESM, sin build. Única dependencia: el SDK. Tests con `node --test` | Express/Hono/Next: más piezas para 2 endpoints |
| Herramientas | Registro declarativo `{nombre → {definicion, ejecutar}}` | `if (nombre === …)` dentro del bucle |
| Modelos | `api/perfiles.js`; el selector llega en la fase 3 | Almacén + pantalla de ajustes (después, si hace falta) |
| App | Pantalla expo-router `preguntar.tsx` con el kit de `src/ui.tsx`. SSE con `expo/fetch` e historial en AsyncStorage | Librería SSE para RN: una dependencia más |

**Qué se reusa:** el menú, el stack de expo-router, `src/ui.tsx`, `src/theme.ts`, la pantalla `escanear.tsx` (fase 2), AsyncStorage, y el compose y Traefik de `dev`.

**Trampas:**
1. **HTTPS obligatorio.** El APK release bloquea HTTP en claro, así que el servidor tiene que ir por HTTPS.
2. **La URL se inlinea al compilar.** `EXPO_PUBLIC_API_URL` queda fija en el APK: si cambia, hay que recompilarlo.
3. **Para ver la pantalla hay que compilar el APK** (`scripts/compilar-apk.sh`, en el servidor): la app usa ONNX nativo y no corre en Expo Go.
4. **`max_tokens` y el crédito.** OpenRouter reserva crédito según `max_tokens`, así que se usa 4096.

## Contrato back↔front

Se congela en la fase 1; ver [`fase-1.md`](fase-1.md). `POST /api/chat` recibe la conversación completa en formato Anthropic y responde SSE con `herramienta`, `texto`, `cita`, `fin` y `error`. En la fase 2 se agrega `ar`; es aditivo.

## Flujo objetivo: chat ↔ cámara

El chat es el hilo conductor. Cuando un paso lleva a una pieza, el usuario abre la cámara, resuelve y vuelve al chat, donde la conversación sigue:

```
Chat: «se me quedó abajo la ventana»
  → respuesta con pasos + tarjeta «Abrir cámara: caja de fusibles del motor»
Cámara (/escanear): arriba, la instrucción del paso; abajo, «Volver al chat»
  → el usuario saca el extractor y el repuesto
Chat (/preguntar): mismo historial + respuestas rápidas «Listo, ¿qué sigue?» / «No lo encuentro»
  → el modelo sigue con el paso siguiente
```

El chat abre la cámara con `router.push('/escanear')` y «Volver al chat» es `router.back()`. La pantalla del chat queda montada debajo en el stack: si el modelo todavía está respondiendo cuando el usuario abre la cámara, el turno termina en segundo plano y queda guardado.

## Fases

| # | Demuestra | Incluye | Depende de |
|---|---|---|---|
| **1** | «Se me quedó abajo la ventana» → respuesta en streaming que cita la tabla de fusibles | Servidor `api/` (`/api/chat`, `consultar_fusibles`, adaptador OpenRouter) + servicio en compose + pantalla de chat en el APK | Key de OpenRouter en el servidor (Lucas) |
| **2** | La ida y vuelta chat ↔ cámara de arriba | Herramienta `mostrar_en_ar` (evento `ar`) → tarjeta «Abrir cámara» → `/escanear` con la instrucción del paso y «Volver al chat» → respuestas rápidas al volver | Fase 1 |
| **3** | Cambiar de modelo desde la UI; errores bien mostrados | Selector de perfiles; bordes (rechazo, red caída, sin key, sin crédito, «Nueva conversación») | Fase 1 |
| **4** | Preguntas generales («¿dónde está el sapito?») con cita de página del manual oficial | `buscar_manual` en el servidor sobre el PDF de subaru.ca. El texto del manual queda fuera del repo, en un volumen de solo lectura (regla 7) | PDF descargado + decisión |

**Después (versión final): agente por voz.** Hablarle y que guíe con voz. El orquestador ya emite eventos que no dependen de la UI (`texto`, `cita`, `herramienta`, `ar`, `fin`), así que una interfaz de voz consumiría los mismos eventos: dictado → `mensajes`, `texto` → voz. No se construye ahora.

Las specs de las fases 2 y 3 se escriben cuando les toque, con lo aprendido en la anterior.

## Proveedor del modelo: OpenRouter

El servidor usa la «Anthropic Skin» de OpenRouter (`POST /v1/messages`, key `sk-or-…` como Bearer) con un request mínimo. **[verificar con la key]** que los `search_result` con citas pasen tal cual. Si no pasan, se activa la estrategia de marcadores (`docs/diseno/chat.md` §9) sin tocar el contrato.

## Pendiente fuera del código

- **E0 en el auto:** qué fusible corresponde a cada ventana. Hasta entonces `fusibles.json` usa la tabla de terceros, marcada como «por verificar».
- **Descargar el PDF oficial** desde subaru.ca (enlace en `feat/vehicle-maps` → `prototype/vehicle-maps/vehicles.js`). Si no se puede, se usa la copia del visor joomag, marcada como tercero.
- **Key de OpenRouter** (Lucas): va en la variable `OPENROUTER_API_KEY` del servidor, nunca en el APK. También hace falta el id del modelo.
- **Deploy del servicio `api`** en el servidor del equipo (issue #2), por HTTPS en `ph26.berguecio.cl/api`.
