import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { recognizeLight } from './recognize';

export async function readDashboardPhoto(uri: string) {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.max(1, Math.round(Math.min(source.width, source.height) * 0.4));
  const size = 192;
  const crop = await ImageManipulator.manipulate(source).crop({
    originX: Math.floor((source.width - side) / 2),
    originY: Math.floor((source.height - side) / 2),
    width: side, height: side,
  }).resize({ width: size, height: size }).renderAsync();
  const saved = await crop.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  const file = new File(saved.uri);
  try {
    return recognizeLight(decode(await file.bytes(), { useTArray: true }).data, size);
  } finally {
    file.delete();
  }
}
