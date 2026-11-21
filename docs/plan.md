# Plan por fases: la guía visual

> Estado al 21-11-2026, verificado contra `dev` en `4e1e8eb`. Lo que no se verificó lo dice.
> Contexto: [`brief.md`](brief.md), [`specs/chat-manual/`](specs/chat-manual/README.md) y [`herramientas/vano-motor/`](../herramientas/vano-motor/README.md).

## El producto

Le cuentas la falla, la cámara resalta la pieza real y la deja anclada en 3D, oscurece el resto, y cada paso cita el manual de tu variante.

**El foco es la guía visual.** Gemini Live ya marca objetos sobre la cámara con un recuadro 2D. La nuestra tiene que verse pegada al auto: con el contorno real de la pieza, pasando por detrás de tu mano y guiándote hasta ella. No encontramos evidencia de que el recuadro de Gemini se despegue al moverse; hay que grabarlo frente al auto (fase A) antes de usarlo en el pitch.

## Dónde estamos

| # | Paso de la experiencia | Estado | Hoy | Lo cierra |
|---|---|---|---|---|
| 1 | Cuentas la falla | Listo | Chat por texto en el APK, en streaming y con historial. Sin voz | I |
| 2 | Responde con cita | A medias | Solo 6 fusibles de la cabina, de terceros y sin página. El manual no está indexado | G, A |
| 3 | Abre la cámara en la pieza | Falta | `show_in_camera` y el evento `ar` están diseñados, no escritos | D |
| 4 | Encuentra el vano | Listo | En los videos del Outback real lo marca en todos los cuadros | — |
| 5 | Lo ancla en 3D | Hecho, sin probar en el teléfono | El anclaje funcionó sobre el auto. El escaneo por varias vistas, que arma el vano cuando no cabe en el cuadro, solo se verificó compilando | A |
| 6 | Ubica cada pieza | A medias | Plantilla del catálogo más un ajuste por apariencia que corre en el teléfono, solo para el Outback (PR #21). Sin error medido en cm sobre el auto (#17) | A, E |
| 7 | Resalta solo esa pieza | A medias | Chips por pieza y prisma elegido en ámbar, dibujados con Canvas. No oscurece el resto ni sigue el contorno real | B, C, F |
| 8 | Guía el paso y vuelve al chat | Falta | No hay instrucción sobre la cámara ni procedimientos por pasos | D, G |

Aparte: el auto se elige a mano entre 8 modelos (J) y el chat no ve la cámara (H). Las luces del tablero y las ampolletas (F4 y F5 del README) siguen sin empezar y este plan no las cubre.

Antes del ajuste de la PR #21, los centros de las piezas quedaban a 37–87 px en una foto de 1080 px: unos 5–12 cm si la foto cubre 1,5 m de vano, distancia que no está medida. Después del ajuste no hay número en cm. En el catálogo del Outback, la varilla y la tapa de aceite están a unos 8 cm.

## Cómo tomar una fase

- **Una fase = una rama desde `dev` = una PR a `dev`**, de 500 líneas como máximo sin contar tests ni datos. Si se pasa, se parte.
- **Para tomarla, abre la PR en borrador** con la letra en el título (`[B] Foco de luz`). La lista de PRs abiertas es el tablero: antes de empezar, revisa que nadie la tenga.
- **Quédate en tu zona.** Si necesitas tocar un archivo de otra fase, que sea el cambio mínimo y dilo en la PR.
- **El contrato de abajo es lo único compartido.** Si tienes que cambiarlo, edita este documento en la misma PR.
- Las reglas del [README](../README.md) (sección 9) siguen mandando: cita siempre, no inventes datos del auto, y a servicios externos solo va el recorte del vano.

## Contrato entre fases (propuesta)

- **Clave común:** `PartId` de `app/src/engine-maps/catalog.ts` (`fuses`, `washer`, `dipstick`, `coolant`, `air_filter`, `oil_cap`, `brake_fluid`, `battery`, `positive`).
- **D → cámara:** evento SSE `ar { part, instruction }` → `/escanear?vehicleId=…&part=…`. Es aditivo sobre el contrato del chat.
- **Cámara → B:** la prop nativa `selectedPart`, que ya existe. B cambia cómo se dibuja, no cómo se elige.
- **Nativo → C:** evento `onGuia { part, x, y, visible, distance }`, unas 10 veces por segundo, con la pieza elegida en pantalla y su distancia al teléfono.
- **E → cámara:** `POST /api/locate { image, parts }` → `{ parts: { [part]: { point: [x, y], mask?: [[x, y], …] } | null } }`. `null` = se usa la ubicación de hoy.
- **J → menú:** `POST /api/identify { image }` → `{ vehicleId: string | null, variant?: string }`, con `vehicleId` de `app/src/vehicles.ts`. `null` = no lo reconoce y se elige a mano.
- **G → chat:** pasos `{ text, part?, source, page }`. El `part` de un paso es lo que D manda a la cámara.

## Fases

**Modelo de visión (decidido el 21-11-2026): Claude Sonnet 5.5**, por OpenRouter como el chat. Lo usan E y J, con una llamada por foto. El vano y el anclaje siguen en el teléfono: el detector corre sin red cada 2,5 s y ARCore sostiene los puntos en cada cuadro, algo que un modelo en la nube no puede hacer.

### Guía visual (el foco)

**B · Foco de luz** — parte hoy.
- La pieza elegida queda a color; el resto se oscurece y pierde saturación, con borde suave y transición animada. Anillo y etiqueta sobre la pieza. Los prismas pasan al modo debug.
- Se dibuja en el mismo pase de GL que la cámara, no en Canvas ni en JS, para que la marca no vaya un cuadro atrás.
- **Zona:** `FondoCamara.kt` (shader), `CapaPoligono.kt` y el paso de la máscara en `CapoArView.kt`.
- **Listo cuando:** tocar un chip deja solo esa pieza iluminada y la marca no tiembla al mover el teléfono.
- **No cubre:** la forma sigue siendo la del prisma del catálogo, no el contorno real (F).

**C · Guiado espacial** — parte hoy.
- Flecha en el borde cuando la pieza queda fuera de cuadro, distancia a la pieza y un «la encontraste» con vibración al centrarla.
- **Zona:** `EscanerAR.tsx`, el evento `onGuia` en `CapoArModule.kt` y `expo-haptics` (dependencia nueva).
- **Listo cuando:** partiendo de espaldas a la pieza, la flecha te lleva hasta ella sin leer nada.
- **No cubre:** indicaciones por voz (I).

**E · Ubicar y recortar cada pieza** — el servidor parte hoy.
- `/api/locate`: manda el recorte del vano a Sonnet 5.5 y devuelve, por pieza, un punto y su contorno. Medir con fotos de prueba cuánto acierta.
- En el teléfono: al fijar, corregir la ubicación de cada pieza con ese punto. Sin red o sin respuesta, la ubicación de hoy.
- **Zona:** `api/src/locate/` (nuevo), un perfil en `api/src/llm/profiles.ts` y `EnginePartPlacement.kt`.
- **Listo cuando:** en las fotos de prueba no confunde la varilla con la tapa de aceite; en el auto, menos de 4 cm.
- **Espera:** la medida en cm, a la fase A. Si A muestra que el ajuste del teléfono ya acierta, de esta fase solo hace falta el contorno.
- **No cubre:** suma una llamada de red de varios segundos al fijar.

**F · Contorno real y oclusión** — después de B y E.
- El contorno que devuelve E se sube a 3D con la profundidad de ARCore al fijar y se reproyecta en cada cuadro: un solo cálculo, sin modelo en vivo.
- Oclusión con la profundidad de ARCore: la mano tapa la marca.
- **Zona:** `FondoCamara.kt` y `Profundidad.kt`. Va después de B porque tocan el mismo shader.
- **Listo cuando:** el brillo sigue el borde de la pieza y desaparece detrás de la mano.
- **Espera:** que el contorno de Sonnet sirva. Si sale muy grueso, esta fase entrega solo la oclusión.
- **No cubre:** si la pieza se mueve (sacas la tapa), el contorno queda donde estaba.

### Recorrido completo

**A · Validación en el auto** — necesita el Outback y el APK de `dev`; sin código.
- Probar en el teléfono lo que solo se verificó compilando: el escaneo por varias vistas, el mantener presionado y la corrección del zoom.
- Medir el error en cm de cada pieza (#17) y sacar fotos propias del vano con las piezas marcadas: el set de prueba de E.
- Probar qué fusible corresponde a cada ventana (para G).
- Grabar el mismo pedido en Gemini Live, moviéndose alrededor del auto.
- **Listo cuando:** hay un error en cm por pieza y un video del anclaje en el auto.

**D · Chat → cámara** (fase 2 del chat) — parte hoy.
- Herramienta `show_in_camera` y evento `ar`; tarjeta «Abrir cámara»; la cámara abre con la pieza elegida, la instrucción arriba y «Volver al chat»; respuestas rápidas al volver.
- **Zona:** `api/src/tools/`, `app/src/chat/`, `ask.tsx` y los parámetros de `escanear.tsx`.
- **Listo cuando:** la demo corre de punta a punta sin tocar el menú.
- **No cubre:** el chat sigue sin ver la cámara (H).

**G · Datos con cita** — parte hoy; falta descargar el PDF.
- `buscar_manual` sobre el PDF oficial (fuera del repo, regla 7); fusibles verificados con su página; procedimientos como pasos con pieza y página.
- **Zona:** `api/src/data/` y `api/src/tools/`.
- **Listo cuando:** «¿dónde está el sapito?» responde con la página del manual.

**H · Cámara → chat** — después de D.
- Botón de preguntar dentro de la cámara; el recorte del vano viaja con la pregunta («¿qué es esto?»).
- **Zona:** `app/src/chat/`, un botón en `escanear.tsx` y el contrato del chat.

**I · Voz** — vale más después de D.
- Dictado y lectura en voz alta sobre los mismos eventos del chat. El servidor no cambia.
- **Zona:** `app/src/chat/` y `ask.tsx`.
- **No cubre:** conversación continua como la de Gemini Live.

**J · Reconocer el auto** — parte hoy.
- Una foto del vano o del frente del auto va a Sonnet 5.5, que propone uno de los modelos de `vehicles.ts`. El usuario confirma antes de seguir: la variante exacta importa (regla 5).
- **Zona:** `api/src/identify/` (nuevo), un perfil en `api/src/llm/profiles.ts` y la selección de vehículo en `app/src/app/index.tsx`.
- **Listo cuando:** con una foto del Outback, la app lo propone y basta confirmar.
- **No cubre:** autos fuera de los 8 del catálogo ni distinguir el motor sin que el usuario confirme. Sin red, se elige a mano como hoy.

**Después:** piezas 3D animadas con Filament (la varilla saliendo), comprobar cada paso (si la tapa salió), la captura 3D por variante y más autos.

## Dónde se pueden pisar

| Archivo | Fases | Cómo evitarlo |
|---|---|---|
| `FondoCamara.kt` | B, F | F parte cuando B esté mergeada |
| `CapoArView.kt` (808 líneas) | B, C, E | Cada una agrega lo suyo en un archivo aparte y deja ahí solo la llamada |
| `EscanerAR.tsx` (626 líneas) | C, D, E | D entra por `escanear.tsx`; C va en un componente nuevo |
| `api/src/tools/index.ts` | D, G | Una línea cada una en el registro |
| `api/src/llm/profiles.ts` | E, J | El perfil de Sonnet lo agrega la primera que llegue; la otra lo reusa |

## Orden recomendado para la demo

1. B, C y D en paralelo: con las tres ya existe el recorrido completo con la guía nueva.
2. A en cuanto haya auto: es lo único que no se hace desde el computador.
3. E, y después F. J entra cuando haya manos: la demo funciona eligiendo el auto a mano.
4. Video lado a lado con Gemini Live y la ficha `platanus-hack-project.jsonc` (4 campos sin llenar).

## Decisiones abiertas

- **La historia de la demo no calza con la AR.** «Se me quedó abajo la ventana» lleva a la caja de la cabina; la AR cubre el vano. Propuesta: una historia bajo el capó. Los textos con página de las 9 piezas del Outback ya están en `partDetails` (`catalog.ts`); falta contrastarlos con el manual.
- **Qué pieza mostrar.** Si la ubicación acierta entre vecinas, la varilla. Si no, una pieza grande y aislada (batería, caja de fusibles).
- **Luces del tablero y ampolletas:** entran a la demo o se declaran fuera.

## Sin verificar

- El error real en cm sobre el auto.
- Qué tan bien devuelve Sonnet 5.5 puntos y contornos sobre una foto del vano, y el id del modelo en OpenRouter. Se prueba con las fotos de `docs/evidence/android-engine-maps/` antes de construir E.
- Si Gemini Live sostiene la marca al moverse.
- Que el Canvas de hoy vaya un cuadro atrás de la cámara: es lo esperable por cómo se dibuja, no está medido.
- La hora de entrega: no está en el repo, así que el orden no está ajustado a un plazo.
