// Piezas compartidas por los dos escáneres (con AR y sin AR).
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONFIANZA_MIN } from '../detector/vano';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono, Icono, type NombreIcono } from '../ui';
import { useVehicleSelection } from '../plates/selection';
import { vehicles } from '../vehicles';

// La detección sale del propio contorno (umbrales en detector/vano.ts). El puntaje «capó abierto» de CLIP quedó solo
// como dato de debug: fallaba al apuntar a una pantalla.
export { CONFIANZA_MIN, vanoValido } from '../detector/vano';
export const SUAVIZADO = 0.5; // peso del análisis nuevo en las medias móviles

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function borrar(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // caché temporal
  }
}

/** Media móvil del puntaje «capó abierto» de CLIP (solo informativo, se muestra en debug). */
export class PuntajeCapo {
  media = 0;
  private n = 0;

  agregar(p: number) {
    this.n += 1;
    this.media = this.n === 1 ? p : SUAVIZADO * p + (1 - SUAVIZADO) * this.media;
    return this;
  }
}

export function BarraSuperior({ debug, alCambiarDebug }: { debug: boolean; alCambiarDebug: () => void }) {
  const insets = useSafeAreaInsets();
  // Vehículo elegido en el menú (llega como parámetro de la ruta /escanear).
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const { vehicle: selected } = useVehicleSelection();
  const vehicle = selected.id === vehicleId ? selected : vehicles.find((option) => option.id === vehicleId);
  return (
    <View style={[estilos.barra, { paddingTop: insets.top + espacio.s }]}>
      <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
      <View style={estilos.scanTitle}>
        <Text style={estilos.barraTitulo}>Escanear capó</Text>
        {vehicle && (
          <Text style={estilos.scanVehicle} numberOfLines={1}>
            {vehicle.name} {vehicle.year} · {vehicle.engine}
          </Text>
        )}
      </View>
      <View style={estilos.fila}>
        <Pressable
          onPress={alCambiarDebug}
          accessibilityRole="switch"
          accessibilityState={{ checked: debug }}
          accessibilityLabel="Modo debug"
          style={[estilos.chip, debug && estilos.chipActivo]}
        >
          <Icono nombre="bug-outline" tam={16} tono={debug ? color.acentoTexto : color.texto} />
          <Text style={[estilos.chipTexto, debug && { color: color.acentoTexto }]}>Debug</Text>
        </Pressable>
        <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
      </View>
    </View>
  );
}

export function PantallaPermiso({ puedePreguntar, pedir }: { puedePreguntar: boolean; pedir: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[estilos.raiz, { paddingTop: insets.top }]}>
      <View style={[estilos.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
      </View>
      <View style={estilos.centro}>
        <View style={estilos.iconoGrande}>
          <Icono nombre="camera-off" tam={36} tono={color.acento} />
        </View>
        <Text style={[tipo.titulo, estilos.textoCentro]}>Necesitamos la cámara</Text>
        <Text style={[tipo.nota, estilos.textoCentro, { marginTop: espacio.s, marginBottom: espacio.xl }]}>
          La usamos para reconocer el capó o un testigo del tablero. Las imágenes se analizan en tu teléfono y no se envían a ningún lado.
        </Text>
        <Boton
          texto={puedePreguntar ? 'Permitir cámara' : 'Abrir ajustes'}
          icono={puedePreguntar ? 'camera-iris' : 'cog'}
          onPress={puedePreguntar ? pedir : () => Linking.openSettings()}
        />
        {!puedePreguntar && (
          <Text style={[tipo.nota, estilos.textoCentro, { marginTop: espacio.l }]}>
            El permiso fue denegado. Actívalo en los ajustes de la app.
          </Text>
        )}
      </View>
    </View>
  );
}

/** Panel inferior translúcido. */
export function Panel({ children, onLayout }: { children: ReactNode; onLayout?: (e: LayoutChangeEvent) => void }) {
  const insets = useSafeAreaInsets();
  return <View onLayout={onLayout} style={[estilos.panel, { marginBottom: insets.bottom + espacio.l }]}>{children}</View>;
}

export function Encabezado({ icono, tono, titulo, cargando }: { icono?: NombreIcono; tono?: string; titulo: string; cargando?: boolean }) {
  return (
    <View style={estilos.fila}>
      {cargando ? <ActivityIndicator color={color.acento} /> : icono ? <Icono nombre={icono} tam={26} tono={tono} /> : null}
      <Text style={estilos.panelTitulo}>{titulo}</Text>
    </View>
  );
}

export function Detalle({ children }: { children: ReactNode }) {
  return <Text style={[tipo.nota, estilos.panelDetalle]}>{children}</Text>;
}

export function Medidor({ puntaje, tono }: { puntaje: number; tono: string }) {
  const pct = Math.round(puntaje * 100);
  return (
    <View style={estilos.medidor}>
      <View style={estilos.medidorFila}>
        <Text style={estilos.medidorEtiqueta}>Confianza del contorno</Text>
        <Text style={[estilos.medidorValor, { color: tono }]}>{pct} %</Text>
      </View>
      <View style={estilos.pista}>
        <View style={[estilos.relleno, { width: `${pct}%`, backgroundColor: tono }]} />
        <View style={[estilos.marcaUmbral, { left: `${CONFIANZA_MIN * 100}%` }]} />
      </View>
    </View>
  );
}

export function LineaDebug({ texto }: { texto: string }) {
  return <Text style={estilos.debug}>{texto}</Text>;
}

export const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.xl },
  textoCentro: { textAlign: 'center' },
  iconoGrande: {
    width: 72,
    height: 72,
    borderRadius: radio.xl,
    backgroundColor: color.acentoSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacio.l,
  },
  barra: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.s,
  },
  scanTitle: { flex: 1, alignItems: 'center', paddingHorizontal: espacio.s },
  scanVehicle: { color: color.texto, fontSize: 13, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  barraTitulo: { color: color.texto, fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(23, 27, 34, 0.85)',
    borderWidth: 1,
    borderColor: color.borde,
  },
  chipActivo: { backgroundColor: color.acento, borderColor: color.acento },
  chipTexto: { fontSize: 12, fontWeight: '700', color: color.texto },
  panel: {
    position: 'absolute',
    left: espacio.l,
    right: espacio.l,
    bottom: 0,
    backgroundColor: color.velo,
    borderRadius: radio.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: espacio.l,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  panelTitulo: { fontSize: 18, fontWeight: '800', color: color.texto, flexShrink: 1 },
  panelDetalle: { marginTop: espacio.s },
  medidor: { marginTop: espacio.l },
  medidorFila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  medidorEtiqueta: { fontSize: 12, fontWeight: '700', color: color.textoSuave, letterSpacing: 0.4 },
  medidorValor: { fontSize: 13, fontWeight: '800' },
  pista: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4 },
  marcaUmbral: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  debug: { fontSize: 11, color: color.textoTenue, marginTop: espacio.m, textAlign: 'right' },
  botones: { flexDirection: 'row', gap: espacio.m, marginTop: espacio.m },
});
