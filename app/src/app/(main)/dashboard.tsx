import { capacidadesDe } from '../../capacidades';
import { useVehicleSelection } from '../../plates/selection';
import { useScannerPermission } from '../../useScannerPermission';
import { File } from 'expo-file-system';
import { CameraView } from 'expo-camera';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { guide, manualUrl } from '../../dashboard/guide';
import { readDashboardPhoto } from '../../dashboard/photo';
import { borrar } from '../../escaner/comun';
import { color, espacio, tipo } from '../../theme';
import { Boton, BotonIcono } from '../../ui';
import { useGiroLibre } from '../../useGiroLibre';

export default function Dashboard() {
  const { vehicle } = useVehicleSelection();
  useGiroLibre(); // la cámara del tablero gira con el teléfono
  const { vehicleId = vehicle.id } = useLocalSearchParams<{ vehicleId?: string }>();
  const focused = useIsFocused();
  return focused && <DashboardScanner key={vehicleId} vehicleId={vehicleId} />;
}

function DashboardScanner({ vehicleId }: { vehicleId: string }) {
  const { vehicle: selected } = useVehicleSelection();
  const supported = capacidadesDe(vehicleId).tablero;
  const [permission, requestPermission] = useScannerPermission(supported);
  const { height } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const mounted = useRef(false);
  const scanning = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readDashboardPhoto>>>();
  useEffect(() => () => { if (result) borrar(result.uri); }, [result]);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function scan(source: 'camera' | 'file') {
    if (scanning.current || (source === 'camera' && (!ready || !camera.current))) return;
    scanning.current = true;
    setBusy(true);
    setError('');
    let temporaryCapture: string | undefined;
    try {
      let uri: string;
      if (source === 'file') {
        const picked = await File.pickFileAsync({ mimeTypes: ['image/*'] });
        if (picked.canceled || !mounted.current) return;
        uri = picked.result.uri;
      } else {
        const photo = await camera.current?.takePictureAsync({ quality: 0.95, shutterSound: false });
        if (!photo?.uri) throw new Error('Missing capture');
        temporaryCapture = photo.uri;
        uri = photo.uri;
      }
      const reading = await readDashboardPhoto(uri);
      if (mounted.current) {
        setReady(false);
        setResult(reading);
      } else borrar(reading.uri);
    } catch {
      if (mounted.current) setError('No se pudo leer la foto. Vuelve a intentarlo.');
    } finally {
      if (temporaryCapture) borrar(temporaryCapture);
      scanning.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const lights = [...new Set(result?.detections.map(detection => detection.light))];
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={tipo.titulo}>Escanear tablero</Text>
        {!supported ? <Text style={tipo.cuerpo}>El escáner de tablero solo tiene referencias verificadas del Subaru Outback 2016. Para {selected.name}{selected.year ? ` ${selected.year}` : ''} todavía no hay un manual verificado, así que no se identifican testigos.</Text> : <>
          {!result && <Text style={tipo.cuerpo}>Con el auto estacionado, encuadra el tablero completo y comprueba que los símbolos encendidos se vean nítidos.</Text>}
          {(result || permission?.granted) && (
            <View style={[styles.preview, result ? { aspectRatio: result.width / result.height } : { height: height * 0.46 }]}>
              {result ? <Image source={{ uri: result.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> :
              <CameraView style={StyleSheet.absoluteFill} ref={camera} facing="back"
                onCameraReady={() => setReady(true)}
                onMountError={() => { setReady(false); setError('No se pudo abrir la cámara. Vuelve al menú y reintenta.'); }} />}
              {result?.detections.map((box, index) => (
                <View key={index} pointerEvents="none" style={[styles.marker, {
                  left: `${100 * box.x / result.width}%`, top: `${100 * box.y / result.height}%`,
                  width: `${100 * box.w / result.width}%`, height: `${100 * box.h / result.height}%`,
                }]} />
              ))}
            </View>
          )}
          {ready && !busy && <Boton texto="Leer tablero" icono="camera" onPress={() => void scan('camera')} />}
          {!result && !busy && <>
            {!permission?.granted && <Boton texto={permission?.canAskAgain === false ? 'Abrir ajustes de cámara' : 'Permitir cámara'}
              icono="camera" onPress={() => permission?.canAskAgain === false ? void Linking.openSettings() : void requestPermission()} />}
            <Boton texto="Abrir foto del tablero" variante="secundario" icono="image-outline" onPress={() => void scan('file')} />
          </>}
          {busy && <Text style={tipo.cuerpo}>Leyendo el tablero…</Text>}
          {!!error && <Text accessibilityLiveRegion="polite" style={tipo.cuerpo}>{error}</Text>}
          {!busy && !error && result && lights.length === 0 && <Text accessibilityLiveRegion="polite" style={tipo.cuerpo}>No pude identificar un testigo compatible. Acerca el teléfono a las luces y evita los reflejos.</Text>}
          {!busy && lights.map(light => {
            const entry = guide[light];
            return (
              <View key={light} accessibilityLiveRegion="polite" style={styles.result}>
                <Text style={tipo.subtitulo}>Posible coincidencia</Text>
                <Text style={tipo.titulo}>{entry.title}</Text>
                <Text style={tipo.cuerpo}>{entry.text}</Text>
                <Text accessibilityRole="link" style={styles.link} onPress={() => {
                  Linking.openURL(manualUrl).catch(() => setError('No se pudo abrir el manual. Consulta la sección de testigos del manual del propietario.'));
                }}>Manual Subaru Outback 2016 · Testigos e indicadores · pág. {entry.page}</Text>
              </View>
            );
          })}
          {result !== undefined && <Boton texto="Volver a escanear" icono="refresh" onPress={() => {
            setResult(undefined);
            setError('');
          }} />}
          <Text style={tipo.nota}>Reconoce presión de aceite, sistema de carga, combustible y cinturón. Al dar contacto, varios testigos se encienden brevemente como autocomprobación. La cámara identifica símbolos y no confirma la causa mecánica.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.fondo },
  content: { padding: espacio.l, gap: espacio.m },
  preview: { width: '100%', backgroundColor: 'black', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  marker: { position: 'absolute', borderWidth: 1, borderColor: color.acento },
  result: { backgroundColor: color.superficie, padding: espacio.l, gap: espacio.s },
  link: { ...tipo.nota, color: color.acento, textDecorationLine: 'underline' },
});
