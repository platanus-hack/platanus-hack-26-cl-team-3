#!/usr/bin/env bash
# Compila el APK de Capo AR (release, solo arm64-v8a). Resultado: capo-ar/dist/capo-ar.apk
#   scripts/compilar-apk.sh            # incremental: reutiliza lo ya compilado en app/android (mucha menos RAM y tiempo)
#   LIMPIO=1 scripts/compilar-apk.sh   # desde cero (expo prebuild --clean): úsalo si cambian plugins nativos y algo falla
#
# Firma: la clave de depuración estándar que genera `expo prebuild` (android/app/debug.keystore). NO es una clave privada:
# sirve para el hackathon y para que cualquier integrante compile un APK que se instale encima del anterior. Antes de
# publicar en una tienda habría que usar una clave propia.
#
# Antes de cada APK nuevo sube "version" y "android.versionCode" en app/app.json (Android no actualiza con un versionCode igual o menor).
#
# Basado en omni-shared/scripts/compilar-apk.sh. La máquina comparte memoria con otros servicios (Ollama, Docker…) y un
# build de este proyecto YA provocó un OOM global que mató servicios del escritorio (keyring, gpg-agent, audio). Por eso:
#  1. no se empieza sin 5 GB libres (espera hasta 15 min y si no, aborta);
#  2. Gradle y el C++ nativo van con poca memoria, prioridad baja y sin paralelismo (1 worker, 1 compilación C++ a la vez);
#  3. todo corre en un cgroup con límite duro de 4 GB (medido: 3 GB no alcanza al compilar el C++ de la app);
#     si se pasa, el kernel mata solo este build;
#  4. oom_score_adj=1000: si aun así la máquina entera se queda sin memoria, el kernel mata primero este build.
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
  [ "$(memoria_libre)" -ge 5000 ] && break
  echo "esperando memoria libre ($(memoria_libre) MB de 5000)…"; sleep 10
done
if [ "$(memoria_libre)" -lt 5000 ]; then
  echo "ABORTO: tras 15 min no hay 5 GB libres. No compilo para no arriesgar un OOM." >&2; exit 4
fi
CONTENER=()
if systemd-run --user --scope -q -p MemoryMax=4G true 2>/dev/null; then
  CONTENER=(systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G)
else
  echo "AVISO: no hay cgroup de usuario con límite de memoria; se compila sin él (solo con los topes de Gradle)." >&2
fi
export CMAKE_BUILD_PARALLEL_LEVEL=1

"$RAIZ/scripts/descargar-modelo.sh"
[ -d node_modules ] || npm ci --no-audit --no-fund
npx tsc --noEmit
if [ "${LIMPIO:-0}" = 1 ] || [ ! -d android ]; then
  npx expo prebuild --platform android --no-install --clean
else
  npx expo prebuild --platform android --no-install
fi
cd android
# Kotlin dentro del proceso de Gradle (sin daemons aparte: Expo arrastra 3 versiones de Kotlin y cada una levantaba el
# suyo, y junto con R8 superaban los 5 GB → OOM). R8 desactivado: el APK pesa algo más, pero compila con menos memoria.
sed -i '/^org.gradle.jvmargs=/d; /^kotlin.daemon.jvmargs=/d; /^kotlin.compiler.execution.strategy=/d; /^android.enableMinifyInReleaseBuilds=/d' gradle.properties
printf '\norg.gradle.jvmargs=-Xmx1792m -XX:MaxMetaspaceSize=640m -XX:+UseSerialGC\nkotlin.compiler.execution.strategy=in-process\nandroid.enableMinifyInReleaseBuilds=false\norg.gradle.workers.max=1\n' >> gradle.properties
choom -n 1000 -- "${CONTENER[@]}" nice -n 10 ./gradlew assembleRelease --max-workers=1 -PreactNativeArchitectures=arm64-v8a --no-daemon

mkdir -p "$(dirname "$SALIDA")"
cp app/build/outputs/apk/release/app-release.apk "$SALIDA"
"$BT/apksigner" verify -v --print-certs "$SALIDA" | grep -E 'Verified using v2|SHA-256 digest' | head -2
"$BT/aapt2" dump badging "$SALIDA" 2>/dev/null | sed -n "s/^package: name='\([^']*\)' versionCode='\([0-9]*\)' versionName='\([^']*\)'.*/\1 · versionCode \2 · versionName \3/p" | head -1
ls -la "$SALIDA"
