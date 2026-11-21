type Raster = { width: number; height: number; data: Uint8Array };
type Kernel = { first: number; weights: number[] };

export const ENCODER_WIDTH = 672;
export const ENCODER_HEIGHT = 448;
const MEAN = [.485, .456, .406];
const STD = [.229, .224, .225];

function cubic(position: number): number {
  const x = Math.abs(position);
  if (x < 1) return ((1.5 * x - 2.5) * x) * x + 1;
  return x < 2 ? ((-.5 * x + 2.5) * x - 4) * x + 2 : 0;
}

function kernels(source: number, destination: number): Kernel[] {
  const scale = source / destination;
  const filterScale = Math.max(scale, 1);
  const support = 2 * filterScale;
  return Array.from({ length: destination }, (_, coordinate) => {
    const center = (coordinate + .5) * scale;
    const first = Math.max(0, Math.trunc(center - support + .5));
    const end = Math.min(source, Math.trunc(center + support + .5));
    const raw = Array.from({ length: end - first }, (_, tap) => cubic((first + tap + .5 - center) / filterScale));
    const total = raw.reduce((sum, value) => sum + value, 0);
    return { first, weights: raw.map((value) => value / total) };
  });
}

const byte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

/** Separable antialiased bicubic resize with rounded 8-bit RGB between passes. */
export function resizeForEncoder(picture: Raster, width: number, height: number): Uint8Array {
  const horizontal = kernels(picture.width, width);
  const vertical = kernels(picture.height, height);
  const intermediate = new Uint8Array(picture.height * width * 3);
  for (let row = 0; row < picture.height; row += 1) {
    for (const [column, { first, weights }] of horizontal.entries()) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        const offset = 4 * (row * picture.width + first) + channel;
        for (let tap = 0; tap < weights.length; tap += 1) value += weights[tap] * picture.data[offset + 4 * tap];
        intermediate[3 * (row * width + column) + channel] = byte(value);
      }
    }
  }
  const result = new Uint8Array(width * height * 3);
  for (const [row, { first, weights }] of vertical.entries()) {
    for (let column = 0; column < width; column += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        const offset = 3 * (first * width + column) + channel;
        for (let tap = 0; tap < weights.length; tap += 1) value += weights[tap] * intermediate[offset + 3 * width * tap];
        result[3 * (row * width + column) + channel] = byte(value);
      }
    }
  }
  return result;
}

export function encoderInput(picture: Raster): Float32Array {
  const resized = resizeForEncoder(picture, ENCODER_WIDTH, ENCODER_HEIGHT);
  const plane = ENCODER_WIDTH * ENCODER_HEIGHT;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + i] = (resized[3 * i + channel] / 255 - MEAN[channel]) / STD[channel];
    }
  }
  return input;
}
