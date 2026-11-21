# capo-ar: brief para mentoría

> Platanus Hack 26, track Physical World. Estado al 21-11-2026.
> Repo: <https://github.com/platanus-hack/platanus-hack-26-cl-team-3> · APK: <https://github.com/platanus-hack/platanus-hack-26-cl-team-3/releases/latest>

## Qué es

Una app Android. Apuntas la cámara al vano del motor y la app marca en realidad aumentada dónde están las piezas que un conductor revisa: el depósito del limpiaparabrisas (el «sapito»), la varilla y la tapa del aceite, el refrigerante, la caja de fusibles y la batería. También responde preguntas como «se me quedó abajo la ventana, ¿qué hago?» y **cita el manual del auto en cada respuesta**. Es una guía, no un mecánico.

## Problema

Mucha gente no sabe dónde están las cosas bajo el capó o no se atreve a revisarlas. Según encuestas de aseguradoras del Reino Unido (autodeclaradas), el 63 % no sabe revisar el aceite y el 29 % no sabe rellenar el sapito. Las razones principales son el miedo a dañar algo (≈29 %) y no saber cómo hacerlo (≈22 %). La guía en AR apunta justo a ese miedo.

**Diferencial:** ya hay apps que identifican piezas con la cámara, y los fabricantes tienen guías en AR para sus propios modelos. No encontramos una app multimarca que ancle la información sobre tu auto y cite el manual, aunque no está demostrado que no exista.

## Qué llevamos

| Pieza | Qué hace hoy | Qué falta o no está probado |
|---|---|---|
| **App Android** (Expo + React Native) | Menú, aviso legal obligatorio y selección del vehículo (8 modelos). El CI compila, verifica y publica el APK en cada push a `main`. Va en la build 9 (v0.7.0) | — |
| **Detector del vano del motor** | Corre en el teléfono, sin internet. Usa CLIPSeg (Apache-2.0) con un decodificador que entrenamos con frames de video (ONNX int8, ~91 MB). Detecta el contorno del vano y sus esquinas, y hace zoom automático cuando el vano sale chico en la imagen | Validarlo en el auto real con distinta luz y reflejos |
| **Anclaje AR** | Con ARCore y su mapa de profundidad, el vano se reconoce una vez y queda fijo aunque muevas el teléfono. Tiene un botón Recalibrar | Igual que arriba |
| **Piezas en AR** | Sobre el vano anclado se proyectan los volúmenes de 9 piezas del auto elegido, con contornos trazados sobre fotos de referencia (PR #18, mergeada). La PR #21, abierta, exige profundidad dentro del vano y afina la posición de cada pieza en el Outback a partir de 7 vistas reales | Antes de ese ajuste, en una foto de otro Outback 2016, los centros proyectados quedaban a 37–87 px de los reales (en una imagen de 1080 px de ancho). Falta calibrar en el auto físico (#17) |
| **Chat «Preguntar al manual»** | Un servidor propio (`api/`, TypeScript) llama a Claude Opus 5.5 por OpenRouter, y la key vive solo en el servidor. Busca en la tabla de fusibles y responde en streaming, con citas. La pantalla del APK guarda el historial. Está desplegado en `ph26.berguecio.cl/api/chat` | La tabla de fusibles viene de un sitio de terceros: falta verificarla en el auto y agregarle la página del manual. Todavía no busca en el manual completo |
| **PWA web** (`ph26.berguecio.cl`) | La versión anterior: menú y detector de «capó abierto», offline. Los mapas 3D web de los 8 autos están en la PR #1, abierta | Quedó como secundaria desde que decidimos que el producto es el APK |

## Cambios de rumbo

- **De PWA a APK nativo.** Partimos con una PWA y MindAR, pero MindAR no tiene SLAM ni profundidad: el overlay desaparece cuando la referencia sale de cuadro. Con ARCore nativo tenemos las dos cosas.
- **Anclaje automático en vez de manual.** El plan original era que el usuario tocara 2 o 3 puntos del capó. Terminamos detectando el vano con un modelo propio y anclándolo con la profundidad de ARCore.

## Demo objetivo

1. En el chat: «se me quedó abajo la ventana».
2. Respuesta: el fusible candidato y su amperaje, con la cita.
3. Botón «Abrir cámara»: la AR marca la caja de fusibles.
4. «Volver al chat»: «Listo, ¿qué sigue?».

Hoy el chat y la cámara funcionan por separado. Falta unirlos (fase 2 del chat).

## Riesgos y lo que no sabemos

1. **La AR no está validada en el auto real.** Es lo que más pesa en la demo.
2. **Datos sin verificar.** La tabla de fusibles es de terceros, y el manual oficial falta descargarlo e indexarlo.
3. **La historia de la demo no calza con la AR.** Según fuentes de terceros, los fusibles de los alzavidrios están en la caja de la cabina, bajo el tablero, pero la AR cubre el vano del motor.
4. **Partes del MVP sin empezar:** las luces del tablero y el cambio de ampolletas.
5. **Un solo auto físico.** Solo tenemos acceso al Subaru Outback 2016 3.6R. Los otros 7 mapas salen de fotos de referencia y no los hemos probado en un auto.

## Próximos pasos

1. Probar la AR en el Outback y calibrar las piezas (#17 y PR #21).
2. Verificar en el auto qué fusible corresponde a cada ventana y cargar la tabla con su página del manual.
3. Unir el chat con la cámara.
4. Hacer que el chat busque en el manual completo.
5. Completar la ficha del hackathon (`platanus-hack-project.jsonc`, que sigue vacía).

## Dónde nos sirve tu opinión

- Con el tiempo que queda, ¿centramos la demo en la AR bajo el capó o en el chat con citas?
- ¿Mantenemos la historia de la ventana (fusibles de la cabina) o la cambiamos por un caso bajo el capó, como rellenar el sapito o revisar el aceite?
- ¿Mostramos los 8 autos aunque solo el Outback esté validado, o nos quedamos con uno?
- ¿Cortamos las luces del tablero y las ampolletas del alcance?
