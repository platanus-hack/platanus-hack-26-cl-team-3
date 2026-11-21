import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { normalizeFeatureGrid, sampleDescriptor } from '../../app/src/engine-maps/landmarks/appearance.ts';
import { ENCODER_HEIGHT, ENCODER_WIDTH, encoderInput } from '../../app/src/engine-maps/landmarks/resize.ts';

const GRID = [48, 32, 384];

const [sourceDirectory, toolsDirectory, outputPath] = process.argv.slice(2);
if (!sourceDirectory || !toolsDirectory) {
  throw new Error('Usage: node generate_reference_bank.mjs SOURCE_IMAGES TOOL_DEPENDENCIES [OUTPUT]');
}

const requireTools = createRequire(resolve(toolsDirectory, 'package.json'));
const { decode } = requireTools('jpeg-js');
const ort = requireTools('onnxruntime-node');

function makeInput(encoded, frame) {
  const picture = decode(encoded, { useTArray: true, formatAsRGBA: true });
  if (picture.width !== frame.width || picture.height !== frame.height) {
    throw new Error(`Reference dimensions changed: ${frame.file}`);
  }

  return new ort.Tensor('float32', encoderInput(picture), [1, 3, ENCODER_HEIGHT, ENCODER_WIDTH]);
}

const manifest = JSON.parse(await readFile(new URL('./reference-sources.json', import.meta.url), 'utf8'));
const modelUrl = new URL('../../app/assets/modelo/part-encoder-half-weights.onnx', import.meta.url);
const bankUrl = new URL('../../app/src/engine-maps/outback-reference-bank.json', import.meta.url);
const session = await ort.InferenceSession.create(new Uint8Array(await readFile(modelUrl)), {
  intraOpNumThreads: 4,
});
const references = [];
const descriptors = Object.create(null);
try {
  for (const frame of manifest.frames) {
    const encoded = await readFile(resolve(sourceDirectory, frame.file));
    if (createHash('sha256').update(encoded).digest('hex') !== frame.sha256) {
      throw new Error(`Reference SHA-256 changed: ${frame.file}`);
    }

    const output = (await session.run({ pixels: makeInput(encoded, frame) })).descriptors;
    if (!(output.data instanceof Float32Array) || output.dims.join(',') !== '1,1536,384') {
      throw new Error('Unexpected patch descriptor output shape');
    }
    const grid = normalizeFeatureGrid(output.data, ...GRID);
    const { file, source, sourceId, timeSeconds, width, height, points } = frame;
    references.push({ file, source, sourceId, timeSeconds, width, height, points });
    for (const [name, point] of Object.entries(points)) {
      if (point === null) continue;
      const descriptor = sampleDescriptor(grid, [point[0] / width, point[1] / height]);
      (descriptors[name] ??= []).push(Array.from(descriptor, (value) => Number(value.toFixed(6))));
    }
  }
} finally {
  await session.release();
}

const referenceRows = references.map((reference) => `    ${JSON.stringify(reference)}`);
const descriptorRows = Object.keys(descriptors).sort().map((name) => {
  const rows = descriptors[name].map((values) => `      ${JSON.stringify(values)}`);
  return `    ${JSON.stringify(name)}: [\n${rows.join(',\n')}\n    ]`;
});
await writeFile(outputPath ?? bankUrl, `{\n  "references": [\n${referenceRows.join(',\n')}\n  ],\n  "descriptors": {\n${descriptorRows.join(',\n')}\n  }\n}\n`);
