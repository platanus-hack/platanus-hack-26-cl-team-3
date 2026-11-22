// Piezas compartidas por los dos escáneres (con AR y sin AR).
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONFIANZA_MIN } from '../detector/vano';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono, Icono, type NombreIcono } from '../ui';
import { useVehicleSelection } from '../plates/selection';
import { GuideBanner } from './GuideBanner';
import { parts, type PartId } from '../engine-maps/catalog';
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

const SONNET_KEY = 'capo-ar:anclaje-sonnet:v1';

export function useScannerControls(hasError: boolean) {
  type Mode = 'compact' | 'details' | 'hidden';
  const [view, setView] = useState<{ mode: Mode; hasError: boolean }>({ mode: 'compact', hasError });
  const [diagnostics, setDiagnostics] = useState(false);
  const [sonnetAnchor, setSonnetAnchor] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SONNET_KEY).then((value) => setSonnetAnchor(value === '1')).catch(() => {});
  }, []);
  const mode = hasError === view.hasError ? view.mode : 'compact';
  const setMode = (mode: Mode) => setView({ mode, hasError });
  return { mode, setMode, hasError, debug: diagnostics && mode !== 'hidden', toggleDebug: () => setDiagnostics(value => !value),
    sonnetAnchor,
    toggleSonnetAnchor: () => setSonnetAnchor((value) => {
      AsyncStorage.setItem(SONNET_KEY, value ? '0' : '1').catch(() => {});
      return !value;
    }),
  };
}

export function ScannerControls({ controls, status, children, top, captions, step, conversation }: {
  controls: ReturnType<typeof useScannerControls>;
  status: string;
  children: ReactNode;
  top?: ReactNode;
  captions?: ReactNode;
  conversation?: { enabled: boolean; ended: boolean; error: string; toggle: () => void };
  step?: { part: PartId; instruction: string };
}) {
  const insets = useSafeAreaInsets();
  const { mode, setMode, debug, toggleDebug, hasError, sonnetAnchor, toggleSonnetAnchor } = controls;
  const expanded = mode === 'details';
  const hidden = mode === 'hidden';
  const { vehicleId, instruction, part } = useLocalSearchParams<{vehicleId?: string; instruction?: string; part?: string}>();
  const { vehicle: selected } = useVehicleSelection();
  const vehicle = selected.id === vehicleId ? selected : vehicles.find((option) => option.id === vehicleId);
  const guideInstruction = step?.instruction ?? (conversation?.ended ? undefined : instruction);
  const guidePart = part && Object.hasOwn(parts, part) ? part as PartId : undefined;
  return (
    <>
      <View pointerEvents="box-none" style={[estilos.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        {top && <View pointerEvents="box-none" style={estilos.barraCentro}>{top}</View>}
        <BotonIcono icono={hidden ? 'eye-off-outline' : 'eye-outline'}
          etiqueta={hidden ? 'Mostrar controles' : 'Ocultar controles'}
          onPress={() => setMode(hidden ? 'compact' : 'hidden')} />
      </View>
      {!hidden && (
        <View pointerEvents="box-none" style={[estilos.dock, { bottom: insets.bottom + espacio.m }]}>
          {expanded && (
            <ScrollView style={estilos.panel} contentContainerStyle={estilos.details} keyboardShouldPersistTaps="handled">
              {debug && vehicle && <Text style={tipo.nota}>{vehicle.name} {vehicle.year} · {vehicle.engine}</Text>}
              {guideInstruction && <GuideBanner part={step?.part ?? guidePart} instruction={guideInstruction} />}
              {children}
              <View style={estilos.options}>
                <Pressable accessibilityRole="switch" accessibilityState={{checked: debug}} onPress={toggleDebug}
                  style={[estilos.chip, debug && estilos.chipActivo]}>
                  <Icono nombre="bug-outline" tam={16} tono={debug ? color.acentoTexto : color.texto} />
                  <Text style={[estilos.chipTexto, debug && {color: color.acentoTexto}]}>Diagnóstico</Text>
                </Pressable>
                <Pressable accessibilityRole="switch" accessibilityState={{checked: sonnetAnchor}} onPress={toggleSonnetAnchor}
                  style={[estilos.chip, sonnetAnchor && estilos.chipActivo]}>
                  <Icono nombre="creation" tam={16} tono={sonnetAnchor ? color.acentoTexto : color.texto} />
                  <Text style={[estilos.chipTexto, sonnetAnchor && {color: color.acentoTexto}]}>Anclaje con Sonnet</Text>
                </Pressable>
                <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
              </View>
              {sonnetAnchor && (
                <Text style={[tipo.nota, estilos.panelDetalle]}>Experimental. Envía el recorte del motor al servidor para ubicar las piezas.</Text>
              )}
            </ScrollView>
          )}
          {!expanded && captions}
          {!!conversation?.error && <Text accessibilityLiveRegion="polite" style={tipo.nota}>{conversation.error}</Text>}
          {conversation && (
            <Boton texto={conversation.enabled ? 'Terminar conversación' : conversation.ended ? 'Empezar nueva conversación' : 'Empezar conversación'}
              icono={conversation.enabled ? 'phone-hangup-outline' : 'message-processing-outline'}
              variante={conversation.enabled ? 'secundario' : 'primario'}
              onPress={() => { setMode('compact'); conversation.toggle(); }} />
          )}
          <Pressable accessibilityRole="button" accessibilityState={{expanded}}
            accessibilityLabel={expanded ? 'Cerrar detalles' : status + (instruction ? '. Abrir indicación y detalles' : '. Abrir detalles')}
            onPress={() => setMode(expanded ? 'compact' : 'details')} style={estilos.status}>
            <Icono nombre={hasError ? 'alert-circle-outline' : instruction ? 'message-text-outline' : 'line-scan'} tam={18} tono={hasError ? color.peligro : color.acento} />
            <Text style={estilos.statusText} numberOfLines={1}>{expanded ? 'Cerrar detalles' : status}</Text>
            <Icono nombre={expanded ? 'chevron-down' : 'chevron-up'} tam={18} />
          </Pressable>
        </View>
      )}
    </>
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
  barraCentro: { flex: 1, alignItems: 'flex-end', paddingHorizontal: espacio.s },
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
  dock: { position: 'absolute', left: espacio.l, right: espacio.l, maxHeight: '55%', gap: espacio.s },
  status: { alignSelf: 'center', maxWidth: '100%', minHeight: 44, borderRadius: 24, paddingHorizontal: espacio.l,
    flexDirection: 'row', alignItems: 'center', gap: espacio.s, backgroundColor: color.velo },
  statusText: { color: color.texto, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  panel: { flexShrink: 1, backgroundColor: color.velo, borderRadius: radio.xl },
  details: { padding: espacio.l },
  options: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: espacio.s, marginTop: espacio.m },
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
