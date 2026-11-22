import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useVehicleSelection } from '../../plates/selection';
import { color, tipo } from '../../theme';
import { BotonIcono, Icono } from '../../ui';
import { buildActual } from '../../buildActual';
import { describeBuild } from '../../version';
import { vehicles } from '../../vehicles';

const photos = new Map<string, number>([
  ['outback', require('../../../assets/vehicles/outback.webp')],
  ['swift', require('../../../assets/vehicles/swift.webp')],
  ['onix', require('../../../assets/vehicles/onix.webp')],
  ['tracker', require('../../../assets/vehicles/tracker.webp')],
  ['rio', require('../../../assets/vehicles/rio.webp')],
  ['tucson', require('../../../assets/vehicles/tucson.webp')],
  ['ranger', require('../../../assets/vehicles/ranger.webp')],
  ['corolla', require('../../../assets/vehicles/corolla.webp')],
  ['cx5', require('../../../assets/vehicles/cx5.webp')],
]);

export default function Menu() {
  const insets = useSafeAreaInsets();
  const { vehicle, setVehicle } = useVehicleSelection();
  const [vehicleOptionsOpen, setVehicleOptionsOpen] = useState(false);
  const vehiclePicker = useRef<ComponentRef<typeof Pressable>>(null);
  const photo = photos.get(vehicle.id);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BotonIcono icono="cog-outline" etiqueta="Ajustes del asistente" onPress={() => router.push('/ajustes')} />
        <Image accessibilityLabel="Hoodini" source={require('../../../assets/hoodini-wordmark.png')} resizeMode="contain" style={styles.wordmark} />
        <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
      </View>
      <Pressable ref={vehiclePicker} accessibilityRole="button" aria-expanded={vehicleOptionsOpen}
        accessibilityLabel={`Elegir auto. Actual: ${vehicle.name} ${vehicle.year ?? ''}, ${vehicle.engine}`}
        onPress={() => setVehicleOptionsOpen(open => !open)} style={styles.picker}>
        <View style={styles.flex}>
          <Text style={tipo.nota}>Tu auto</Text>
          <Text style={styles.title}>{vehicle.name}</Text>
          <Text style={tipo.subtitulo}>{[vehicle.year, vehicle.engine].filter(Boolean).join('  ·  ')}</Text>
        </View>
        <Icono nombre={vehicleOptionsOpen ? 'chevron-up' : 'chevron-down'} />
      </Pressable>
      {vehicleOptionsOpen && (
        <View role="group" accessibilityLabel="Modelos disponibles" style={styles.list}>
          <Pressable
            accessibilityRole="button"
            style={styles.vehicleOption}
            onPress={() => {
              setVehicleOptionsOpen(false);
              router.push('/recognize-vehicle');
            }}
          >
            <Icono nombre="camera-outline" tono={color.acento} />
            <Text style={styles.optionName}>Reconocer auto</Text>
          </Pressable>
          {vehicles.map((option) => {
            const checked = option.id === vehicle.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  setVehicle(option);
                  setVehicleOptionsOpen(false);
                  vehiclePicker.current?.focus();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${option.name} ${option.year}, ${option.engine}`}
                aria-pressed={checked}
                accessibilityState={{ selected: checked }}
                style={[styles.vehicleOption, checked && styles.selected]}
              >
                <View style={styles.flex}>
                  <Text style={styles.optionName}>{option.name} {option.year}</Text>
                  <Text style={tipo.nota}>{option.engine}</Text>
                </View>
                <Icono
                  nombre={checked ? 'radiobox-marked' : 'radiobox-blank'}
                  tono={checked ? color.acento : color.textoSuave}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {!vehicleOptionsOpen && photo !== undefined && (
        <Image accessible={false} source={photo} style={styles.photo} resizeMode="contain" />
      )}
      <Pressable accessibilityRole="button" style={styles.mediaAction}
        onPress={() => router.push({ pathname: '/analizar', params: { vehicleId: vehicle.id } })}>
        <Icono nombre="image-search-outline" tono={color.acento} />
        <Text style={[styles.optionName, styles.flex]}>Analizar foto o video</Text>
        <Icono nombre="chevron-right" tono={color.textoSuave} />
      </Pressable>
      <Text style={styles.upcoming}>Próximamente</Text>
      <View style={styles.upcomingRow}><Icono nombre="lightbulb-outline" tono={color.textoSuave} /><Text style={tipo.subtitulo}>Ampolletas</Text></View>
      <View style={styles.upcomingRow}><Icono nombre="fuse" tono={color.textoSuave} /><Text style={tipo.subtitulo}>Fusibles</Text></View>
      <View style={styles.space} />
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/escanear', params: { vehicleId: vehicle.id } })}
        style={({ pressed }) => [styles.scan, pressed && styles.pressed]}>
        {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, index) =>
          <View key={index} pointerEvents="none" style={[styles.corner, corner]} />)}
        <Text style={styles.scanText}>Escanear motor</Text>
      </Pressable>
      <Text selectable style={styles.version}>{describeBuild(buildActual())}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.fondo },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  wordmark: { width: 112, height: 23 },
  flex: { flex: 1 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -1.2, color: color.texto, marginVertical: 5 },
  photo: { width: '100%', height: 176, marginVertical: 12 },
  list: { marginVertical: 12 },
  vehicleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 48 },
  selected: { backgroundColor: color.acentoSuave, borderRadius: 12 },
  optionName: { color: color.texto, fontSize: 16, fontWeight: '600' },
  mediaAction: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  upcoming: { ...tipo.nota, marginTop: 14, marginBottom: 8 },
  upcomingRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 36 },
  version: { ...tipo.nota, fontSize: 11, marginTop: 12, textAlign: 'center' },
  space: { flex: 1, minHeight: 20 },
  scan: { marginHorizontal: 12, alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: 62 },
  scanText: { fontSize: 21, fontWeight: '700', color: color.texto },
  corner: { position: 'absolute', width: 16, height: 16, borderColor: color.acento },
  topLeft: { top: 0, left: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  topRight: { top: 0, right: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bottomLeft: { bottom: 0, left: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  bottomRight: { bottom: 0, right: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  pressed: { backgroundColor: color.acentoSuave },
});
