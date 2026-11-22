import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Image, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { findOutbackFuses, outbackFuseGuide, outbackFuseManualUrl, outbackFuses, type FuseBox, type OutbackFuse } from '../engine-maps/outback-fuses';
import { engineFusePhoto } from '../engine-maps/outback-fuse-photo';
import { color, espacio, radio, tipo } from '../theme';
import { useReducedMotion } from '../useReducedMotion';
import { BotonIcono, Icono } from '../ui';

const images = {
  engine: require('../../assets/engine-maps/outback-engine-fuses.png'),
  cabin: require('../../assets/engine-maps/outback-cabin-fuses.png'),
};
const boxNames = { engine: 'Motor', cabin: 'Habitáculo' };
const boxIds = ['engine', 'cabin'] as const;

function fuseName(fuse: OutbackFuse) {
  return fuse.amps == null ? `Posición ${fuse.number}` : `Fusible ${fuse.number} · ${fuse.amps} A`;
}

function FuseBeacon({ photo }: { photo: boolean }) {
  const reducedMotion = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return <>
    <Animated.View pointerEvents="none" accessible={false} style={[styles.beacon, !reducedMotion && {
    opacity: pulse.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.35, 1, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.65] }) }],
  }]} />
    {photo && <View accessible={false} pointerEvents="none" style={styles.beaconCenter} />}
  </>;
}

export default function OutbackFuses() {
  const params = useLocalSearchParams<{ box?: string; fuse?: string; q?: string }>();
  const box = params.box === 'cabin' ? 'cabin' : 'engine';
  const fuse = outbackFuses.find(item => item.box === box && String(item.number) === params.fuse);
  return <FuseDetail key={JSON.stringify([box, params.fuse, params.q])} initialBox={box} initialFuse={fuse} initialQuery={params.q ?? ''} />;
}

