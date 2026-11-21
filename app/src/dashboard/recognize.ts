import descriptors from './descriptors.json';

export type WarningLight = keyof typeof descriptors;

// Each cell records the fraction of illuminated pixels in a 16 by 12 grid.
// References are derived from the Outback 2016 owner's manual, printed page 23.
export function recognizeLight(rgba: Uint8Array, size: number): WarningLight | null {
  const mask = new Uint8Array(size * size);
  let left = size, top = size, right = -1, bottom = -1, amber = 0, count = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      if (r < 80 || r - b < 45 || r < g * 0.96 || b > r * 0.65) continue;
      mask[i] = 1;
    }
  }
  // Ignore isolated sensor noise without discarding disconnected parts of a symbol.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!mask[i]) continue;
      if (!(x > 0 && mask[i - 1]) && !(x + 1 < size && mask[i + 1]) &&
          !(y > 0 && mask[i - size]) && !(y + 1 < size && mask[i + size])) {
        mask[i] = 0;
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count++;
      if (rgba[i * 4 + 1] > rgba[i * 4] * 0.46) amber++;
    }
  }
  const width = right - left + 1, height = bottom - top + 1;
  if (width < 18 || height < 10 || count < 65 || left <= 1 || top <= 1 || right >= size - 2 || bottom >= size - 2) return null;

  const filled = new Uint32Array(192);
  const totals = new Uint32Array(192);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const cell = Math.floor((y - top) * 12 / height) * 16 + Math.floor((x - left) * 16 / width);
      filled[cell] += mask[y * size + x];
      totals[cell]++;
    }
  }
  let best: WarningLight | null = null, bestError = Infinity, runnerUp = Infinity;
  for (const name of Object.keys(descriptors) as WarningLight[]) {
    if (name === 'fuel' ? amber / count < 0.75 : amber / count > 0.25) continue;
    const { aspect, rows } = descriptors[name];
    const distortion = Math.abs(Math.log(width / height / aspect));
    if (distortion > 0.27) continue;
    let difference = 0, union = 0;
    for (let i = 0; i < filled.length; i++) {
      const actual = filled[i] / (totals[i] || 1);
      const reference = parseInt(rows[Math.floor(i / 16)][i % 16], 16) / 15;
      difference += Math.abs(actual - reference);
      union += Math.max(actual, reference);
    }
    const error = difference / union + distortion * 0.2;
    if (error < bestError) {
      runnerUp = bestError;
      bestError = error;
      best = name;
    } else runnerUp = Math.min(runnerUp, error);
  }
  return bestError < 0.31 && runnerUp - bestError > 0.08 ? best : null;
}
