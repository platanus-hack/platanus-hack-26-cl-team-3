/**
 * Detector del vano del motor, 100 % en el teléfono (sin internet).
 *
 * Un solo modelo ONNX (CLIPSeg: CLIP ViT-B/16 congelado + decodificador entrenado por nosotros, int8) entrega:
 *  - `vano` [88×88]: logits de «está dentro del vano del motor» (todo lo que queda bajo el capó, no solo el motor);
 *    vano.ts lo convierte en el polígono con sus esquinas.
 *  - `image_embeds` [512]: vector de imagen de CLIP; comparado con textos-vano.json da el puntaje de «capó abierto».
 *
 * Entrada: el cuadro COMPLETO de la cámara aplastado a 352×352 (sin recortar), normalización de ImageNet.
 * Cómo se entrenó y se midió: herramientas/vano-motor/.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import type { InferenceSession } from 'onnxruntime-react-native';

import type { Recorte } from './encuadre';
import textos from './textos-vano.json';

type Ort = typeof import('onnxruntime-react-native');
let ort: Ort | null = null;

/**
 * Carga ONNX Runtime recién cuando se necesita: la librería instala su módulo nativo al importarse y, si falla, lanza
 * un error que en release cerraría la app. Así el fallo llega a la pantalla como mensaje.
 */
export function cargarOrt(): Ort {
  if (!ort) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m: Ort = require('onnxruntime-react-native');
    ort = m;
  }
  return ort;
}

const LADO = 352;
const MEDIA = [0.485, 0.456, 0.406];
const DESV = [0.229, 0.224, 0.225];
const N_POSITIVAS = textos.positivas.length;
const DIM = textos.vectores[0].length;
const VECTORES = Float32Array.from(textos.vectores.flat());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODELO: number = require('../../assets/modelo/vano-motor-int8.onnx');

let sesion: Promise<InferenceSession> | null = null;

/** Carga el modelo una sola vez (la primera copia el archivo al caché: tarda unos segundos). */
export function cargarDetector(): Promise<InferenceSession> {
  if (!sesion) {
    sesion = (async () => {
      const { InferenceSession } = cargarOrt();
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

export type Analisis = {
  puntaje: number; // probabilidad de «capó abierto», 0 a 1
  vano: Float32Array; // logits 88×88 del vano del motor (fila por fila)
  ancho: number; // tamaño de la foto analizada (ya orientada), para ubicar el polígono en pantalla
  alto: number;
};

/**
 * Analiza una foto (uri de archivo). Con `recorte`, el modelo ve solo esa parte de la imagen (zoom): el mapa `vano`
 * queda en coordenadas del recorte (ver encuadre.ts para pasarlo al cuadro completo).
 */
export async function analizarFoto(uri: string, recorte?: Recorte): Promise<Analisis> {
  const modelo = await cargarDetector();
  const { pixeles, ancho, alto } = await prepararImagen(uri, recorte);
  const { Tensor } = cargarOrt();
  const salida = await modelo.run({ pixel_values: new Tensor('float32', pixeles, [1, 3, LADO, LADO]) });
  return {
    puntaje: probabilidadCapo(salida.image_embeds.data as Float32Array),
    vano: Float32Array.from(salida.vano.data as Float32Array),
    ancho,
    alto,
  };
}

async function prepararImagen(uri: string, recorte?: Recorte): Promise<{ pixeles: Float32Array; ancho: number; alto: number }> {
  // 1) Cargar para conocer el tamaño real (ya orientado), 2) recortar si hay zoom, 3) aplastar a 352×352.
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  let contexto = ImageManipulator.manipulate(original);
  if (recorte && recorte.lado < 1) {
    const originX = Math.min(original.width - 1, Math.max(0, Math.round(recorte.x * original.width)));
    const originY = Math.min(original.height - 1, Math.max(0, Math.round(recorte.y * original.height)));
    contexto = contexto.crop({
      originX,
      originY,
      width: Math.max(1, Math.min(original.width - originX, Math.round(recorte.lado * original.width))),
      height: Math.max(1, Math.min(original.height - originY, Math.round(recorte.lado * original.height))),
    });
  }
  const reducida = await contexto.resize({ width: LADO, height: LADO }).renderAsync();
  const guardada = await reducida.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  const archivo = new File(guardada.uri);
  try {
    const bytes = await archivo.bytes();
    const { data, width, height } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (width !== LADO || height !== LADO) throw new Error(`tamaño inesperado ${width}×${height}`);
    // RGBA (HWC, 0-255) → RGB normalizado (CHW).
    const plano = LADO * LADO;
    const x = new Float32Array(3 * plano);
    for (let i = 0; i < plano; i++) {
      x[i] = (data[4 * i] / 255 - MEDIA[0]) / DESV[0];
      x[plano + i] = (data[4 * i + 1] / 255 - MEDIA[1]) / DESV[1];
      x[2 * plano + i] = (data[4 * i + 2] / 255 - MEDIA[2]) / DESV[2];
    }
    return { pixeles: x, ancho: original.width, alto: original.height };
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
