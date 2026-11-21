import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { normalizeFeatureGrid, sampleDescriptor } from '../../app/src/engine-maps/landmarks/appearance.ts';
import { ENCODER_HEIGHT, ENCODER_WIDTH, encoderInput } from '../../app/src/engine-maps/landmarks/resize.ts';

const [sourceDirectory, toolsDirectory, outputPath] = process.argv.slice(2);
if (!sourceDirectory || !toolsDirectory) {
  throw new Error('Usage: node generate_face_templates.mjs SOURCE_IMAGES TOOL_DEPENDENCIES [OUTPUT]');
}

const requireTools = createRequire(resolve(toolsDirectory, 'package.json'));
const { decode } = requireTools('jpeg-js');
const ort = requireTools('onnxruntime-node');
const manifest = JSON.parse(await readFile(new URL('./face-sources.json', import.meta.url), 'utf8'));
const modelPath = new URL('../../app/assets/modelo/part-encoder-half-weights.onnx', import.meta.url);
const bankPath = new URL('../../app/src/engine-maps/outback-face-templates.json', import.meta.url);

function signedDistance(x, y, polygon) {
  let inside = false;
  let shortest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    shortest = Math.min(shortest, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    if ((ay > y) !== (by > y) && x < ax + dx * (y - ay) / dy) inside = !inside;
  }
  return inside ? shortest : -shortest;
}

function unitMean(descriptors) {
  const means = descriptors[0].map((_, i) => descriptors.reduce((sum, row) => sum + row[i], 0) / descriptors.length);
  const norm = Math.hypot(...means);
  return means.map((value) => value / norm);
}

function makeTemplate(name, face, grid, frame) {
  const { width, height, bayBounds: [left, top, right, bottom] } = frame;
  const [cx, cy] = face.center;
  const xs = face.outline.map(([x]) => x);
  const ys = face.outline.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const shortSide = Math.min(w, h);
  const inside = [];
  const surround = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 7; j++) {
      const x = minX + w * (-.19 + i * 1.38 / 7);
      const y = minY + h * (-.22 + j * 1.44 / 6);
      const distance = signedDistance(x, y, face.outline);
      if (distance >= Math.max(1, shortSide * .025)) inside.push([x, y]);
      else if (distance <= -Math.max(3, shortSide * .08) && distance >= -.28 * shortSide) surround.push([x, y]);
    }
  }

  if (inside.length < 6 || surround.length < 6) throw new Error(`Insufficient samples for ${frame.file} ${name}`);
  const descriptor = ([x, y]) => Array.from(sampleDescriptor(grid, [x / width, y / height]));
  const points = inside.concat(surround);
  const descriptors = points.map(descriptor);
  const foreground = unitMean(descriptors.slice(0, inside.length));
  const background = unitMean(descriptors.slice(inside.length));
  return {
    center: [(cx / width - left) / (right - left), (cy / height - top) / (bottom - top)],
    seed: descriptor(face.center),
    span: [w, h],
    positive: inside.length,
    offsets: points.map(([x, y]) => [x - cx, y - cy]),
    outline: name === 'battery' ? face.outline.map(([x, y]) => [x - cx, y - cy]) : [],
    descriptors: name === 'battery' ? [] : descriptors,
    contrast: foreground.map((value, i) => value - background[i]),
  };
}

const model = await ort.InferenceSession.create(new Uint8Array(await readFile(modelPath)), {
  intraOpNumThreads: 4, enableCpuMemArena: false, enableMemPattern: false,
});
const rows = [];
try {
  for (const frame of manifest) {
    const encoded = await readFile(resolve(sourceDirectory, frame.file));
    if (createHash('sha256').update(encoded).digest('hex') !== frame.sha256) {
      throw new Error(`Reference SHA-256 changed: ${frame.file}`);
    }
    const picture = decode(encoded, { useTArray: true, formatAsRGBA: true });
    if (picture.width !== frame.width || picture.height !== frame.height) {
      throw new Error(`Reference dimensions changed: ${frame.file}`);
    }
    const pixels = new ort.Tensor('float32', encoderInput(picture), [1, 3, ENCODER_HEIGHT, ENCODER_WIDTH]);
    const { descriptors } = await model.run({ pixels });
    if (!(descriptors.data instanceof Float32Array) || descriptors.dims.join(',') !== '1,1536,384') {
      throw new Error('Unexpected patch descriptor output shape');
    }
    const grid = normalizeFeatureGrid(descriptors.data);
    const [left, top, right, bottom] = frame.bayBounds;
    const baySpan = [(right - left) * frame.width, (bottom - top) * frame.height];
    const parts = Object.fromEntries(Object.entries(frame.faces).map(([name, face]) => [
      name, makeTemplate(name, face, grid, frame),
    ]));
    rows.push({ file: frame.file, baySpan, parts });
  }
} finally {
  await model.release();
}

const round = (_, value) => typeof value === 'number' ? Number(value.toFixed(6)) : value;
const output = rows.map(({ file, baySpan, parts }) => {
  const faces = Object.entries(parts).map(([name, face]) => {
    const entries = Object.entries(face).map(([key, value]) => {
      const encoded = key === 'descriptors' && value.length > 0
        ? `[\n          ${value.map((row) => JSON.stringify(row, round)).join(',\n          ')}\n        ]`
        : JSON.stringify(value, round);
      return `        ${JSON.stringify(key)}: ${encoded}`;
    });
    return `      ${JSON.stringify(name)}: {\n${entries.join(',\n')}\n      }`;
  });
  return `  {\n    "file": ${JSON.stringify(file)},\n    "baySpan": ${JSON.stringify(baySpan, round)},\n    "parts": {\n${faces.join(',\n')}\n    }\n  }`;
});
await writeFile(outputPath ?? bankPath, `[\n${output.join(',\n')}\n]\n`);
