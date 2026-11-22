import { useScannerPermission } from '../useScannerPermission';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arDisponible, VistaAR } from '../../modules/capo-ar';
import EscanerAR from '../escaner/EscanerAR';
import EscanerCamara from '../escaner/EscanerCamara';
import { estilos, PantallaPermiso } from '../escaner/comun';
import { readGuide } from '../chat/camera';
import { parts, type PartId } from '../engine-maps/catalog';
import { color, espacio, tipo } from '../theme';
import { Boton, Icono } from '../ui';
import { vehicles } from '../vehicles';

/** expo-router muestra esto si la pantalla falla al dibujarse: mensaje en vez de cerrar la app. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[estilos.raiz, estilos.centro, { backgroundColor: color.fondo, paddingTop: insets.top }]}>
      <View style={estilos.iconoGrande}>
        <Icono nombre="alert-circle-outline" tam={36} tono={color.peligro} />
      </View>
      <Text style={[tipo.titulo, estilos.textoCentro]}>El escáner falló</Text>
      <Text style={[tipo.nota, estilos.textoCentro, { marginTop: espacio.s, marginBottom: espacio.xl }]}>{error.message}</Text>
      <Boton texto="Reintentar" icono="refresh" onPress={() => void retry()} />
      <Boton texto="Volver al menú" variante="secundario" onPress={() => router.back()} estilo={{ marginTop: espacio.m }} />
    </View>
  );
}

/** Con ARCore: escáner que ancla el contorno al auto. Sin ARCore: escáner de fotos (el contorno no queda fijo). */
export default function Escanear() {
  const { vehicleId, part, action, instruction, steps, step, vivo } = useLocalSearchParams<{
    vehicleId?: string; part?: string; action?: string; instruction?: string; steps?: string; step?: string; vivo?: string;
  }>();
  const guide = readGuide({ part, instruction, action, steps, step });
  const guidePart = part && Object.hasOwn(parts, part) ? (part as PartId) : undefined;
  const vehicle = vehicles.find(option => option.id === vehicleId);
  const [permiso, pedirPermiso] = useScannerPermission();
  const [conAR, setConAR] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    arDisponible().then((ok) => vivo && setConAR(ok && !!VistaAR));
    return () => {
      vivo = false;
    };
  }, []);

  if (!permiso || conAR === null) return <View style={estilos.raiz} />;
  if (!permiso.granted) return <PantallaPermiso puedePreguntar={permiso.canAskAgain} pedir={pedirPermiso} />;
  return conAR ? <EscanerAR key={JSON.stringify([vehicle?.id, guidePart, action, vivo])} vehicle={vehicle} initialPart={guidePart} steps={guide.steps} initialStep={guide.step} vivo={vivo === '1'} /> : <EscanerCamara />;
}
