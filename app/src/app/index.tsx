import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Icono, Insignia, Tarjeta, type NombreIcono } from '../ui';

// Funciones del MVP (README, sección 5) que aún no están hechas: se muestran para orientar, sin acción.
const PROXIMAMENTE: { icono: NombreIcono; titulo: string; detalle: string }[] = [
  { icono: 'car-light-alert', titulo: 'Luces del tablero', detalle: 'Qué significa cada una' },
  { icono: 'lightbulb-outline', titulo: 'Ampolletas', detalle: 'Cuál lleva y cómo cambiarla' },
  { icono: 'fuse', titulo: 'Fusibles', detalle: 'Dónde está cada uno' },
];

export default function Menu() {
  const insets = useSafeAreaInsets();
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

      <Tarjeta estilo={styles.auto}>
        <Icono nombre="car-info" tam={28} tono={color.textoSuave} />
        <View style={styles.flex}>
          <Text style={styles.autoEtiqueta}>Tu auto</Text>
          <Text style={styles.autoNombre}>Subaru Outback 2016</Text>
          <Text style={tipo.nota}>Motor 3.6R (EZ36)</Text>
        </View>
        <Insignia texto="ÚNICO DISPONIBLE" />
      </Tarjeta>

      <Pressable
        onPress={() => router.push('/escanear')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.principal, pressed && { opacity: 0.88 }]}
      >
        <View style={styles.principalIcono}>
          <Icono nombre="engine" tam={34} tono={color.acentoTexto} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.principalTitulo}>Escanear capó</Text>
          <Text style={styles.principalDetalle}>Abre el capó y apunta la cámara al motor: la app lo reconoce.</Text>
        </View>
        <Icono nombre="chevron-right" tam={28} tono={color.acentoTexto} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/ask')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.secundaria, pressed && { opacity: 0.88 }]}
      >
        <Icono nombre="book-open-variant" tam={26} tono={color.acento} />
        <View style={styles.flex}>
          <Text style={styles.secundariaTitulo}>Preguntar al manual</Text>
          <Text style={tipo.nota}>Cuéntanos la falla y te respondemos con citas.</Text>
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
  auto: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  autoEtiqueta: { fontSize: 12, color: color.textoTenue, fontWeight: '600' },
  autoNombre: { fontSize: 17, color: color.texto, fontWeight: '700', marginTop: 2 },
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
