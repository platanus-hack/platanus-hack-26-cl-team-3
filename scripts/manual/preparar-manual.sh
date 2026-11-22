#!/usr/bin/env bash
# Prepara el manual del Outback 2016 para el api: baja el PDF, comprueba que es el esperado y arma el índice que lee
# buscar_manual. El PDF y el índice NO van al repo (regla 7 del README): quedan en api/.manual/, que git ignora.
#
#   scripts/manual/preparar-manual.sh [carpeta-de-salida]            (por defecto api/.manual)
#   MANUAL_PDF=/ruta/manual.pdf scripts/manual/preparar-manual.sh    usa un PDF que ya tengas, sin bajar nada
#   MANUAL_FORMATO=sqlite scripts/manual/preparar-manual.sh           deja outback-2016.sqlite (FTS5) en vez del JSON
#
# Requiere: curl, sha256sum, pdftotext (paquete poppler-utils) y Node 22 con las dependencias del api (npm ci en api/).
# Es una copia de terceros del manual de Subaru: ver docs/specs/manual/README.md.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SALIDA="$(realpath -m "${1:-$RAIZ/api/.manual}")"
URL="${MANUAL_URL:-https://manuals.opinautos.com/published/Subaru-Legacy-Subaru-Outback_2016_EN-US_US_7af7cbd050.pdf}"
SHA256="${MANUAL_SHA256:-5ef448a33afd230bf9f23963a988216777b57661a35fa8e318805dab4844a0cc}"

for herramienta in curl sha256sum pdftotext node; do
  command -v "$herramienta" >/dev/null || { echo "Falta $herramienta." >&2; exit 1; }
done
[ -x "$RAIZ/api/node_modules/.bin/tsx" ] || { echo "Faltan las dependencias del api: corre «npm ci» en api/." >&2; exit 1; }

TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT
if [ -n "${MANUAL_PDF:-}" ]; then
  PDF="$MANUAL_PDF"
else
  PDF="$TRABAJO/manual.pdf"
  echo "Bajando el manual…"
  curl -fsSL -A "Mozilla/5.0" -o "$PDF" "$URL"
fi
OBTENIDO="$(sha256sum "$PDF" | cut -d' ' -f1)"
if [ "$OBTENIDO" != "$SHA256" ]; then
  echo "El PDF no es el esperado (sha256 $OBTENIDO)." >&2
  echo "Si es otra edición a propósito, pásala con MANUAL_SHA256=$OBTENIDO y revisa antes que las páginas citadas calzan." >&2
  exit 1
fi

mkdir -p "$SALIDA"
pdftotext "$PDF" "$TRABAJO/lectura.txt"
pdftotext -layout "$PDF" "$TRABAJO/layout.txt"
cd "$RAIZ/api"
EXTENSION="${MANUAL_FORMATO:-json}"
node_modules/.bin/tsx scripts/manual/construir-indice.ts "$TRABAJO/lectura.txt" "$TRABAJO/layout.txt" "$SALIDA/outback-2016.$EXTENSION" "$OBTENIDO"
echo "Listo. El api lo lee de MANUAL_INDEX (por defecto api/.manual/outback-2016.json; con otro formato, apunta MANUAL_INDEX al archivo)."
