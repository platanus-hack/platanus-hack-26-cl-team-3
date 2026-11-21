import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Icono, Insignia, type NombreIcono } from '../ui';

import { useVehicleSelection } from '../plates/selection';
import { vehicles } from '../vehicles';

// Planned MVP features from the README.
const PROXIMAMENTE: { icono: NombreIcono; titulo: string; detalle: string }[] = [
  { icono: 'lightbulb-outline', titulo: 'Ampolletas', detalle: 'Cuál lleva y cómo cambiarla' },
  { icono: 'fuse', titulo: 'Fusibles', detalle: 'Dónde está cada uno' },
];

export default function Menu() {
  const insets = useSafeAreaInsets();
  const { vehicle, setVehicle } = useVehicleSelection();
  const [vehicleOptionsOpen, setVehicleOptionsOpen] = useState(false);
  const vehiclePicker = useRef<ComponentRef<typeof Pressable>>(null);
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView
      style={styles.raiz}
      contentContainerStyle={[styles.contenido, { paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.xl }]}
    >
      <View style={styles.cabecera}>
        <View style={styles.marca}>
          <View style={styles.logo}>
            <Icono nombre="car-wrench" tam={26} tono={color.acentoTexto} />
          </View>
          <View>
            <Text style={tipo.titulo}>Capo AR</Text>
            <Text style={tipo.subtitulo}>Tu guía bajo el capó</Text>
          </View>
        </View>
        <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
      </View>

      <Pressable
        ref={vehiclePicker}
        onPress={() => setVehicleOptionsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel={`Elegir auto. Actual: ${vehicle.name} ${vehicle.year ?? ''}, ${vehicle.engine}`}
        aria-expanded={vehicleOptionsOpen}
        style={styles.vehiclePicker}
      >
        <Icono nombre="car-info" tam={28} tono={color.textoSuave} />
        <View style={styles.flex}>
          <Text style={styles.vehicleLabel}>Tu auto</Text>
          <Text style={styles.vehicleName}>{vehicle.name} {vehicle.year}</Text>
          <Text style={tipo.nota}>{vehicle.engine}</Text>
        </View>
        <Icono nombre={vehicleOptionsOpen ? 'chevron-up' : 'chevron-down'} tono={color.textoSuave} />
      </Pressable>

      {vehicleOptionsOpen && (
        <View role="group" accessibilityLabel="Modelos disponibles" style={styles.vehicleList}>
          <Pressable
            accessibilityRole="button"
            style={styles.vehicleOption}
            onPress={() => {
              setVehicleOptionsOpen(false);
              router.push('/recognize-vehicle');
            }}
          >
            <Icono nombre="camera-outline" tono={color.acento} />
            <Text style={styles.vehicleName}>Reconocer auto</Text>
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
                style={[styles.vehicleOption, checked && styles.selectedOption]}
              >
                <View style={styles.flex}>
                  <Text style={styles.vehicleName}>{option.name} {option.year}</Text>
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

      <Pressable
        onPress={() => router.push({ pathname: '/escanear', params: { vehicleId: vehicle.id } })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.principal, pressed && { opacity: 0.88 }]}
      >
        <View style={styles.principalIcono}>
          <Icono nombre="engine" tam={34} tono={color.acentoTexto} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.principalTitulo}>Escanear capó</Text>
          <Text style={styles.principalDetalle}>Abre el capó y apunta la cámara al motor.</Text>
        </View>
        <Icono nombre="chevron-right" tam={28} tono={color.acentoTexto} />
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: '/dashboard', params: { vehicleId: vehicle.id } })}
        accessibilityRole="button"
        style={styles.secundaria}
      >
        <Icono nombre="car-light-alert" tam={26} tono={color.acento} />
        <View style={styles.flex}>
          <Text style={styles.secundariaTitulo}>Escanear tablero</Text>
          <Text style={tipo.nota}>Identifica los testigos encendidos del tablero.</Text>
        </View>
        <Icono nombre="chevron-right" tam={24} tono={color.textoSuave} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/ask')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.secundaria, pressed && { opacity: 0.88 }]}
      >
        <Icono nombre="book-open-variant" tam={26} tono={color.acento} />
        <View style={styles.flex}>
          <Text style={styles.secundariaTitulo}>Manual del Subaru Outback 2016</Text>
          <Text style={tipo.nota}>Consulta el manual del motor 3.6R.</Text>
        </View>
        <Icono nombre="chevron-right" tam={24} tono={color.textoSuave} />
      </Pressable>

      <Text style={[tipo.seccion, styles.seccion]}>Próximamente</Text>
      <View style={styles.rejilla}>
        {PROXIMAMENTE.map((f) => (
          <View key={f.titulo} style={styles.celda} accessibilityState={{ disabled: true }}>
            <Icono nombre={f.icono} tam={26} tono={color.textoTenue} />
            <Text style={styles.celdaTitulo}>{f.titulo}</Text>
            <Text style={styles.celdaDetalle}>{f.detalle}</Text>
            <View style={styles.celdaInsignia}>
              <Insignia texto="PRONTO" />
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push('/aviso')} style={styles.pie} accessibilityRole="link">
        <Icono nombre="shield-alert-outline" tam={16} tono={color.textoTenue} />
        <Text style={styles.pieTexto}>
          Guía informativa: no reemplaza el manual ni a un mecánico. Ver aviso y fuentes.
        </Text>
      </Pressable>
      {!!version && <Text style={styles.version}>Versión {version}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
  contenido: { paddingHorizontal: espacio.xl },
  flex: { flex: 1 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.xl },
  marca: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radio.m,
    backgroundColor: color.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    padding: espacio.l,
    backgroundColor: color.superficie,
    borderColor: color.borde,
    borderWidth: 1,
    borderRadius: radio.l,
  },
  vehicleLabel: { fontSize: 12, color: color.textoSuave, fontWeight: '600' },
  vehicleName: { fontSize: 17, color: color.texto, fontWeight: '700', marginTop: 2 },
  vehicleList: {
    marginTop: espacio.s,
    borderColor: color.borde,
    borderWidth: 1,
    borderRadius: radio.l,
    backgroundColor: color.superficie,
    overflow: 'hidden',
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingVertical: espacio.m,
    paddingHorizontal: espacio.l,
  },
  selectedOption: { backgroundColor: color.acentoSuave },
  principal: {
    marginTop: espacio.l,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
    backgroundColor: color.acento,
    borderRadius: radio.xl,
    padding: espacio.xl,
  },
  principalIcono: {
    width: 60,
    height: 60,
    borderRadius: radio.l,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  principalTitulo: { fontSize: 21, fontWeight: '800', color: color.acentoTexto },
  principalDetalle: { fontSize: 14, color: 'rgba(26,19,0,0.78)', marginTop: 4, lineHeight: 19 },
  secundaria: {
    marginTop: espacio.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
    backgroundColor: color.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: color.borde,
    padding: espacio.l,
  },
  secundariaTitulo: { fontSize: 16, fontWeight: '700', color: color.texto },
  seccion: { marginTop: espacio.xxl, marginBottom: espacio.m },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.m },
  celda: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: color.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: color.borde,
    padding: espacio.l,
    minHeight: 128,
  },
  celdaTitulo: { fontSize: 15, fontWeight: '700', color: color.textoSuave, marginTop: espacio.m },
  celdaDetalle: { fontSize: 12, color: color.textoTenue, marginTop: 2 },
  celdaInsignia: { position: 'absolute', top: espacio.m, right: espacio.m },
  pie: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.xxl, justifyContent: 'center' },
  pieTexto: { fontSize: 12, color: color.textoTenue, textAlign: 'center', flexShrink: 1 },
  version: { fontSize: 11, color: color.textoTenue, textAlign: 'center', marginTop: espacio.s },
});
