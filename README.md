# capo-ar — Guía de tu auto en Realidad Aumentada

> Documento de contexto para el equipo **y para sus agentes de IA**. Léelo completo antes de tocar código.
> Estado: **MVP inicial** (hackathon). La app (`app/`, Expo + React Native + expo-router) tiene menú principal, aviso obligatorio y **detector de capó abierto en el teléfono** (CLIP, ver `herramientas/detector-capo/`). Sin AR todavía.
>
> **Compilar el APK** (en el servidor del equipo): `scripts/compilar-apk.sh` → `dist/capo-ar.apk` (baja el modelo de 88 MB la primera vez). Requisitos y protecciones de memoria, en el propio script. Sube `version` y `android.versionCode` en `app/app.json` antes de cada APK nuevo.

---

## Web app and release

The installable PWA ports the menu and open-hood detector from native revision
`317e8367`. Select **Escanear capó**, enable the camera and aim at an open
engine bay. Frames stay on the device. A module worker runs the pinned
quantized CLIP image encoder with ONNX Runtime Web, using the native prompt
vectors, smoothing and thresholds. At build time, the patch-convolution weights
and zero point both shift by 128 to use the unsigned WASM kernel while
preserving each centered weight. The score indicates an open hood. Individual
part identification and AR anchoring are future features.

### Start with Compose

From a checkout containing the root `docker-compose.yml`, start the PWA on the
existing home proxy network with one command:

```sh
docker compose up
```

Compose builds the image on first use. The build installs its own dependencies
and packages the model and the web runtime. Traefik routes requests for
`ph26.berguecio.cl` to port 8080 in the container.

For a local preview without Traefik:

```sh
docker build -t capo-ar .
docker run --rm -p 127.0.0.1:8080:8080 capo-ar
```

Open `http://localhost:8080`. Phones require HTTPS for camera access.
The first visit downloads the app, model (about 89 MB) and WASM runtime.
Once the service worker finishes caching, scanning works offline. The image
also serves the map viewer if its files are present in the checkout.

### Compose and CI

This project uses the same hackathon repository for the PWA and its Compose
configuration. Pull requests and pushes to `main` verify the image on
GitHub-hosted runners. Compose carries this repository's numeric ID and uses
`CAPO_AR_DOMAIN` for the hostname. The default is `ph26.berguecio.cl`.
The starter's private-runner release jobs stay disabled in this public
repository. Production runner eligibility and the initial installation are
deferred to issue #2.

## 1. Qué es, en una frase

Una app Android que, al apuntar la cámara al capó (o al tablero) de tu auto, **muestra en Realidad Aumentada dónde están y cómo se revisan las cosas básicas** (caja de fusibles, depósito del limpiaparabrisas, varilla del aceite, refrigerante, filtro de aire, ampolletas) y responde en lenguaje natural «¿cómo cambio este fusible?», **siempre citando el manual del auto**.

Es una **guía**, no un mecánico. Ver sección 9 (aviso obligatorio).

## 2. Contexto del hackathon

- Tema elegido: **Physical World** — tomar inputs del mundo real (aquí: la cámara del teléfono apuntando a un auto real) y crear algo útil con ellos.
- Existe también un track de **Hardware**. La idea actual es 100 % software; no bloquea una extensión de hardware más adelante (p. ej. una sonda de fusibles con ESP32), pero **no es parte del MVP**.

## 3. El problema (dolor)

Mucha gente no se atreve a hacer revisiones básicas de su auto, o ni siquiera sabe dónde están las cosas. Datos encontrados (encuestas mayormente de Reino Unido, de aseguradoras/empresas de asistencia, autodeclaradas; úsalas como indicio, no como verdad absoluta):

