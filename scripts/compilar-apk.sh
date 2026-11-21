#!/usr/bin/env bash
# Compila el APK de Capo AR (release, solo arm64-v8a). Resultado: capo-ar/dist/capo-ar.apk
#   scripts/compilar-apk.sh
#
# Firma: la clave de depuración estándar que genera `expo prebuild` (android/app/debug.keystore). NO es una clave privada:
# sirve para el hackathon y para que cualquier integrante compile un APK que se instale encima del anterior. Antes de
# publicar en una tienda habría que usar una clave propia.
#
# Antes de cada APK nuevo sube "version" y "android.versionCode" en app/app.json (Android no actualiza con un versionCode igual o menor).
#
# Basado en omni-shared/scripts/compilar-apk.sh: la máquina comparte memoria con otros servicios y ya hubo OOM, así que
#  1. no se empieza sin 5,5 GB libres (espera hasta 15 min y si no, aborta);
#  2. Gradle va con topes bajos de memoria, prioridad baja y pocos procesos;
#  3. todo corre en un cgroup con límite duro de 5 GB: si se pasa, el kernel mata solo este build.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ/app"
export PATH="$HOME/tools/node22/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
SALIDA="${APK_SALIDA:-$RAIZ/dist/capo-ar.apk}"

BT="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
[ -x "$BT/apksigner" ] || { echo "ERROR: no encuentro apksigner en $ANDROID_HOME/build-tools" >&2; exit 1; }

memoria_libre() { awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo; }
for _ in $(seq 1 90); do
  [ "$(memoria_libre)" -ge 5500 ] && break
  echo "esperando memoria libre ($(memoria_libre) MB de 5500)…"; sleep 10
done
if [ "$(memoria_libre)" -lt 5500 ]; then
  echo "ABORTO: tras 15 min no hay 5,5 GB libres. No compilo para no arriesgar un OOM." >&2; exit 4
fi
CONTENER=()
if systemd-run --user --scope -q -p MemoryMax=5G true 2>/dev/null; then
  CONTENER=(systemd-run --user --scope -q -p MemoryMax=5G -p MemorySwapMax=1G)
else
  echo "AVISO: no hay cgroup de usuario con límite de memoria; se compila sin él (solo con los topes de Gradle)." >&2
fi
export CMAKE_BUILD_PARALLEL_LEVEL=3

[ -d node_modules ] || npm ci --no-audit --no-fund
npx tsc --noEmit
npx expo prebuild --platform android --no-install --clean
cd android
# Kotlin dentro del proceso de Gradle (sin daemons aparte: Expo arrastra 3 versiones de Kotlin y cada una levantaba el
# suyo, y junto con R8 superaban los 5 GB → OOM). R8 desactivado: el APK pesa algo más, pero compila con menos memoria.
sed -i '/^org.gradle.jvmargs=/d; /^kotlin.daemon.jvmargs=/d; /^kotlin.compiler.execution.strategy=/d; /^android.enableMinifyInReleaseBuilds=/d' gradle.properties
printf '\norg.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m\nkotlin.compiler.execution.strategy=in-process\nandroid.enableMinifyInReleaseBuilds=false\norg.gradle.workers.max=2\n' >> gradle.properties
"${CONTENER[@]}" nice -n 10 ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a --no-daemon

mkdir -p "$(dirname "$SALIDA")"
cp app/build/outputs/apk/release/app-release.apk "$SALIDA"
"$BT/apksigner" verify -v --print-certs "$SALIDA" | grep -E 'Verified using v2|SHA-256 digest' | head -2
"$BT/aapt2" dump badging "$SALIDA" 2>/dev/null | sed -n "s/^package: name='\([^']*\)' versionCode='\([0-9]*\)' versionName='\([^']*\)'.*/\1 · versionCode \2 · versionName \3/p" | head -1
ls -la "$SALIDA"
