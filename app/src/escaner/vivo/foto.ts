import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Vano } from '../../detector/vano';
import { cropRectForBay } from '../../engine-maps/landmarks/sonnet';

const ANCHO_MAX = 1024;
const CALIDAD_JPEG = 0.7;

export async function vanoParaChat(uri: string, bay: Vano): Promise<string | null> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const rect = cropRectForBay(bay, original.width, original.height);
  if (!rect) return null;
  let contexto = ImageManipulator.manipulate(original).crop(rect);
  if (rect.width > ANCHO_MAX) contexto = contexto.resize({ width: ANCHO_MAX });
  const recorte = await contexto.renderAsync();
  const guardado = await recorte.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG, base64: true });
  try {
    return guardado.base64 ?? null;
  } finally {
    try {
      new File(guardado.uri).delete();
    } catch {}
  }
}
