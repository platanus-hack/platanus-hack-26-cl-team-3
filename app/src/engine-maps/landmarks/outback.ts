import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as jpeg from 'jpeg-js';
import type { InferenceSession } from 'onnxruntime-react-native';

import type { CapturaAR, PartCenter } from '../../../modules/capo-ar';
import { cargarOrt } from '../../detector/detector';
import type { Vano } from '../../detector/vano';
import type { Volume } from '../catalog';
import { solveOutbackParts } from './outback-solver';
import { ENCODER_HEIGHT, ENCODER_WIDTH, encoderInput } from './resize';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const model: number = require('../../../assets/modelo/part-encoder-half-weights.onnx');
let session: Promise<InferenceSession> | null = null;
let activeReads = 0;
let releaseRequested = false;

function load(): Promise<InferenceSession> {
  session ??= (async () => {
    const [asset] = await Asset.loadAsync(model);
    return cargarOrt().InferenceSession.create(asset.localUri ?? asset.uri, {
      graphOptimizationLevel: 'all', intraOpNumThreads: 4,
      enableCpuMemArena: false, enableMemPattern: false,
    });
  })().catch((error) => {
    session = null;
    throw error;
  });
  return session;
}

/** Warm the optional model only during an active placement window. */
export function releaseOutbackEncoder(): void {
  releaseRequested = true;
  if (activeReads) return;
  const current = session;
  session = null;
  releaseRequested = false;
  void current?.then((encoder) => encoder.release()).catch(() => undefined);
}

/** Use the same upright image and sensor metadata that will be passed to native placement. */
export async function locateOutbackParts(
  capture: CapturaAR, bay: Vano, volumes: readonly Volume[],
): Promise<PartCenter[]> {
  activeReads += 1;
  try {
    const bytes = await new File(capture.uri).bytes();
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (decoded.width !== capture.ancho || decoded.height !== capture.alto) return [];
    const { Tensor } = cargarOrt();
    const pixels = new Tensor('float32', encoderInput(decoded), [1, 3, ENCODER_HEIGHT, ENCODER_WIDTH]);
    const outputs = await (await load()).run({ pixels });
    const data = outputs.descriptors.data;
    if (!(data instanceof Float32Array) || outputs.descriptors.dims.join(',') !== '1,1536,384') return [];
    return solveOutbackParts(data, capture.ancho, capture.alto, bay, volumes);
  } catch {
    // An unavailable encoder or an ambiguous frame leaves the current bay registration usable.
    return [];
  } finally {
    activeReads -= 1;
    if (!activeReads && releaseRequested) releaseOutbackEncoder();
  }
}
