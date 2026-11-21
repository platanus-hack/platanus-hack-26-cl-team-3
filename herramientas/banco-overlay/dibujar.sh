#!/usr/bin/env bash
# Banco del overlay: dibuja la capa nativa del escáner (CapaPoligono.kt, el código real) fuera del teléfono, sobre la
# foto de referencia del Outback. Sirve para ver un cambio del HUD sin compilar el APK ni tener el auto.
#
#   herramientas/banco-overlay/dibujar.sh salida.png [pieza=-1] [zoom=1] [dx=0] [x,y …]
#
# pieza: índice del volumen elegido (-1 = ninguno). zoom y dx (en dp) acercan y corren la foto. Cada «x,y» simula un
# toque en píxeles (pantalla de 1080 × 2400) y dice qué pieza eligió. VEHICULO y FOTO cambian el mapa y la imagen.
#
# Límites: android.graphics está reemplazado por src/*.kt sobre Java2D, así que la letra y el suavizado no son los
# del teléfono; y las piezas no pasan por ARCore: se ubican con la plantilla del catálogo directo sobre la foto.
# Requiere Java 17, las dependencias de app/ instaladas y haber compilado el APK alguna vez (usa el compilador de
# Kotlin que queda en el caché de Gradle).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
AQUI="$RAIZ/herramientas/banco-overlay"
SALIDA="$(realpath -m "${1:?falta el archivo de salida (png)}")"
VEHICULO="${VEHICULO:-outback}"
FOTO="${FOTO:-$RAIZ/docs/evidence/android-engine-maps/outback-visible-bay.jpg}"
TRABAJO="${TMPDIR:-/tmp}/capo-banco-overlay"
CACHE="$HOME/.gradle/caches/modules-2/files-2.1"

# El compilador más nuevo que haya en el caché, con la biblioteca estándar de su misma versión.
jar() { find "$CACHE/$1" -name "$2" 2>/dev/null | head -1; }
V="$(ls "$CACHE/org.jetbrains.kotlin/kotlin-compiler-embeddable" 2>/dev/null | sort -V | tail -1)"
STD="$(jar org.jetbrains.kotlin/kotlin-stdlib "kotlin-stdlib-$V.jar")"
CP="$(jar org.jetbrains.kotlin/kotlin-compiler-embeddable "kotlin-compiler-embeddable-$V.jar")"
[ -n "$STD" ] && [ -n "$CP" ] || { echo "No encuentro el compilador de Kotlin en $CACHE: compila el APK una vez." >&2; exit 1; }
CP="$CP:$STD:$(jar org.jetbrains.kotlin/kotlin-script-runtime "kotlin-script-runtime-$V.jar")"
CP="$CP:$(jar org.jetbrains.kotlin/kotlin-reflect 'kotlin-reflect-1.6.10.jar')"
CP="$CP:$(jar org.jetbrains.kotlin/kotlin-daemon-embeddable "kotlin-daemon-embeddable-$V.jar")"
CP="$CP:$(jar org.jetbrains.kotlinx 'kotlinx-coroutines-core-jvm-*.jar'):$(jar org.jetbrains/annotations 'annotations-13.0.jar')"

mkdir -p "$TRABAJO/clases"
"$RAIZ/app/node_modules/.bin/tsx" "$AQUI/datos.ts" "$VEHICULO" "$TRABAJO"
NATIVO="$RAIZ/app/modules/capo-ar/android/src/main/java/expo/modules/capoar"
java -Xmx700m -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -cp "$STD" -d "$TRABAJO/clases" \
  "$AQUI"/src/*.kt "$NATIVO/CapaPoligono.kt" "$NATIVO/HudPiezas.kt" "$NATIVO/EngineMesh.kt" 2>&1 | { grep -v 'unable to find kotlin-' || true; }
java -Djava.awt.headless=true -cp "$TRABAJO/clases:$STD" expo.modules.capoar.BancoKt \
  "$TRABAJO" "$FOTO" "$SALIDA" "${2:--1}" "${3:-1}" "${4:-0}" "${@:5}"
