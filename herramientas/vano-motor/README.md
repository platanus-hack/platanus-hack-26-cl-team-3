# Vano del motor: contorno y esquinas

La app delimita **todo lo que hay bajo el capó** (no solo el motor): el polígono que forman el borde de los
guardabarros, la base del parabrisas y el frente del auto, con sus esquinas. Corre **en el teléfono**, sin internet.

## Cómo funciona

Un solo modelo ONNX int8 (`app/assets/modelo/vano-motor-int8.onnx`, ~91 MB, no va a git):

- **CLIPSeg rd64-refined** de [CIDAS](https://huggingface.co/CIDAS/clipseg-rd64-refined) (**Apache-2.0**), cuyo
  codificador es **CLIP ViT-B/16 de OpenAI (MIT)**, congelado.
- **Decodificador entrenado por nosotros** (`decodificador.safetensors`, 1,1 M de parámetros, 4,5 MB) y su vector
  condicional, ajustados a «vano del motor».

Salidas: `vano` (88×88, logits de «dentro del vano») e `image_embeds` (vector de CLIP; el puntaje «capó abierto»
que sale de él quedó solo como dato de debug). En la app (`app/src/detector/vano.ts`): media móvil entre cuadros
(se reinicia si la escena cambió) → apertura morfológica (corta manchas sueltas y puentes delgados) → región más
grande → envolvente convexa → ≤ 8 esquinas (las «biseladas» se juntan en el cruce de las aristas vecinas).
**Hay vano** si la región tiene confianza media ≥ 0,7 y cubre ≥ 3 % del cuadro (`app/src/escaner/comun.tsx`). Las
esquinas que tocan el borde de la imagen marcan que **parte del vano queda fuera del cuadro** (vista parcial). En
**modo debug** el polígono se pinta en rojo claro.

**Zoom automático** (`app/src/detector/encuadre.ts`): el modelo ve la imagen reducida a 352×352, y la captura abarca
más que lo que muestra la pantalla del teléfono; si el vano ocupa poco del cuadro (auto lejos, o una foto del auto
completo en un monitor) no lo reconoce. Medido con una grabación real del equipo: con el cuadro completo, 0 %; con un
recorte ampliado, vano detectado con 95 % de confianza. Por eso, sin detección se alterna cuadro completo → recorte
central (60 %) → recorte central (40 %); con detección, el recorte sigue al vano para que ocupe ~30 % de lo que ve
el modelo y se aleja si el vano toca el borde del recorte. El contorno siempre se entrega en coordenadas del cuadro
completo. Recalibrar y el calce analizan un recorte alrededor del contorno anclado.

`scripts/preparar-modelo-vano.sh` arma el ONNX (lo llama `scripts/compilar-apk.sh`).

## Anclaje con ARCore (contorno fijo al moverse)

Módulo nativo propio: `app/modules/capo-ar/` (Kotlin, ARCore 1.57). Se reconoce **una vez** y se engancha al
espacio real (`app/src/escaner/EscanerAR.tsx`):

1. **Buscando:** la vista AR entrega cuadros de su cámara (`capturar`, imagen ya derecha) → modelo → polígono de vista
   previa (ámbar punteado). En cada captura se guardan la pose de la cámara y el **mapa de profundidad completo** de
   ARCore (`Profundidad.kt`: miles de puntos, p. ej. 160×90; antes eran 49 *hit tests*, que quedan de respaldo si el
   mapa aún no está disponible).
2. **Fijar:** con contorno válido + vano completo en la imagen + seguimiento AR + ≥ 500 puntos de profundidad durante
   3 análisis seguidos (o con «Fijar ahora»). Con los puntos que caen **dentro del polígono** se ajusta un plano
   (RANSAC + mínimos cuadrados):
   - **`plano`** (≥ 75 % de los puntos sobre el plano: una pantalla, una foto, una superficie plana): las esquinas se
     ponen sobre ese plano → contorno rígido y coplanar.
   - **`relieve`** (un vano real, con piezas a distintas alturas): cada esquina usa la profundidad mediana de los
     puntos cercanos dentro del polígono.
   Cada esquina queda como un `Anchor`. Se informan: puntos usados, % sobre el plano, dispersión (cm), inclinación de
   la superficie (0° horizontal, 90° vertical) y ángulo de vista (0° de frente).
3. **Anclado:** en cada cuadro las anclas se proyectan con la pose actual y el polígono (verde) se dibuja en nativo
   (Canvas), sin pasar por JavaScript.
   - **Calce:** cada 2,5 s se corre el modelo y se compara el contorno anclado con la detección nueva (IoU, promedio
     de las últimas 3). Mide cuánto se corrió el anclaje; bajo 50 % la app sugiere recalibrar.
   - **Recalibrar:** reconoce de nuevo desde donde está el teléfono y reemplaza las anclas (hasta 3 intentos; si no
     reconoce, el contorno anterior se mantiene). Para la deriva de ARCore tras alejarse y volver.
   - **Empezar de nuevo:** suelta las anclas y vuelve a buscar.

El modo debug muestra, mientras busca, **detección n/total** (análisis con contorno válido) y los puntos de
profundidad; y ya anclado, el método, los puntos, el plano y el **calce**. Con eso se compara una versión con otra.

En el manifiesto ARCore es **opcional**: sin ARCore la app usa el escáner de fotos (`EscanerCamara.tsx`), cuyo
contorno no queda fijo. Probado en un teléfono apuntando a una pantalla (21-nov-2026, con la versión de 49 medidas):
seguimiento, profundidad y anclaje funcionan, ~500 ms por análisis. **El anclaje con el mapa completo (v0.6.0) y el
calce aún no se probaron en un teléfono; tampoco nada sobre el Outback real.** La matemática del plano se verificó
con datos sintéticos.

## Prueba sobre el Outback real y escaneo (21-nov-2026)

Primera prueba sobre el auto (Outback 2016 3.6R), con grabaciones de pantalla y cuatro videos del vano.

**Qué se midió** (23 cuadros de esos videos y un banco de pruebas que corre el modelo real y la lógica de la app
sobre las secuencias):

- El modelo **sí reconoce el vano real**: lo marca en los 23 cuadros y en el 100 % de los cuadros de las cuatro
  secuencias. Por eso no se reentrenó con estos videos: el problema no era el modelo.
- Desde la distancia real de uso, en **ningún cuadro el vano cabe completo** (0 de 82). La app exigía verlo completo
  para fijarlo solo, así que no lo fijaba y pedía «aléjate».
- El zoom automático **oscilaba** con vanos anchos y bajos (el vano visto de frente es una franja): recortaba por
  área, cortaba la franja por los lados y descartaba la detección. En pantalla se veía «Buscando» con 94 % de
  confianza. Corregido: si el recorte actual ya da una detección válida, no se toca. En secuencias con el vano chico
  pasó de 21/24 a 24/24 cuadros válidos.
- El anclaje con ARCore funcionó sobre el auto: 4.430 puntos de profundidad, superficie a 4° de la horizontal.

**Escaneo** (`Escaneo.kt`, `EscanerAR.tsx`). Cada cuadro con vano y profundidad se suma a un mapa del vano en el
mundo: sus puntos de profundidad, ubicados con la pose del teléfono, se proyectan sobre el plano del vano (fijado con
el primer cuadro) y votan «vano / no vano» en una grilla de 88×88 celdas (3,2 m de lado). Lo que queda a más de 60 cm
del plano (el piso) no entra. Del mapa sale el contorno con el mismo código de siempre (`poligonoVano`), que se
muestra **pegado al mundo** mientras se escanea. Se fija solo cuando hay ≥ 5 vistas, el área del contorno varía menos
de 8 % en tres análisis y, como control cruzado, coincide ≥ 50 % con lo que el modelo ve en el cuadro actual
(«acuerdo» en debug). Así el vano se arma completo aunque nunca quepa entero en la imagen.

**Marcar a mano (recuadro).** Con el botón «Marcar a mano» el usuario **presiona en una esquina del vano y arrastra
hasta la opuesta**: se forma un recuadro que crece con el dedo y debe cubrir todo lo que está bajo el capó. Al soltar,
el módulo nativo registra ese instante como captura (pose y profundidad, `capturarTrazo`) y devuelve el borde del
recuadro en coordenadas de la imagen; la app lo convierte en contorno (`vanoDeTrazo`) y lo fija por el mismo camino
que uno detectado, incluido el registro del mapa de piezas. La precisión la pone la persona que mira el auto, no el
modelo. Mientras se marca, la detección automática se detiene. La app lo sugiere cuando menos de la mitad de los
análisis encuentra el vano. Historia: primero fue «mantener presionado» sobre el motor, después un lazo libre; quedó
el recuadro porque es el gesto más fácil. Límite: se convierte con la pose del momento en que se levanta el dedo, así
que hay que marcar con el teléfono quieto; y un recuadro alineado con la pantalla no sigue un vano visto en diagonal.

**Sin probar en un teléfono:** el escaneo, el recuadro y la corrección del zoom. La geometría de la app
tiene pruebas (`probar-vano.ts`); la parte nativa del escaneo solo se verificó compilando.

## Datos

- **34 fotos de Wikimedia Commons** con capó abierto, anotadas a mano (`poligonos.json`, coordenadas 0-10 sobre el
  ancho y alto de cada foto de `indice.txt`) + 40 fotos sin capó abierto (máscara vacía).
- **68 cuadros de 12 videos de YouTube** (`videos.json`): 43 con polígono, 18 primeros planos desde dentro del vano
  («full») y 7 sin vano. Se revisaron 21 videos y se descartaron 9 (diapositivas, gente hablando, solo primeros planos
  o tomas bajo el auto). Hay varios Subaru Outback (3.6R incluido), Forester, Corolla, Civic, Honda Fit y un clase G.
- La **foto de referencia del equipo** (garaje) con el polígono de 5 esquinas que marcó el equipo.
- Ni fotos ni videos van a git (son de sus autores): `bajar_videos.py` vuelve a bajar los videos y extraer los cuadros.
- Aumentos: recortes aleatorios (simulan enfocar solo una parte del vano), proporciones distintas (la app aplasta el
  cuadro completo a 352×352), espejo, rotación leve, color. CLIP queda congelado; se entrenan el decodificador y el
  vector condicional (20 épocas, CPU).

## Medición (21-nov-2026)

Entrenando **sin** dos videos completos (Honda Fit y un Outback vertical) ni la foto de referencia, y midiendo en
ellos. «Anterior» = decodificador entrenado solo con las 34 fotos.

| En datos que el modelo no vio | Anterior | Nuevo |
|---|---|---|
| IoU del contorno, cuadros con polígono (5, vista completa) | 0,72 | 0,68 |
| IoU del contorno, recortes parciales (15) | 0,78 | 0,70 |
| IoU en primeros planos dentro del vano (3) | 0,91 | 0,97 |
| Cuadros sin vano: fracción marcada como vano (2) | 0,05 | 0,00 |
| Foto de referencia, vista completa | 0,58 | 0,54 |
| Estabilidad en video (IoU entre cuadros a 0,2 s): Pontiac, nunca visto | 0,73 | 0,77 |
| Estabilidad: Outback vertical | 0,94 | 0,96 |
| Tramo sin vano del Honda Fit (12 s): cuadros con falsa detección | 28 % | 2 % |

**Lectura honesta:** los videos **no mejoraron la precisión del borde** en autos no vistos (0,68 vs 0,72, con solo
5 cuadros: dentro del ruido); sí dieron **menos falsas detecciones** y un contorno **más estable al mover la cámara**.
El modelo final se entrena además con esos dos videos y con la foto de referencia (por eso en esa foto ahora calza
con el polígono del equipo: no cuenta como prueba de generalización).

Detección con el modelo final (confianza ≥ 0,7 y área ≥ 3 %): 1 falsa alarma en 130 fotos sin vano (40 de ellas
usadas en el entrenamiento); 35 de 36 fotos con vano (34 de entrenamiento).

**Lo que más lo mejoraría:** fotos o un video propio del **Outback** desde varios ángulos y distancias, anotados con
el mismo criterio. El límite actual es la cantidad y precisión de las anotaciones, no el entrenamiento.

## Reentrenar

```bash
python3 -m venv /tmp/venv-vano && /tmp/venv-vano/bin/pip install -r herramientas/vano-motor/requisitos.txt
python3 herramientas/vano-motor/bajar_videos.py <datos>          # <datos>/video; además <datos>/pos y <datos>/neg
export CAPO_REFERENCIA=referencia.webp CAPO_ANTERIOR=herramientas/vano-motor/decodificador.safetensors
/tmp/venv-vano/bin/python -I herramientas/vano-motor/entrenar.py <datos> eval /tmp/prueba.safetensors   # mide
/tmp/venv-vano/bin/python -I herramientas/vano-motor/entrenar.py <datos> final herramientas/vano-motor/decodificador.safetensors
/tmp/venv-vano/bin/python -I herramientas/vano-motor/estabilidad.py nuevo=/tmp/prueba.safetensors <datos>/videos/VmWr7JCogyY.mp4@0@15@crop=205:360:218:0
scripts/preparar-modelo-vano.sh && app/node_modules/.bin/tsx herramientas/vano-motor/probar-vano.ts
```
