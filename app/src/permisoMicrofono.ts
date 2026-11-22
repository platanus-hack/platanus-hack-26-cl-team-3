import { AudioModule } from 'expo-audio';

// Pedirlo ya dado abre igual la pantalla de permisos de Android y pausa la Activity (y ARCore).
export async function permisoMicrofono() {
  const actual = await AudioModule.getRecordingPermissionsAsync();
  return actual.granted ? actual : AudioModule.requestRecordingPermissionsAsync();
}
