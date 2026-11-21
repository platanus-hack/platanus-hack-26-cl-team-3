# Detector de capó abierto

Reconoce si la cámara está viendo un **capó abierto (vano motor)**. Corre **dentro del teléfono**, sin internet: las
imágenes no salen del dispositivo (README, regla 8).

## Cómo funciona

Zero-shot con [CLIP ViT-B/32 de OpenAI](https://github.com/openai/CLIP) (**licencia MIT**), versión ONNX cuantizada a
int8 de [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) (revisión fijada en los scripts).

1. La app toma una foto, recorta el **cuadrado central** y la reduce a 224×224 (`app/src/detector/detector.ts`).
2. El codificador de imagen (88,6 MB, `app/assets/modelo/clip-vision-int8.onnx`, lo baja `scripts/descargar-modelo.sh`)
   produce un vector.
3. Se compara con 20 vectores de texto precalculados (`app/src/detector/textos-clip.json`): 4 descripciones de capó
   abierto y 16 de distractores (capó cerrado, tablero, maletero, calle…). El puntaje es la probabilidad sumada de las
   de capó abierto.
4. La pantalla suaviza el puntaje (media móvil) con histéresis: entra a «detectado» con ≥ 0,6, sale con < 0,45.

Se descartó **MobileCLIP** (12 MB, más rápido) porque su licencia de pesos (`apple-amlr`) es de investigación.

## Medición (21-nov-2026)

166 fotos de Wikimedia Commons revisadas a mano: 36 de capó abierto, 130 de otras cosas (autos cerrados, tableros,
maleteros abiertos, ruedas, calles, interiores). Modelo int8, el mismo del APK:

| Umbral | Aciertos | Capós detectados | Falsos positivos |
|---|---|---|---|
| 0,5 | 94,0 % | 34/36 | 8/130 |
| **0,6** | **95,8 %** | 33/36 | 4/130 |
| 0,7 | 96,4 % | 32/36 | 2/130 |

Los falsos positivos fueron sobre todo **tableros** y **frentes de auto**. El modelo sin cuantizar (352 MB) da 97,0 % con
umbral 0,6: la cuantización cuesta poco.

**Límites:** son fotos de terceros, no del Outback, y pocas. **Falta medir con fotos propias del capó del Outback** (con
distinta luz y distancia) y el tiempo por análisis en teléfonos reales.

## Repetir la evaluación

```bash
python3 -m venv /tmp/venv-clip && /tmp/venv-clip/bin/pip install onnxruntime numpy tokenizers pillow
# Fotos: carpeta con pos/ y neg/. Para una rápida desde Wikimedia (REVÍSALAS: la búsqueda trae ruido):
/tmp/venv-clip/bin/python -I herramientas/detector-capo/bajar_fotos.py /tmp/fotos 14 "pos|engine bay" "neg|car dashboard instrument cluster"
/tmp/venv-clip/bin/python -I herramientas/detector-capo/evaluar.py /tmp/fotos
```

Si cambias las descripciones en `generar_textos.py`, regenera el JSON y vuelve a evaluar:

```bash
/tmp/venv-clip/bin/python -I herramientas/detector-capo/generar_textos.py
```
