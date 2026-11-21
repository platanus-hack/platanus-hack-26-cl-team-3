#!/usr/bin/env bash
# Prepare the on-device DINOv2 landmark encoder used by the Android APK.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tools="$root/herramientas/outback-landmarks"
requirements="$root/herramientas/vano-motor/requisitos.txt"
asset="$root/app/assets/modelo/part-encoder-half-weights.onnx"
stamp="$asset.fuente"
revision=ed25f3a31f01632728cabb09d1542f84ab7b0056
config_sha=1809f83e3bdb1609a501a610ad4a742f4fd8ae44d72ca4aa0df52d1f2ac8628d
weights_sha=ae1e99fcefd534ed978cdeb8326f08030c96e28b7a81ffcbc98a857c84d14be1

if command -v sha256sum >/dev/null 2>&1; then
  checksum=(sha256sum)
else
  checksum=(shasum -a 256)
fi
hash() {
  "${checksum[@]}" "$@" | cut -d' ' -f1
}
fingerprint="$(
  {
    printf '%s\n' "$revision" "$config_sha" "$weights_sha"
    cat "$tools/export_encoder.py" "$tools/LICENSE.dinov2" "$requirements"
  } | hash
)"
if [[ -s "$asset" && -s "$stamp" && "$(sed -n '1p' "$stamp")" == "$fingerprint" \
   && "$(sed -n '2p' "$stamp")" == "$(hash "$asset")" ]]; then
  printf 'Outback landmark encoder already verified: %s\n' "$asset"
  exit 0
fi

venv="${CAPO_VENV_VANO:-$HOME/.cache/capo-ar/venv-vano}"
python="${CAPO_OUTBACK_PYTHON:-$venv/bin/python}"
if [[ -z "${CAPO_OUTBACK_PYTHON:-}" ]]; then
  if [[ ! -x "$python" ]]; then
    python3 -m venv "$venv"
  fi
  if ! cmp -s "$requirements" "$venv/requisitos.txt"; then
    "$python" -m pip install -q -r "$requirements"
    cp "$requirements" "$venv/requisitos.txt"
  fi
fi

source_dir="${CAPO_OUTBACK_CACHE:-$HOME/.cache/capo-ar/outback}/$revision"
mkdir -p "$source_dir" "$(dirname "$asset")"
scratch="$(mktemp -d "$(dirname "$asset")/.outback-export.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

fetch_verified() {
  local name="$1" expected="$2" output="$source_dir/$1"
  if [[ -s "$output" && "$(hash "$output")" == "$expected" ]]; then
    return
  fi
  curl -fL --retry 4 --retry-delay 3 \
    "https://huggingface.co/facebook/dinov2-small/resolve/$revision/$name" -o "$scratch/$name"
  if [[ "$(hash "$scratch/$name")" != "$expected" ]]; then
    printf 'Unexpected SHA-256 for DINOv2 %s\n' "$name" >&2
    return 1
  fi
  mv -f "$scratch/$name" "$output"
}

fetch_verified config.json "$config_sha"
fetch_verified model.safetensors "$weights_sha"
"$python" -I "$tools/export_encoder.py" "$source_dir" "$scratch/encoder.onnx" \
  "$revision" "$tools/LICENSE.dinov2"
printf '%s\n%s\n' "$fingerprint" "$(hash "$scratch/encoder.onnx")" > "$scratch/encoder.fuente"
mv -f "$scratch/encoder.onnx" "$asset"
mv -f "$scratch/encoder.fuente" "$stamp"
printf 'Outback landmark encoder ready: %s\n' "$asset"
