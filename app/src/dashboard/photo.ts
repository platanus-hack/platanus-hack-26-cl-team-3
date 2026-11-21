import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { scanDashboard } from './recognize';

async function preparePreview(uri: string) {
  const context = ImageManipulator.manipulate(uri, { maxWidth: 1280, maxHeight: 1280 });
  try {
    const image = await context.renderAsync();
    try {
      return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.97 });
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

export async function readDashboardPhoto(uri: string) {
  const saved = await preparePreview(uri);
  const file = new File(saved.uri);
  try {
    const { data, width, height } = decode(await file.bytes(), { useTArray: true });
    return { uri: saved.uri, width, height, detections: scanDashboard(data, width, height) };
  } catch (error) {
    file.delete();
    throw error;
  }
}
