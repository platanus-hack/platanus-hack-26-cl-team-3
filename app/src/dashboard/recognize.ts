import descriptors from './descriptors.json';

export type WarningLight = keyof typeof descriptors;

export function recognizeLight(rgba: Uint8Array, size: number): WarningLight | null {
  return scanDashboard(rgba, size, size)[0]?.light ?? null;
}

type Box = { x: number; y: number; w: number; h: number };
export type Detection = Box & { light: WarningLight; score: number };

const templates = Object.entries(descriptors).map(([name, descriptor]) => {
  const values = descriptor.rows.flatMap(row => Array.from(row, digit => parseInt(digit, 16) / 15));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map(value => value - mean);
  const norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0));
  return { light: name as WarningLight, aspect: descriptor.aspect, weights: centered.map(value => value / norm) };
});

// Sample the original intensities: thresholding the shape itself erases the
// dark gaps between strokes when a distant lamp occupies only a few pixels.
function scoreBox(intensity: Uint8Array, integral: Uint32Array, stride: number, box: Box, weights: number[]) {
  const useArea = box.w >= 32 && box.h >= 24;
  let sum = 0, squares = 0, product = 0;
  for (let j = 0; j < 12; j++) {
    const y = box.y + (j + 0.5) * box.h / 12 - 0.5;
    const row = Math.floor(y), dy = y - row;
    for (let i = 0; i < 16; i++) {
      const x = box.x + (i + 0.5) * box.w / 16 - 0.5;
      const col = Math.floor(x), dx = x - col, k = row * stride + col;
      const top = intensity[k] * (1 - dx) + intensity[k + 1] * dx;
      const bottom = intensity[k + stride] * (1 - dx) + intensity[k + stride + 1] * dx;
      let value = top * (1 - dy) + bottom * dy;
      if (useArea) {
        const x0 = Math.round(box.x + i * box.w / 16), x1 = Math.round(box.x + (i + 1) * box.w / 16);
        const y0 = Math.round(box.y + j * box.h / 12), y1 = Math.round(box.y + (j + 1) * box.h / 12);
        const a = y0 * (stride + 1), b = y1 * (stride + 1);
        value = (integral[b + x1] - integral[a + x1] - integral[b + x0] + integral[a + x0]) / ((x1 - x0) * (y1 - y0));
      }
      sum += value;
      squares += value * value;
      product += weights[j * 16 + i] * value;
    }
  }
  const energy = squares - sum * sum / 192;
  return energy > 192 * 14 ** 2 ? product / Math.sqrt(energy) : 0;
}

const SCALES = [0.68, 0.84, 1, 1.16];

function fitTemplate(intensity: Uint8Array, integral: Uint32Array, width: number, height: number, region: Box, template: typeof templates[number]) {
  let best: Detection | undefined;
  function evaluate(w: number, h: number, dx: number, dy: number) {
    const x = region.x + (region.w - w) / 2 + dx * w;
    const y = region.y + (region.h - h) / 2 + dy * h;
    if (x < 1 || y < 1 || x + w >= width - 1 || y + h >= height - 1) return;
    const box = { x, y, w, h };
    const score = scoreBox(intensity, integral, width, box, template.weights);
    if (!best || score > best.score) best = { ...box, score, light: template.light };
  }
  for (const sx of SCALES) {
    for (const sy of SCALES) evaluate(region.w * sx, region.h * sy, 0, 0);
  }
  const centered = best;
  if (centered && centered.score > 0.40) {
    for (const dx of [-0.08, 0, 0.08]) {
      for (const dy of [-0.08, 0, 0.08]) evaluate(centered.w, centered.h, dx, dy);
    }
  }
  return best;
}

// A battery has polarity marks inside its outline. A plain rectangular
// gauge or display border can otherwise correlate strongly with this shape.
function hasPolarityMarks(intensity: Uint8Array, stride: number, box: Box) {
  const sample = (x: number, y: number) =>
    intensity[Math.floor(box.y + y * box.h) * stride + Math.floor(box.x + x * box.w)];
  return [0.3, 0.7].every(center => {
    let contrast = 0;
    for (const x of [center - 0.06, center, center + 0.06]) {
      const mark = Math.max(sample(x, 0.43), sample(x, 0.5), sample(x, 0.56));
      contrast = Math.max(contrast, mark - Math.min(sample(x, 0.68), sample(x, 0.73)));
    }
    return contrast >= 9;
  });
}

