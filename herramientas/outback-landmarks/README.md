# Outback landmark encoder and reference bank

The Android scanner uses Meta's [DINOv2 Small](https://huggingface.co/facebook/dinov2-small/tree/ed25f3a31f01632728cabb09d1542f84ab7b0056)
under the [Apache 2.0 license](LICENSE.dinov2). The export stores the large weight
tensors as Float16 and casts them to Float32 for inference. It accepts a normalized
RGB tensor of shape `1 × 3 × 448 × 672` and returns `1 × 1536 × 384` normalized
Float32 patch descriptors. Attention processes at most 512 queries at a time
against all keys and values to reduce the peak size of its score tensors. The APK
bundles the model and the Outback reference descriptors for offline use.

## Prepare the model

Run from the repository root.

```sh
bash scripts/prepare-outback-landmark-model.sh
```

The Android packaging script already runs this step. Preparation reuses the pinned
Python environment for the bay detector, verifies the two upstream checksums, and
compares the exported model with the original. A verified existing encoder skips
Python setup and network access. Set `CAPO_OUTBACK_PYTHON` to use an existing
compatible Python interpreter or `CAPO_OUTBACK_CACHE` to select the upstream
weights cache.

## Regenerate the descriptor bank

[reference-sources.json](reference-sources.json) records the original publisher,
source URL, time offset where applicable, dimensions, checksums, and visible
service landmarks for the North American Outback 3.6R. The repository and APK
contain the sampled numeric descriptors. The original photos and video frames
remain with their publishers. The auction donor used for independent evaluation
is excluded.

Place local copies of the exact reference JPEGs in a separate directory with the
filenames in the manifest. For each MP4 frame, use the listed time offset and the
standard FFmpeg JPEG encoder settings from the reference extraction.

```sh
ffmpeg -v error -ss 16.65 -i "$reference_dir/hood.mp4" -frames:v 1 -q:v 2 "$reference_dir/mark-hood.jpg"
```

Use Node 22 and install the desktop tooling in a scratch directory. The generator
uses the same bicubic resize, patch normalization, and descriptor interpolation
as the app.

```sh
tooling_dir="$(mktemp -d)"
npm install --prefix "$tooling_dir" --no-save onnxruntime-node@1.24.3 jpeg-js@0.4.4
node --experimental-strip-types herramientas/outback-landmarks/generate_reference_bank.mjs \
  "$reference_dir" "$tooling_dir"
```

The generator writes `app/src/engine-maps/outback-reference-bank.json`. Pass an
optional third argument to write a comparison bank to a different path.