- 63 % no sabía revisar el nivel de aceite; 1 de cada 5 no identificaba la varilla; 29 % no sabía rellenar el depósito del limpiaparabrisas — [Fleet News](https://www.fleetnews.co.uk/news/2014/11/12/three-in-ten-can-t-locate-washer-bottle/54053/), [Shropshire Star](https://www.shropshirestar.com/news/motors/2023/01/19/quarter-of-drivers-cant-identify-whats-under-a-cars-bonnet--survey).
- 6 de cada 10 no podían cambiar una ampolleta de faro — [PR Newswire](https://www.prnewswire.co.uk/news-releases/millions-of-brits-admit-being-bamboozled-by-basic-car-maintenance---following-recent-research-from-accident-advice-helpline-611169015.html).
- Razones para no hacerlo: miedo a dañar algo (≈29 %) y no saber cómo (≈22 %) — [Motor1](https://www.motor1.com/news/725197/uk-drivers-essential-maintenance-survey/). **Por eso la guía paso a paso con AR ataca el miedo a equivocarse.**

Dolor concreto de partida: «No puedo prender una luz de mi auto» → ¿ampolleta o fusible? ¿dónde está? ¿cuál compro? ¿cómo la cambio?

## 4. Diferenciador y competencia

- Ya existen apps de IA que *identifican* piezas con la cámara (PartsIQ, Part Identifier Plus, ScanPart, CarSight — listados de App Store, sin reseñas independientes que hayamos visto).
- Las guías AR de fabricantes (Hyundai/Genesis Virtual Guide, Ask Mercedes, Ford) son por marca y modelos concretos, con poco contenido AR.
- **Nuestro diferencial:** (1) la información **anclada en AR sobre tu propio auto**, no solo texto; (2) **guía por modelo y año**; (3) **toda respuesta con fuente citada** del manual.
- No encontramos una app multimarca que haga exactamente esto, pero **no está demostrado que no exista**. No lo afirmen en la presentación como hecho.

## 5. Alcance del MVP (muy reducido a propósito)

**Usuario objetivo:** conductor básico. (Mecánicos = futuro, ver sección 10.)

| # | Feature | Qué debe hacer |
|---|---|---|
| F1 | **Mapa 3D simple de elementos del capó** | Modelos 3D sencillos (cajas, cilindros, flechas) de: caja de fusibles, depósito limpiaparabrisas («el sapito» en Chile), varilla del aceite, depósito de refrigerante, caja del filtro de aire. Ubicados según fotos y diagramas del manual. **No es un modelo CAD del auto completo.** |
| F2 | **AR sobre el capó real** | Al apuntar la cámara, esos elementos aparecen superpuestos en su sitio, con etiqueta. |
| F3 | **Pregunta en lenguaje natural** | «¿Cómo cambio un fusible?» → respuesta paso a paso **con cita (manual, sección, página)** y la AR resalta la pieza relevante. |
| F4 | **Luces del tablero** | Apuntar al tablero con una luz encendida → nombre del indicador + qué significa + qué hacer, **según el manual del auto**. |
| F5 | **Ampolleta** | «Se quemó una luz» → qué ampolleta lleva (según manual) y cómo cambiarla. |

**Fuera del MVP:** modo mecánico, más de 2 autos, tienda/compra de repuestos, OBD2, iOS, hardware, cualquier dato con licencia de pago.

## 6. Autos del MVP

- **Auto de pruebas físico (obligatorio): Subaru Outback 2016, motor 3.6 (EZ36, versión «3.6R»).** Es el único auto al que el equipo tiene acceso físico hoy. Todo lo de AR se prueba aquí.
- **Segundo auto (pendiente de decidir):** la idea original era un auto «muy genérico» con información pública abundante, p. ej. **Toyota Corolla**. Sin acceso físico a un Corolla, solo podríamos cubrir la parte de **datos/manual/chat (F3, F4, F5)**, no la parte de AR. **Decisión abierta:** conseguir acceso a un segundo auto (de un integrante o conocido) o dejar el MVP con un auto y mostrar el segundo solo en la capa de datos.

### Fuentes públicas conocidas

| Auto | Fuente | Notas / cautelas |
|---|---|---|
| Subaru Outback 2016 | Copias del manual de dueño: [ManualMachine](https://manualmachine.com/subaru/outback2016/3856888-user-manual), [Scribd](https://www.scribd.com/document/669774538/2016-Subaru-Outback-12), [ManualsFile (3.6R Limited, 566 págs.)](https://manualsfile.com/product/po6htck0oy.html) | **Son copias de terceros; no encontramos el PDF oficial de Subaru.** Contrastar contra el manual físico de la guantera del auto. |
| Subaru Outback 2016 | Diagrama de fusibles: [autogenius.info](https://www.autogenius.info/subaru-outback-2016-fuse-box-diagram) | Tercero. **No se confirmó si el 3.6R usa el mismo layout que el 2.5i.** Verificar contra el auto real. |
| Toyota Corolla | Manuales oficiales en PDF: [toyota.ca](https://www.toyota.ca/content/dam/toyota/documents/manuals/en/OM12E95U/OM12E95U.pdf), [assets.sia.toyota.com](https://assets.sia.toyota.com/publications/en/om-s/OM12M01U/pdf/OM12M01U.pdf) | Cada manual trae «Indicators and warning lights». Hay que fijar el **año exacto** (cambia de generación). |
| Cualquiera | Decodificar VIN → marca/modelo/año: [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Gratis; **no** trae fusibles ni piezas. |
| Cualquiera | Diagramas de fusibles por modelo vía API de terceros ([parse.bot / StartMyCar](https://parse.bot/marketplace/5f307be1-c720-49a8-9004-39a836115998/startmycar-com-api)) | Revisar términos, precio y cobertura antes de depender de ella. |

**Datos que NO tenemos y no debemos inventar:** modelos 3D/CAD del fabricante, datos de taller (ALLDATA, Mitchell, HaynesPro — de pago), y tabla pública de ampolletas por API (Sylvania/Philips/Bulbs.com tienen buscadores web pero **sin API pública**; raspar sus datos probablemente viola sus términos). Para las ampolletas del MVP: **leerlas del manual del auto** y/o armar la tabla a mano para el Outback.

## 7. Arquitectura propuesta (a validar por el equipo)

> Todo lo de esta sección es **propuesta**, no decisión tomada, salvo la plataforma.

- **Plataforma: Android** (decidido; más fácil generar APK y todo el equipo usa Android).
- **Capa de datos (offline, preprocesada):** manuales en PDF → texto troceado con metadatos `{auto, año, motor, fuente, página, sección}`. Cada fragmento guarda su procedencia.
- **Asistente (F3/F5):** recuperación de pasajes del manual + LLM que **responde solo con lo recuperado**. Si el manual no lo dice, responde «no lo encuentro en el manual». Proyectos de referencia: [Toyota/Lexus RAG](https://huggingface.co/ClaudioCela/toyota-lexus-rag-assistant), [AutoMate](https://awesome.ecosyste.ms/projects/github.com%2Finsafhamdi%2Fautomate-a-retrieval-augmented-ai-chatbot-for-car-assistance). Ninguno muestra citas: **la cita (página/sección) hay que construirla nosotros.**
- **Luces del tablero (F4):** clasificador de imagen o modelo de visión; datasets abiertos pequeños en Roboflow (p. ej. [Dashboard icons, 18 clases](https://universe.roboflow.com/shourya-chambial-axqy0/dashboard-icons)) — **licencias sin verificar**. Significado y acción salen del manual.
- **Modelos 3D (F1):** Blender → glTF/GLB, formas simples.
- **AR (F2):** ARCore sobre Android. Motor/UI por decidir (Kotlin nativo + ARCore, o Unity AR Foundation). Decidirlo tras la prueba de anclaje (sección 8, paso 1).

### Riesgo principal: anclar el 3D al capó real

Es la parte más incierta. Evidencia disponible:
- Vuforia Model Targets rastrea por forma pero **requiere un modelo CAD o escaneo 3D** del objeto.
- El rastreo de objetos de ARKit exige escaneo previo (iOS, no aplica). Un foro antiguo y anecdótico dice que ARCore no tiene rastreo de objetos 3D nativo.
- **No encontramos evidencia de rastreo sin marcadores de un capó sin modelo previo.**

**Plan de mitigación (idea nuestra, aún NO probada):** anclaje asistido por el usuario. El usuario toca 2–3 puntos de referencia fijos del capó (p. ej. centro de la batería, una esquina del motor); la app coloca el modelo respecto a ellos y lo sostiene con el seguimiento de movimiento (SLAM) de ARCore. Mejora posible después: reconocimiento automático. **Probar esto antes que cualquier otra cosa.**

## 8. Orden de trabajo (paquetes paralelizables)

1. **Prueba de anclaje AR** — cubo/flechas sobre el capó del Outback con puntos de referencia. Si falla, decidir rumbo aquí. *(Bloqueante del resto de AR.)*
2. **Capa de datos y asistente con citas** — manual del Outback → fragmentos con procedencia → preguntas en lenguaje natural. *(Independiente de AR; paralelizable desde el día 1.)*
3. **Fotos y medidas del capó del Outback** + modelos 3D simples de las 5 piezas ubicados según fotos/manual.
4. **Luces del tablero** — fotos propias del tablero del Outback + clasificador/modelo; significado desde el manual.
5. **Integración** — la pregunta del usuario dispara la guía y la AR resalta la pieza.

## 9. Reglas del proyecto (para humanos y agentes)

1. **Aviso obligatorio en la app** (visible en primer uso y accesible siempre): *«Esta app es una guía informativa. No reemplaza el manual del propietario ni a un mecánico. Confirma siempre con el manual de tu vehículo antes de actuar.»* Ya validado con el equipo.
2. **Toda respuesta muestra su fuente** (documento, sección, página). Sin fuente → no se afirma.
3. **No inventar datos de autos.** Si no hay dato público verificable, la app dice «no disponible». Nunca rellenar de memoria el tipo de ampolleta, refrigerante, amperaje de fusible, etc.
4. **No afirmar ausencias de peligro** (p. ej. «aquí no hay cableado de alto voltaje»). La app muestra lo que el manual dice, no lo que *no* hay.
5. **Variante exacta importa:** año + motor. El 3.6R no es el 2.5i; un diagrama del 2.5i **no se asume válido** para el 3.6R sin verificarlo en el auto.
6. **Fuentes de terceros** (copias de manuales, sitios de fusibles) se marcan como tales y se contrastan con el auto/manual físico.
7. **Licencias:** revisar licencia de cada dataset/modelo/manual antes de redistribuirlo. Los manuales se citan y enlazan; **no redistribuir PDFs** en el repositorio sin confirmar que se puede.
8. **Privacidad:** no subir fotos de personas, patentes ni datos personales a servicios externos.
9. **No usar la identidad personal de integrantes** (nombres, correos) en el repositorio público ni en requests a servicios externos.

## Chat «Preguntar al manual»

El APK conversa con el servidor `api/`, que corre las herramientas y llama al modelo por OpenRouter. La key vive solo en el servidor.

1. **Servidor:** el servicio `api` del `docker-compose.yml` necesita `OPENROUTER_API_KEY` en el entorno del host. En local: `cd api && npm ci && OPENROUTER_API_KEY=… node server.js` (puerto 8787). Tests: `cd api && npm test`.
2. **APK:** crea `app/.env.local` con `EXPO_PUBLIC_API_URL=https://ph26.berguecio.cl` (no se commitea) y recompila. Tiene que ser HTTPS: el APK release bloquea HTTP en claro. Tests: `cd app && npx tsx --test src/chat/*.test.ts`.

## 10. Futuro (fuera del MVP)

- **Modo mecánico:** contenido avanzado (rutas de correa, mangueras, torques). Requiere datos de taller con licencia (ALLDATA, Mitchell, HaynesPro); dejar la arquitectura de datos abierta a esa capa.
- Más autos, con comunidad aportando fotos y marcas.
- Hardware (track aparte): sonda de fusibles con ESP32 que reporta al teléfono. *Idea sin investigar.*

## 11. Cosas que NO sabemos aún (investigar o probar)

- Si el anclaje asistido por puntos de referencia es estable en un capó real (reflejos, suciedad, luz).
- Cobertura real de los manuales del Outback 2016 3.6R: diagrama del capó, tabla de ampolletas, fusibles, luces del tablero. (Las copias de terceros existen; falta revisarlas página por página.)
- Licencias de los datasets de Roboflow y de uso de los manuales.
- Precisión del reconocimiento por cámara para las piezas del capó (no hay benchmark público; hay que medir con fotos propias).
- Si ya existe una app multimarca equivalente que no hayamos encontrado.

## 12. Glosario

- **El sapito:** depósito del líquido limpiaparabrisas (Chile).
- **Varilla / medidor de aceite:** *dipstick*.
- **AR:** Realidad Aumentada.
- **RAG:** respuesta generada a partir de pasajes recuperados de documentos propios (aquí, los manuales).
- **EZ36 / 3.6R:** motor boxer de 6 cilindros 3.6 L del Outback de la época.
