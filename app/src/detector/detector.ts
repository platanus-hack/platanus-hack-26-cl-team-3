/**
 * Detector de capó abierto, 100 % en el teléfono (sin internet).
 *
 * Cómo funciona (zero-shot con CLIP): la foto se recorta al cuadrado central, se reduce a 224×224 y pasa por el
 * codificador de imagen de CLIP (ONNX int8). Su vector se compara con vectores de texto precalculados
 * (textos-clip.json): unas descripciones de «capó abierto» y otras de distractores. El puntaje es la probabilidad
 * sumada de las descripciones de capó abierto (0 a 1).
 *
 * Medido en el servidor con 166 fotos de Wikimedia (herramientas/detector-capo/): umbral 0,6 → 95,8 % de aciertos.
 * Falta medirlo con el Outback real. Las descripciones y la evaluación están en herramientas/detector-capo/.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import textos from './textos-clip.json';

const LADO = 224;
const MEDIA = [0.48145466, 0.4578275, 0.40821073];
const DESV = [0.26862954, 0.26130258, 0.27577711];
const N_POSITIVAS = textos.positivas.length;
const DIM = textos.vectores[0].length;
const VECTORES = Float32Array.from(textos.vectores.flat());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODELO: number = require('../../assets/modelo/clip-vision-int8.onnx');

let sesion: Promise<InferenceSession> | null = null;

/** Carga el modelo una sola vez (la primera copia el archivo de 88 MB al caché: tarda unos segundos). */
export function cargarDetector(): Promise<InferenceSession> {
  if (!sesion) {
    sesion = (async () => {
      const [asset] = await Asset.loadAsync(MODELO);
      const ruta = asset.localUri ?? asset.uri;
      return InferenceSession.create(ruta, { graphOptimizationLevel: 'all', intraOpNumThreads: 4 });
    })().catch((e) => {
      sesion = null; // permite reintentar
      throw e;
    });
  }
  return sesion;
}

/** Puntúa una foto (uri de archivo): probabilidad de que muestre un capó abierto, de 0 a 1. */
export async function puntuarFoto(uri: string): Promise<number> {
  const modelo = await cargarDetector();
  const pixeles = await prepararImagen(uri);
  const salida = await modelo.run({ pixel_values: new Tensor('float32', pixeles, [1, 3, LADO, LADO]) });
  const imagen = salida.image_embeds.data as Float32Array;
  return probabilidadCapo(imagen);
}

async function prepararImagen(uri: string): Promise<Float32Array> {
  // 1) Cargar para conocer el tamaño real (ya orientado), 2) recorte cuadrado central y 224×224.
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const s = Math.min(original.width, original.height);
  const reducida = await ImageManipulator.manipulate(original)
    .crop({ originX: Math.floor((original.width - s) / 2), originY: Math.floor((original.height - s) / 2), width: s, height: s })
    .resize({ width: LADO, height: LADO })
    .renderAsync();
  const guardada = await reducida.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  const archivo = new File(guardada.uri);
  try {
    const bytes = await archivo.bytes();
    const { data, width, height } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (width !== LADO || height !== LADO) throw new Error(`tamaño inesperado ${width}×${height}`);
    // RGBA (HWC, 0-255) → RGB normalizado de CLIP (CHW).
    const plano = LADO * LADO;
    const x = new Float32Array(3 * plano);
    for (let i = 0; i < plano; i++) {
      x[i] = (data[4 * i] / 255 - MEDIA[0]) / DESV[0];
      x[plano + i] = (data[4 * i + 1] / 255 - MEDIA[1]) / DESV[1];
      x[2 * plano + i] = (data[4 * i + 2] / 255 - MEDIA[2]) / DESV[2];
    }
    return x;
  } finally {
    try {
      archivo.delete();
    } catch {
      // archivo temporal del caché: si no se puede borrar, Android lo limpia solo
    }
  }
}

function probabilidadCapo(imagen: Float32Array): number {
  let norma = 0;
  for (let j = 0; j < DIM; j++) norma += imagen[j] * imagen[j];
  norma = Math.sqrt(norma) || 1;
  const n = VECTORES.length / DIM;
  const logits = new Float64Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let j = 0; j < DIM; j++) d += VECTORES[i * DIM + j] * imagen[j];
    logits[i] = (textos.escala_logit * d) / norma;
    if (logits[i] > max) max = logits[i];
  }
  let total = 0;
  let positivo = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(logits[i] - max);
    total += e;
    if (i < N_POSITIVAS) positivo += e;
  }
  return positivo / total;
}