function classifyRegion(intensity: Uint8Array, integral: Uint32Array, width: number, height: number, region: Box, hue: number) {
  let best: Detection | undefined;
  let runnerUp = 0;
  for (const template of templates) {
    if (template.light === 'fuel' ? hue < 0.38 : hue > 0.50) continue;
    if (Math.abs(Math.log(region.w / region.h / template.aspect)) > 0.5) continue;
    const match = fitTemplate(intensity, integral, width, height, region, template);
    if (match?.light === 'charge' && !hasPolarityMarks(intensity, width, match)) continue;
    if (match && (!best || match.score > best.score)) {
      runnerUp = best?.score ?? 0;
      best = match;
    } else if (match) runnerUp = Math.max(runnerUp, match.score);
  }
  return best && best.score > 0.65 && best.score - runnerUp > 0.06 ? best : undefined;
}

// An icon inside a continuously illuminated readout (for example, the trip
// computer's fuel-range pictogram) is not a standalone warning lamp.
function hasLitBackground(rgba: Uint8Array, width: number, height: number, box: Box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let lit = 0, count = 0;
  for (let j = -5; j <= 5; j++) {
    for (let i = -5; i <= 5; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) < 4) continue;
      const x = Math.round(cx + i * box.w / 5), y = Math.round(cy + j * box.h / 5);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const at = (y * width + x) * 4;
      const r = rgba[at], g = rgba[at + 1], b = rgba[at + 2];
      if (r > 55 && r - Math.min(g, b) > 35 && r > g && r > b) lit++;
      count++;
    }
  }
  return lit > count * 0.55;
}

export function scanDashboard(rgba: Uint8Array, width: number, height: number): Detection[] {
  const pixels = width * height;
  if (pixels <= 0 || rgba.length !== pixels * 4) return [];
  const intensity = new Uint8Array(pixels);
  const warm = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    intensity[i] = (r + g * 0.7 + b * 0.3) / 2;
    if (r - Math.min(b, g) > 38 && r >= g && r >= b) warm[i] = intensity[i];
  }
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += intensity[y * width + x];
      const above = y * (width + 1) + x + 1;
      integral[above + width + 1] = integral[above] + rowSum;
    }
  }
  const queue = new Int32Array(pixels);
  const mask = new Uint8Array(pixels);
  const candidates: Detection[] = [];
  for (const level of [80, 130, 175]) {
    for (let i = 0; i < pixels; i++) mask[i] = warm[i] >= level ? 1 : 0;
    candidates.push(...scanLevel(rgba, width, height, intensity, integral, mask, queue));
  }
  const matches: Detection[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (hasLitBackground(rgba, width, height, candidate)) continue;
    if (!matches.some(box => Math.abs(candidate.x + candidate.w / 2 - box.x - box.w / 2) < (box.w + candidate.w) / 3 &&
        Math.abs(candidate.y + candidate.h / 2 - box.y - box.h / 2) < (box.h + candidate.h) / 3)) matches.push(candidate);
  }
  return matches;
}

function scanLevel(rgba: Uint8Array, width: number, height: number, intensity: Uint8Array, integral: Uint32Array, mask: Uint8Array, queue: Int32Array) {
  const matches: Detection[] = [];
  const regions: { box: Box; hue: number }[] = [];
  let frameLeft = width, frameTop = height, frameRight = -1, frameBottom = -1, frameRed = 0, frameGreen = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let left = width, right = 0, top = height, bottom = 0, greenSum = 0, redSum = 0;
    queue[0] = start;
    mask[start] = 0;
    let count = 1;
    for (let cursor = 0; cursor < count; cursor++) {
      const i = queue[cursor], x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      redSum += rgba[i * 4] - rgba[i * 4 + 2]; greenSum += rgba[i * 4 + 1] - rgba[i * 4 + 2];
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const neighbor = ny * width + nx;
          if (mask[neighbor]) {
            mask[neighbor] = 0;
            queue[count++] = neighbor;
          }
        }
      }
    }
    if (count < 3) continue;
    frameLeft = Math.min(frameLeft, left);
    frameTop = Math.min(frameTop, top);
    frameRight = Math.max(frameRight, right);
    frameBottom = Math.max(frameBottom, bottom);
    frameRed += redSum;
    frameGreen += greenSum;
    const w = right - left + 1, h = bottom - top + 1;
    if (w < 6 || h < 5 || count < 18 || redSum <= 0) continue;
    regions.push({ box: { x: left, y: top, w, h }, hue: greenSum / redSum });
    // Bound template work in densely textured or overexposed scenes.
    if (regions.length > 128) return [];
  }
  // The head and belt may be separate illuminated strokes in a close-up.
  if (frameRed > 0) {
    regions.push({ box: { x: frameLeft, y: frameTop, w: frameRight - frameLeft + 1, h: frameBottom - frameTop + 1 }, hue: frameGreen / frameRed });
  }
  for (const { box, hue } of regions) {
    if (box.w < 6 || box.h < 5 || box.w > width * 0.85 || box.h > height * 0.85) continue;
    const detected = classifyRegion(intensity, integral, width, height, box, hue);
    if (detected) matches.push(detected);
  }
  return matches;
}
