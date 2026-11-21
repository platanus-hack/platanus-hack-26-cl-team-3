#!/usr/bin/env bash
# Descarga el codificador de imagen de CLIP (detector de capó abierto) a app/assets/modelo/. No se sube a git (88 MB).
#   scripts/descargar-modelo.sh        # lo llama compilar-apk.sh; si ya está y el hash cuadra, no hace nada
#
# Modelo: OpenAI CLIP ViT-B/32 (licencia MIT), exportado a ONNX y cuantizado a int8 por Xenova, revisión fijada.
# Las descripciones de texto con las que se compara están precalculadas en app/src/detector/textos-clip.json
# (herramientas/detector-capo/generar_textos.py usa la misma revisión).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
REVISION=6b7c523703ae26e39be4b03774966f8571c7f523
URL="https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/$REVISION/onnx/vision_model_int8.onnx"
SHA=0ab0c1b3ace708e539633af1744d5a95247fe4e14d3e08ff197ef82a6cb9bd93
DESTINO="$RAIZ/app/assets/modelo/clip-vision-int8.onnx"

cuadra() { [ -s "$DESTINO" ] && echo "$SHA  $DESTINO" | sha256sum -c --status; }
if cuadra; then echo "modelo ya presente: $DESTINO"; exit 0; fi

mkdir -p "$(dirname "$DESTINO")"
echo "== bajando el modelo de reconocimiento (88 MB)"
curl -fL --retry 4 --retry-delay 3 -o "$DESTINO.parcial" "$URL"
mv "$DESTINO.parcial" "$DESTINO"
cuadra || { echo "ERROR: el sha256 del modelo no coincide; borro el archivo" >&2; rm -f "$DESTINO"; exit 1; }
echo "modelo listo: $DESTINO"
