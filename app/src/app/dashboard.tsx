import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { guide, manualUrl } from '../dashboard/guide';
import { readDashboardPhoto } from '../dashboard/photo';
import type { WarningLight } from '../dashboard/recognize';
import { borrar, PantallaPermiso } from '../escaner/comun';
import { color, espacio, tipo } from '../theme';
import { Boton, BotonIcono } from '../ui';

export default function Dashboard() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const mounted = useRef(false);
  const scanning = useRef(false);
  const [captured, setCaptured] = useState<string>();
  useEffect(() => () => { if (captured) borrar(captured); }, [captured]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WarningLight | null>();
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function scan() {
    if (!ready || !camera.current || scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setError('');
    let uri: string | undefined;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.85, shutterSound: false });
      uri = photo?.uri;
      if (!uri) throw new Error('Missing capture');
      const light = await readDashboardPhoto(uri);
      if (mounted.current) {
        setCaptured(uri);
        uri = undefined;
        setReady(false);
        setResult(light);
      }
    } catch {
      if (mounted.current) setError('Falló la captura. Vuelve a intentarlo.');
    } finally {
      if (uri) borrar(uri);
      scanning.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const supported = vehicleId === 'outback';
  if (supported && permission && !permission.granted) {
    return <PantallaPermiso puedePreguntar={permission.canAskAgain} pedir={requestPermission} />;
  }
  const entry = result ? guide[result] : null;
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={tipo.titulo}>Escanear tablero</Text>
        {!supported ? <Text style={tipo.cuerpo}>El escáner tiene referencias del Subaru Outback 2016. Todavía no hay un manual verificado para el vehículo seleccionado.</Text> : <>
          {!captured && <Text style={tipo.cuerpo}>Con el auto estacionado, centra un solo testigo encendido dentro del recuadro. Acerca el teléfono hasta ver su forma con claridad.</Text>}
          {permission?.granted && (
            <View style={[styles.preview, captured && styles.capturedPreview]}>
              {captured ? <Image source={{ uri: captured }} style={[StyleSheet.absoluteFill, styles.capturedImage]} resizeMode="cover" /> :
              <CameraView style={StyleSheet.absoluteFill} ref={camera} facing="back" ratio="4:3"
                onCameraReady={() => setReady(true)}
                onMountError={() => { setReady(false); setError('No se pudo abrir la cámara. Vuelve al menú y reintenta.'); }} />}
              {!captured && <View pointerEvents="none" style={styles.target} />}
            </View>
          )}
          {ready && !busy && <Boton texto="Leer testigo" icono="camera" onPress={() => void scan()} />}
          {busy && <Text style={tipo.cuerpo}>Leyendo el testigo…</Text>}
          {!!error && <Text accessibilityLiveRegion="polite" style={tipo.cuerpo}>{error}</Text>}
          {!busy && !error && result === null && <Text accessibilityLiveRegion="polite" style={tipo.cuerpo}>No pude identificar el testigo. Evita reflejos y encuadra solo el símbolo completo.</Text>}
          {!busy && entry && <View accessibilityLiveRegion="polite" style={styles.result}>
            <Text style={tipo.subtitulo}>Posible coincidencia</Text>
            <Text style={tipo.titulo}>{entry.title}</Text>
            <Text style={tipo.cuerpo}>{entry.text}</Text>
            <Text accessibilityRole="link" style={styles.link} onPress={() => {
              Linking.openURL(manualUrl).catch(() => setError('No se pudo abrir el manual. Consulta la sección de testigos del manual del propietario.'));
            }}>Manual Subaru Outback 2016 · Testigos e indicadores · pág. {entry.page}</Text>
          </View>}
          {result !== undefined && <Boton texto="Escanear otro testigo" icono="refresh" onPress={() => {
            setCaptured(undefined);
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
  preview: { width: '100%', aspectRatio: 3 / 4, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  capturedPreview: { width: 160, aspectRatio: 1, alignSelf: 'center' },
  capturedImage: { transform: [{ scale: 2.5 }] },
  target: { width: '40%', aspectRatio: 1, borderWidth: 2, borderColor: color.acento },
  result: { backgroundColor: color.superficie, padding: espacio.l, gap: espacio.s },
  link: { ...tipo.nota, color: color.acento, textDecorationLine: 'underline' },
});
