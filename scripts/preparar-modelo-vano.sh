#!/usr/bin/env bash
# Genera el modelo del vano del motor para la app: app/assets/modelo/vano-motor-int8.onnx (~90 MB, no va a git).
#   scripts/preparar-modelo-vano.sh     # lo llama compilar-apk.sh; si ya existe y salió de los mismos pesos, no hace nada
#
# Se arma con: CLIPSeg rd64-refined (CIDAS, Apache-2.0; CLIP ViT-B/16 congelado), revisión fijada, que se baja de
# Hugging Face + el decodificador que entrenamos (herramientas/vano-motor/decodificador.safetensors, en git).
# La primera vez crea un entorno de Python en ~/.cache/capo-ar/venv-vano (PyTorch CPU, ~1 GB) y baja ~600 MB de pesos.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
HERR="$RAIZ/herramientas/vano-motor"
DESTINO="$RAIZ/app/assets/modelo/vano-motor-int8.onnx"
SELLO="$DESTINO.fuente"
VENV="${CAPO_VENV_VANO:-$HOME/.cache/capo-ar/venv-vano}"

fuente=$(cat "$HERR/decodificador.safetensors" "$HERR/exportar.py" "$HERR/requisitos.txt" | sha256sum | cut -d' ' -f1)
if [ -s "$DESTINO" ] && [ "$(cat "$SELLO" 2>/dev/null)" = "$fuente" ]; then
  echo "modelo del vano ya presente: $DESTINO"; exit 0
fi

if [ ! -x "$VENV/bin/python" ] || ! cmp -s "$HERR/requisitos.txt" "$VENV/requisitos.txt"; then
  echo "== preparando el entorno de exportación en $VENV (una vez)"
  rm -rf "$VENV"; python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$HERR/requisitos.txt"
  cp "$HERR/requisitos.txt" "$VENV/requisitos.txt"
fi

mkdir -p "$(dirname "$DESTINO")"
CONTENER=()
if systemd-run --user --scope -q -p MemoryMax=3G true 2>/dev/null; then
  CONTENER=(systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=1G)
fi
echo "== exportando el modelo del vano (CLIPSeg + decodificador entrenado → ONNX int8)"
choom -n 1000 -- "${CONTENER[@]}" nice -n 10 "$VENV/bin/python" -I "$HERR/exportar.py" \
  "$HERR/decodificador.safetensors" "$DESTINO" "$RAIZ/app/src/detector/textos-vano.json" "$RAIZ/herramientas/detector-capo"
echo "$fuente" > "$SELLO"
ls -la "$DESTINO"
