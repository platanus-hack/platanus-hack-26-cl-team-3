import { useScannerPermission } from '../useScannerPermission';
import { CameraView } from 'expo-camera';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, findNodeHandle, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { readPlatePreview } from '../../modules/capo-ar';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';
import { readCarPlate } from './lookup';

export function PlateCamera({ onRead }: { onRead: (plate: string) => void }) {
  const [permission, requestPermission] = useScannerPermission(Boolean(readPlatePreview));
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const preview = useRef<ComponentRef<typeof View>>(null);
  const capturing = useRef(false);
  const { width: pantallaAncho, height: pantallaAlto } = useWindowDimensions();
  // En horizontal la vista no puede ser más alta que la pantalla: se achica manteniendo la proporción 3:2.
  const ancho = Math.min(pantallaAncho - espacio.xl * 2, pantallaAlto * 0.7 * 1.5);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') setReady(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const recognize = readPlatePreview;
    if (!ready || !active || !recognize || error) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous: string | undefined;

    async function scan() {
      if (cancelled) return;
      const viewTag = findNodeHandle(preview.current);
      if (!capturing.current && viewTag != null) {
        capturing.current = true;
        try {
          const plate = readCarPlate(await recognize!(viewTag));
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
          capturing.current = false;
        }
      }
      if (!cancelled) timer = setTimeout(scan, 650);
    }

    timer = setTimeout(scan, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, active, onRead, error]);

  if (!readPlatePreview || error) return <Text style={tipo.nota}>{error || 'La lectura con cámara no está disponible en este dispositivo.'}</Text>;
  if (!permission?.granted) return (
    <View style={styles.permission}>
      <Text style={tipo.cuerpo}>{permission?.canAskAgain === false
        ? 'Para usar la cámara, habilita el permiso en los ajustes de la app.'
        : 'Permite el acceso a la cámara para leer la patente.'}</Text>
      {permission?.canAskAgain && <Boton texto="Habilitar cámara" icono="camera-outline" onPress={() => { void requestPermission().catch(() => setError('No se pudo habilitar la cámara.')); }} />}
    </View>
  );
  return (
    <View ref={preview} collapsable={false} style={[styles.preview, { width: ancho }]}>
      {active && <CameraView style={StyleSheet.absoluteFill} facing="back"
        onCameraReady={() => setReady(true)} onMountError={() => setError('No se pudo abrir la cámara. Puedes escribir la patente.')} />}
      <View pointerEvents="none" style={styles.guide} />
    </View>
  );
}

const styles = StyleSheet.create({
  permission: { gap: espacio.m },
  preview: { alignSelf: 'center', aspectRatio: 1.5, backgroundColor: color.superficie, borderRadius: radio.l,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  guide: { width: '75%', aspectRatio: 3.25, borderColor: color.acento, borderWidth: 2, borderRadius: radio.s },
});