function FuseDetail({ initialBox, initialFuse, initialQuery }: { initialBox: FuseBox; initialFuse?: OutbackFuse; initialQuery: string }) {
  const [box, setBox] = useState(initialBox);
  const [selected, setSelected] = useState(initialFuse);
  const [engineView, setEngineView] = useState<'photo' | 'diagram'>('photo');
  const [zoomed, setZoomed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [linkError, setLinkError] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const searching = query.trim().length > 0;
  const slots = outbackFuses.filter(fuse => fuse.box === box);
  const results = searching ? findOutbackFuses(query) : slots;
  const guide = outbackFuseGuide[box];
  const photo = box === 'engine' && engineView === 'photo';
  const diagram = photo ? engineFusePhoto : guide;
  const viewport = photo && zoomed ? { x: .30, y: .24, width: .40, height: .61 } : { x: 0, y: 0, width: 1, height: 1 };
  const regionName = (fuse: OutbackFuse) => fuse.amps == null ? 'Posición vacía' : fuse.label;

  function select(fuse: OutbackFuse) {
    Keyboard.dismiss();
    setQuery('');
    setBox(fuse.box);
    setSelected(fuse);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={styles.flex}>
          <Text style={styles.heading}>Fusibles</Text>
          <Text style={tipo.nota}>Outback 2016 · 3.6R · Norteamérica</Text>
        </View>
      </View>
      <View style={styles.search}>
        <Icono nombre="magnify" tam={22} tono={color.textoSuave} />
        <TextInput
          value={query} onChangeText={setQuery} style={styles.input} placeholder="Buscar circuito en ambas cajas"
          accessibilityLabel="Buscar circuito en ambas cajas" placeholderTextColor={color.textoSuave}
          autoCorrect={false} returnKeyType="search"
        />
        {query.length > 0 && <BotonIcono icono="close" etiqueta="Limpiar búsqueda" onPress={() => setQuery('')} />}
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!searching && <>
          <View style={styles.tabs}>
            {boxIds.map(id => <Pressable key={id} onPress={() => { setBox(id); setSelected(undefined); setLinkError(false); }}
              accessibilityRole="button" accessibilityState={{ selected: id === box }} style={[styles.tab, id === box && styles.currentTab]}>
              <Text style={[styles.tabLabel, id === box && styles.currentTabLabel]}>{boxNames[id]}</Text>
            </Pressable>)}
          </View>
          {box === 'engine' && <View style={styles.viewOptions}>
            {(['photo', 'diagram'] as const).map(mode => <Pressable key={mode} accessibilityRole="button"
              accessibilityState={{ selected: engineView === mode }} onPress={() => setEngineView(mode)} style={styles.viewOption}>
              <Icono nombre={mode === 'photo' ? 'camera-outline' : 'view-grid-outline'} tam={18}
                tono={engineView === mode ? color.acento : color.textoSuave} />
              <Text style={[tipo.nota, engineView === mode && styles.activeView]}>{mode === 'photo' ? 'Foto' : 'Diagrama'}</Text>
            </Pressable>)}
            {photo && <Pressable accessibilityRole="button" onPress={() => setZoomed(!zoomed)}
              accessibilityLabel={zoomed ? 'Ver foto completa' : 'Ampliar fusibles'} style={styles.zoom}>
              <Icono nombre={zoomed ? 'magnify-minus-outline' : 'magnify-plus-outline'} tam={19} tono={color.texto} />
              <Text style={tipo.nota}>{zoomed ? 'Foto completa' : 'Ampliar'}</Text>
            </Pressable>}
          </View>}
          <View style={[styles.diagram, { aspectRatio: diagram.width * viewport.width / (diagram.height * viewport.height) }]}>
            <Image source={photo ? engineFusePhoto.image : images[box]} style={{ position: 'absolute', left: `${-100 * viewport.x / viewport.width}%`,
                top: `${-100 * viewport.y / viewport.height}%`, width: `${100 / viewport.width}%`,
                height: `${100 / viewport.height}%` }} resizeMode="stretch" accessible={false} />
            {slots.map(fuse => {
              const bounds = photo ? engineFusePhoto.bounds[fuse.number] : fuse;
              if (!bounds) return null;
              return <Pressable key={fuse.number}
              accessibilityRole="button" accessibilityLabel={`${fuseName(fuse)}, ${fuse.description}`}
              accessibilityState={{ selected: selected?.number === fuse.number }}
              onPress={() => select(fuse)}
              style={[styles.slot, {
                left: `${100 * (bounds.x - viewport.x) / viewport.width}%`, top: `${100 * (bounds.y - viewport.y) / viewport.height}%`,
                width: `${100 * bounds.width / viewport.width}%`, height: `${100 * bounds.height / viewport.height}%`,
              }, selected?.number === fuse.number && styles.selectedSlot]}>
                {selected?.number === fuse.number && <FuseBeacon photo={photo} />}
              </Pressable>;
            })}
          </View>
          {selected ? <View accessibilityLiveRegion="polite" style={styles.info}>
            <Text style={styles.selectedTitle}>{fuseName(selected)} · {boxNames[selected.box]}</Text>
            <Text style={tipo.cuerpo}>{selected.description}</Text>
            {selected.amps != null && <Text style={tipo.nota}>{selected.label}</Text>}
            {selected.box === 'engine' && engineFusePhoto.emptySlots.includes(selected.number) &&
              <Text style={tipo.nota}>Esta posición está vacía en la foto del auto de prueba. La asignación y el amperaje corresponden al manual.</Text>}
          </View> : <Text style={tipo.nota}>Toca una posición del diagrama o un circuito de la lista.</Text>}
          <Pressable accessibilityRole="link" onPress={() => {
            void Linking.openURL(`${outbackFuseManualUrl.split('#')[0]}#page=${guide.page}`).catch(() => setLinkError(true));
          }}><Text style={styles.link}>Manual Subaru · Norteamérica · págs. {guide.pages} ↗</Text></Pressable>
          <Text style={tipo.nota}>Comprueba la numeración en la tapa de tu vehículo.</Text>
          {linkError && <Text style={tipo.nota}>No se pudo abrir el manual.</Text>}
        </>}
        <Text style={styles.section}>{searching ? 'Resultados' : 'Circuitos'}</Text>
        {searching && results.length > 1 && <Text style={tipo.nota}>Hay varios circuitos. Elige el que corresponda a tu vehículo.</Text>}
        {results.length === 0 && <Text accessibilityLiveRegion="polite" style={tipo.nota}>Sin coincidencias en el manual de esta versión.</Text>}
        {results.map(fuse => <Pressable key={`${fuse.box}-${fuse.number}`} accessibilityRole="button"
          onPress={() => select(fuse)} style={styles.row}>
          <View style={styles.number}><Text style={styles.numberText}>{fuse.number}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.rowLabel}>{fuse.description}</Text>
            <Text style={tipo.nota}>{searching ? `${boxNames[fuse.box]} · ` : ''}{regionName(fuse)}</Text>
          </View>
          {fuse.amps != null && <Text style={tipo.nota}>{fuse.amps} A</Text>}
          <Icono nombre="chevron-right" tam={19} tono={color.textoSuave} />
        </Pressable>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.fondo },
  header: { padding: espacio.l, flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  flex: { flex: 1 },
  heading: { ...tipo.titulo, fontSize: 25 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.superficieAlta, borderRadius: radio.m,
    marginHorizontal: espacio.l, paddingHorizontal: espacio.m, gap: espacio.s },
  input: { flex: 1, minHeight: 48, color: color.texto, fontSize: 15 },
  content: { padding: espacio.l, gap: espacio.m },
  tabs: { flexDirection: 'row', gap: espacio.xs, padding: espacio.xs, backgroundColor: color.superficie, borderRadius: radio.m },
  tab: { flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: radio.s },
  currentTab: { backgroundColor: color.acento },
  tabLabel: { ...tipo.cuerpo, fontWeight: '700' },
  currentTabLabel: { color: color.acentoTexto },
  viewOptions: { flexDirection: 'row', gap: espacio.l },
  viewOption: { flexDirection: 'row', minHeight: 40, alignItems: 'center', gap: espacio.s },
  activeView: { color: color.acento, fontWeight: '700' },
  zoom: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  diagram: { width: '100%', maxWidth: 650, alignSelf: 'center', overflow: 'hidden' },
  slot: { position: 'absolute' },
  beaconCenter: { position: 'absolute', left: '50%', top: '50%', marginLeft: -2, marginTop: -2,
    width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF' },
  beacon: { position: 'absolute', left: '50%', top: '50%', marginLeft: -13, marginTop: -13,
    width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: '#FFF' },
  selectedSlot: { zIndex: 1, borderWidth: 2, borderColor: color.acento, backgroundColor: color.acentoSuave },
  info: { gap: espacio.xs, borderLeftWidth: 3, borderColor: color.acento, paddingLeft: espacio.m },
  selectedTitle: { color: color.acento, fontWeight: '700', fontSize: 18 },
  link: { ...tipo.nota, color: color.acento, paddingVertical: espacio.xs },
  section: { color: color.texto, fontWeight: '700', fontSize: 19, marginTop: espacio.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, minHeight: 48, paddingBottom: espacio.s,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.borde },
  number: { minWidth: 36, height: 32, paddingHorizontal: espacio.xs, borderRadius: radio.s, backgroundColor: color.superficieAlta,
    alignItems: 'center', justifyContent: 'center' },
  numberText: { color: color.texto, fontWeight: '700', fontSize: 15 },
  rowLabel: { ...tipo.cuerpo, fontWeight: '600' },
});
