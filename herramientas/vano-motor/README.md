# Vano del motor: contorno y esquinas

La app delimita **todo lo que hay bajo el capó** (no solo el motor): el polígono que forman el borde de los
guardabarros, la base del parabrisas y el frente del auto, con sus esquinas. Corre **en el teléfono**, sin internet.

## Cómo funciona

Un solo modelo ONNX int8 (`app/assets/modelo/vano-motor-int8.onnx`, ~91 MB, no va a git):

- **CLIPSeg rd64-refined** de [CIDAS](https://huggingface.co/CIDAS/clipseg-rd64-refined) (**Apache-2.0**), cuyo
  codificador es **CLIP ViT-B/16 de OpenAI (MIT)**, congelado.
- **Decodificador entrenado por nosotros** (`decodificador.safetensors`, 1,1 M de parámetros, 4,5 MB) y su vector
  condicional, ajustados a «vano del motor».

Salidas: `vano` (88×88, logits de «dentro del vano») e `image_embeds` (vector de CLIP para el puntaje de «capó
abierto», contra `app/src/detector/textos-vano.json`). En la app (`app/src/detector/vano.ts`): media móvil entre
cuadros → región más grande → envolvente convexa → ≤ 8 esquinas (las esquinas «biseladas» se juntan en el cruce de
las aristas vecinas). Las esquinas que tocan el borde de la imagen marcan que **parte del vano queda fuera del
cuadro** (vista parcial): la app pide alejarse. En **modo debug** el polígono se pinta en rojo claro.

`scripts/preparar-modelo-vano.sh` arma el ONNX (lo llama `scripts/compilar-apk.sh`).

## Anclaje con ARCore (contorno fijo al moverse)

Módulo nativo propio: `app/modules/capo-ar/` (Kotlin, ARCore 1.57). Se reconoce **una vez** y se engancha al
espacio real (`app/src/escaner/EscanerAR.tsx`):

1. **Buscando:** la vista AR entrega cuadros de su cámara (`capturar`, imagen ya derecha) → modelo → polígono de vista
   previa (ámbar punteado). En cada captura se guardan la pose de la cámara, sus intrínsecos y 49 distancias reales
   (grilla 7×7 de *hit tests*: profundidad de ARCore si el teléfono la tiene, si no puntos y planos detectados).
2. **Fijar:** al tener capó abierto + vano completo en la imagen + seguimiento AR durante 3 análisis seguidos (o con
   «Fijar ahora»), cada esquina se convierte en un rayo desde la cámara de ESA captura; la distancia sale de las
   muestras cercanas (si no hay, la mediana; si nada, 0,7 m) → un `Anchor` por esquina.
3. **Anclado:** el modelo se detiene; en cada cuadro las anclas se proyectan con la pose actual y el polígono (verde)
   se dibuja en nativo (Canvas), sin pasar por JavaScript. «Volver a detectar» suelta las anclas.

En el manifiesto ARCore es **opcional**: sin ARCore la app usa el escáner de fotos (`EscanerCamara.tsx`), cuyo
contorno no queda fijo. **Sin probar aún en un teléfono:** la precisión del anclaje depende de la profundidad que mida
ARCore sobre el motor (piezas brillantes u oscuras pueden dar pocas muestras; el modo debug muestra cuántas).

## Datos y entrenamiento

- **34 fotos de Wikimedia Commons** con capó abierto, anotadas a mano (`poligonos.json`, coordenadas 0-10 sobre el
  ancho y alto de cada foto de `indice.txt`) + 40 fotos sin capó abierto (máscara vacía). Las fotos no van a git
  (licencias de cada autor); `hojas.py` y `control.py` generan las hojas de anotación y de control.
- Aumentos: recortes aleatorios (simulan enfocar solo una parte del vano), proporciones distintas (la app aplasta el
  cuadro completo a 352×352), espejo, rotación leve, color.
- CLIP queda congelado; se entrenan el decodificador y el vector condicional (25 épocas, CPU, ~15 min).

## Medición (21-nov-2026)

IoU de máscara (1 = idéntica) contra los polígonos anotados, en fotos que el modelo **no vio**:

| | CLIPSeg sin entrenar | Entrenado |
|---|---|---|
| 6 fotos apartadas, vista completa | 0,53 | **0,74** |
| 6 fotos apartadas, recortes parciales | 0,54 | **0,77** |
| Foto de referencia del equipo (garaje), completa | 0,60 | 0,58 |

**Límite conocido:** en la foto de referencia el polígono se extiende a piezas de motor sueltas en el piso del
garaje y hacia arriba. Con 34 fotos de autos muy distintos el modelo aprende «parece motor», no siempre «está dentro
del vano». **Lo que más lo mejoraría:** fotos propias del **Outback** desde varios ángulos y distancias, anotadas
con el mismo criterio, para reentrenar (`entrenar.py`).

«Capó abierto» con el CLIP ViT-B/16 int8 del modelo (166 fotos, ver `herramientas/detector-capo/`): umbral 0,5 →
**97,6 %** de aciertos (36/36 detectados, 4/130 falsos positivos). ~180 ms por análisis en el servidor (4 hilos);
en el teléfono, sin medir.

## Reentrenar

```bash
python3 -m venv /tmp/venv-vano && /tmp/venv-vano/bin/pip install -r herramientas/vano-motor/requisitos.txt
# <fotos>/pos con los archivos de indice.txt y <fotos>/neg con fotos sin capó abierto
CAPO_REFERENCIA=referencia.webp /tmp/venv-vano/bin/python -I herramientas/vano-motor/entrenar.py <fotos> eval /tmp/prueba.safetensors
/tmp/venv-vano/bin/python -I herramientas/vano-motor/entrenar.py <fotos> final herramientas/vano-motor/decodificador.safetensors
scripts/preparar-modelo-vano.sh && node herramientas/vano-motor/probar-vano.ts
```
