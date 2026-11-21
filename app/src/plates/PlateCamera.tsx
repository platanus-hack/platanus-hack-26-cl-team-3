import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { readPlateLines } from '../../modules/capo-ar';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';
import { readCarPlate } from './lookup';

export function PlateCamera({ onRead }: { onRead: (plate: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<CameraView>(null);
  const capturing = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') setReady(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const recognize = readPlateLines;
    if (!ready || !active || !recognize || error) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous: string | undefined;

    async function scan() {
      if (cancelled) return;
      if (!capturing.current && camera.current) {
        capturing.current = true;
        let uri: string | undefined;
        try {
          const picture = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
          uri = picture?.uri;
          if (cancelled) return;
          const plate = uri ? readCarPlate(await recognize!(uri)) : undefined;
          if (cancelled) return;
          // Two consecutive readings avoid looking up a transient OCR guess.
          if (plate && plate === previous) {
            onRead(plate);
            return;
          }
          previous = plate;
        } catch {
          if (!cancelled) setError('No se pudo leer la cámara. Puedes escribir la patente.');
          return;
        } finally {
          if (uri) {
            try { new File(uri).delete(); } catch { /* The camera cache may already be cleared. */ }
          }
          capturing.current = false;
        }
      }
      if (!cancelled) timer = setTimeout(scan, 650);
    }

    timer = setTimeout(scan, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, active, onRead, error]);

  if (!readPlateLines || error) return <Text style={tipo.nota}>{error || 'La lectura con cámara no está disponible en este dispositivo.'}</Text>;
  if (!permission?.granted) return (
    <View style={styles.permission}>
      <Text style={tipo.cuerpo}>{permission?.canAskAgain === false
        ? 'Para usar la cámara, habilita el permiso en los ajustes de la app.'
        : 'Permite el acceso a la cámara para leer la patente.'}</Text>
      {permission?.canAskAgain && <Boton texto="Habilitar cámara" icono="camera-outline" onPress={() => { void requestPermission().catch(() => setError('No se pudo habilitar la cámara.')); }} />}
    </View>
  );
  return (
    <View style={styles.preview}>
      {active && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back"
        onCameraReady={() => setReady(true)} onMountError={() => setError('No se pudo abrir la cámara. Puedes escribir la patente.')} />}
      <View pointerEvents="none" style={styles.guide} />
    </View>
  );
}

const styles = StyleSheet.create({
  permission: { gap: espacio.m },
  preview: { width: '100%', aspectRatio: 1.5, backgroundColor: color.superficie, borderRadius: radio.l,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  guide: { width: '75%', aspectRatio: 3.25, borderColor: color.acento, borderWidth: 2, borderRadius: radio.s },
});
