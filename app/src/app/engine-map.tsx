import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engineMaps, parts, type PartId } from '../engine-maps/catalog';
import { EngineScene, oblique, overhead } from '../engine-maps/EngineScene';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Icono, Tarjeta } from '../ui';
import { vehicles, type Vehicle } from '../vehicles';

type Mode = 'scheme' | 'overlay' | 'photo';

export default function EngineMapScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const vehicle = vehicles.find(option => option.id === vehicleId);
  const insets = useSafeAreaInsets();
  const [sceneActive, setSceneActive] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      scrollEnabled={!sceneActive}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.xl }]}
    >
      <View style={styles.header}>
        <BotonIcono
          icono="arrow-left"
          etiqueta="Volver al inicio"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        />
        <Text accessibilityRole="header" style={tipo.titulo}>Mapa del motor</Text>
      </View>
      {vehicle
        ? <VehicleMap key={vehicle.id} vehicle={vehicle} onInteraction={setSceneActive} />
        : <Text style={tipo.cuerpo}>Elige un auto en el menú para ver su mapa.</Text>}
    </ScrollView>
  );
}

function VehicleMap({ vehicle, onInteraction }: { vehicle: Vehicle; onInteraction: (active: boolean) => void }) {
  const map = engineMaps[vehicle.id];
  const photo = map.photo;
  const [mode, setMode] = useState<Mode>('scheme');
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [camera, setCamera] = useState(oblique);
  const [selected, setSelected] = useState<PartId | null>(null);
  const topView = camera.yaw === overhead.yaw && camera.pitch === overhead.pitch;
  const photoVisible = mode !== 'scheme' && photoStatus === 'ready';
  const photoOnly = photoVisible && mode === 'photo';
  const scene = photoVisible && photo ? photo : map;
  const part = selected && scene.volumes.some(volume => volume.part === selected) ? selected : null;

  function chooseMode(next: Mode) {
    if (next !== 'scheme' && (photoStatus === 'idle' || photoStatus === 'failed')) setPhotoStatus('loading');
    setMode(next);
  }

  const status = photoStatus === 'failed'
    ? 'La foto no se pudo cargar. El esquema sigue disponible.'
    : mode !== 'scheme' && !photoVisible ? 'Cargando foto del motor…' : null;

  return (
    <>
      <View>
        <Text accessibilityRole="header" style={styles.vehicle}>{vehicle.name} {vehicle.year}</Text>
        <Text style={tipo.subtitulo}>{map.referenceVariant}</Text>
      </View>
      <EngineScene
        aspectRatio={scene.aspectRatio ?? 1.65}
        volumes={photoOnly ? [] : scene.volumes}
        selected={part}
        camera={camera}
        setCamera={setCamera}
        onPart={setSelected}
        onInteraction={onInteraction}
        photoUrl={photoStatus === 'loading' || photoVisible ? photo?.url : undefined}
        photoVisible={photoVisible}
        onPhotoLoad={() => setPhotoStatus('ready')}
        onPhotoError={() => {
          setPhotoStatus('failed');
          setMode('scheme');
        }}
      />
      <View style={styles.controls}>
        {photo && (
          <>
            <Choice label="Esquema 3D" active={mode === 'scheme'} onPress={() => chooseMode('scheme')} />
            <Choice label="Foto + 3D" active={mode === 'overlay'} onPress={() => chooseMode('overlay')} />
            <Choice label="Solo foto" active={mode === 'photo'} onPress={() => chooseMode('photo')} />
          </>
        )}
        <Choice label="Vista superior" active={topView} onPress={() => setCamera(topView ? oblique : overhead)} />
      </View>
      {status && <Text style={tipo.nota} accessibilityLiveRegion="polite">{status}</Text>}
      {photoVisible && photo && <Text style={tipo.nota}>{photo.credit}</Text>}
      {photoOnly ? (
        <Text style={tipo.nota}>Arrastra la foto para girarla.</Text>
      ) : (
        <>
          <Tarjeta estilo={styles.detail}>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.detailTitle}>
              {part ? parts[part][0] : 'Selecciona una pieza'}
            </Text>
            <Text style={tipo.cuerpo}>
              {part ? map.partDetails?.[part] ?? parts[part][1] : 'Toca un volumen o elige una pieza de la lista. Arrastra el mapa para girarlo.'}
            </Text>
            {part === 'fuses' && map.fuseUrl && <Source label="Diagrama de fusibles del motor" url={map.fuseUrl} />}
          </Tarjeta>
          <View style={styles.controls} accessibilityLabel="Piezas del motor">
            {scene.volumes.map(({ part: id }) => (
              <Choice key={id} label={parts[id][0]} active={part === id} onPress={() => setSelected(id)} />
            ))}
          </View>
        </>
      )}
      <Text style={tipo.nota}>Ubicaciones y alturas aproximadas. Confirma las piezas en el manual de tu vehículo.</Text>
      <View style={styles.sources}>
        <Source label="Manual del propietario" url={map.manualUrl} />
        {map.engineDiagramUrl && <Source label="Plano del vano motor 3.6 L" url={map.engineDiagramUrl} />}
        {map.cabinFuseUrl && <Source label="Diagrama de fusibles del habitáculo" url={map.cabinFuseUrl} />}
      </View>
    </>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && { opacity: .75 }]}
    >
      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Source({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      style={styles.source}
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir el enlace'))}
    >
      <Icono nombre="open-in-new" tam={16} tono={color.acento} />
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.fondo },
  content: { paddingHorizontal: espacio.l, gap: espacio.m },
  header: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginBottom: espacio.s },
  vehicle: { fontSize: 21, fontWeight: '800', color: color.texto },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  choice: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: espacio.m,
    borderRadius: radio.m, borderWidth: 1, borderColor: color.borde, backgroundColor: color.superficie,
  },
  choiceActive: { borderColor: color.acento, backgroundColor: color.acentoSuave },
  choiceLabel: { color: color.texto, fontSize: 13, fontWeight: '600' },
  choiceLabelActive: { color: color.acento },
  detail: { gap: espacio.s },
  detailTitle: { color: color.texto, fontSize: 17, fontWeight: '800' },
  sources: { gap: espacio.xs },
  source: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  sourceLabel: { ...tipo.cuerpo, color: color.acento, flexShrink: 1 },
});
