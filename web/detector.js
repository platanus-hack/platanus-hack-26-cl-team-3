// Inputs and thresholds match the native CLIP ViT-B/32 detector.
import { env, InferenceSession, Tensor } from '/runtime/ort.wasm.min.mjs';

env.wasm.numThreads = 1;
env.wasm.wasmPaths = '/runtime/';
const side = 224;
const area = side * side;
const mean = [0.48145466, 0.4578275, 0.40821073];
const deviation = [0.26862954, 0.26130258, 0.27577711];
let session;
let prompts;

self.onmessage = async ({ data }) => {
  try {
    if (!session) {
      const response = await fetch('/prompts.json');
      if (!response.ok) throw new Error('Missing prompt vectors');
      prompts = await response.json();
      session = await InferenceSession.create('/runtime/vision.onnx', { executionProviders: ['wasm'] });
      self.postMessage({ ready: true });
      return;
    }
    const input = new Float32Array(area * 3);
    for (let channel = 0; channel < 3; channel++) {
      for (let i = 0; i < area; i++) {
        input[channel * area + i] = (data[i * 4 + channel] / 255 - mean[channel]) / deviation[channel];
      }
    }
    const output = await session.run({ pixel_values: new Tensor('float32', input, [1, 3, side, side]) }, ['image_embeds']);
    const vector = output.image_embeds.data;
    const scale = prompts.escala_logit / (Math.hypot(...vector) || 1);
    const logits = prompts.vectores.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0) * scale);
    const max = Math.max(...logits);
    const weights = logits.map(value => Math.exp(value - max));
    const sum = (a, b) => a + b;
    self.postMessage({ score: weights.slice(0, prompts.positivas.length).reduce(sum, 0) / weights.reduce(sum, 0) });
  } catch (error) {
    self.postMessage({ error: String(error.message ?? error) });
  }
};
