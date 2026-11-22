import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Image, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { boxName, fuseGuideFor, searchFuses } from '../fusibles/guides';
import type { FuseGuide, FusePhoto, FuseSlot } from '../fusibles/types';
import { color, espacio, radio, tipo } from '../theme';
import { useReducedMotion } from '../useReducedMotion';
import { BotonIcono, Icono } from '../ui';

type Bounds = { x: number; y: number; width: number; height: number };

function fuseName(fuse: FuseSlot) {
  return fuse.amps == null ? `Posición ${fuse.number}` : `Fusible ${fuse.number} · ${fuse.amps} A`;
}

function photoZoom(photo: FusePhoto): Bounds {
  const all = Object.values(photo.bounds);
  const margin = 0.04;
  const left = Math.max(0, Math.min(...all.map(b => b.x)) - margin);
  const top = Math.max(0, Math.min(...all.map(b => b.y)) - margin);
  const right = Math.min(1, Math.max(...all.map(b => b.x + b.width)) + margin);
  const bottom = Math.min(1, Math.max(...all.map(b => b.y + b.height)) + margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
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

export default function Fusibles() {
  const params = useLocalSearchParams<{ vehicleId?: string; box?: string; fuse?: string; q?: string }>();
  const guide = fuseGuideFor(params.vehicleId);
  if (!guide) return <SinGuia />;
  const box = guide.boxes.find(item => item.id === params.box)?.id ?? guide.photo?.box ?? guide.boxes[0].id;
  const fuse = guide.slots.find(item => item.box === box && String(item.number) === params.fuse);
  return <FuseDetail key={JSON.stringify([guide.vehicleId, box, params.fuse, params.q])} guide={guide}
    initialBox={box} initialFuse={fuse} initialQuery={params.q ?? ''} />;
}

function SinGuia() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={styles.flex}>
          <Text style={styles.heading}>Fusibles</Text>
          <Text style={tipo.nota}>Todavía no tenemos el mapa de fusibles verificado de este auto.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function FuseDetail({ guide, initialBox, initialFuse, initialQuery }: { guide: FuseGuide; initialBox: string; initialFuse?: FuseSlot; initialQuery: string }) {
  const [box, setBox] = useState(initialBox);
  const [picked, setPicked] = useState<Record<string, FuseSlot>>(initialFuse ? { [initialFuse.box]: initialFuse } : {});
  const selected = picked[box];
  const [view, setView] = useState<'photo' | 'diagram'>('photo');
  const [zoomed, setZoomed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [linkError, setLinkError] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const searching = query.trim().length > 0;
  const slots = guide.slots.filter(fuse => fuse.box === box);
  const results = searching ? searchFuses(guide, query) : slots;
  const boxGuide = guide.boxes.find(item => item.id === box) ?? guide.boxes[0];
  const photoData = guide.photo?.box === box ? guide.photo : undefined;
  const photo = !!photoData && view === 'photo';
  const diagram = photo && photoData ? photoData : boxGuide;
  const zoom = useMemo(() => photoData ? photoZoom(photoData) : undefined, [photoData]);
  const viewport = photo && zoomed && zoom ? zoom : { x: 0, y: 0, width: 1, height: 1 };
  const image = photo && photoData ? photoData.image : boxGuide.image;
  const regionName = (fuse: FuseSlot) => fuse.amps == null ? 'Posición vacía' : fuse.label;

  function select(fuse: FuseSlot) {
    Keyboard.dismiss();
    setQuery('');
    setBox(fuse.box);
    setPicked(current => ({ ...current, [fuse.box]: fuse }));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={styles.flex}>
          <Text style={styles.heading}>Fusibles</Text>
          <Text style={tipo.nota}>{guide.subtitle}</Text>
        </View>
      </View>
      <View style={styles.search}>
        <Icono nombre="magnify" tam={22} tono={color.textoSuave} />
        <TextInput
          value={query} onChangeText={setQuery} style={styles.input} placeholder="Buscar circuito en todas las cajas"
          accessibilityLabel="Buscar circuito en todas las cajas" placeholderTextColor={color.textoSuave}
          autoCorrect={false} returnKeyType="search"
        />
        {query.length > 0 && <BotonIcono icono="close" etiqueta="Limpiar búsqueda" onPress={() => setQuery('')} />}
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!searching && <>
          <View style={styles.tabs}>
            {guide.boxes.map(item => <Pressable key={item.id} onPress={() => { setBox(item.id); setLinkError(false); }}
              accessibilityRole="button" accessibilityState={{ selected: item.id === box }} style={[styles.tab, item.id === box && styles.currentTab]}>
              <Text style={[styles.tabLabel, item.id === box && styles.currentTabLabel]}>{item.name}</Text>
            </Pressable>)}
          </View>
          {photoData && <View style={styles.viewOptions}>
            {(['photo', 'diagram'] as const).map(mode => <Pressable key={mode} accessibilityRole="button"
              accessibilityState={{ selected: view === mode }} onPress={() => setView(mode)} style={styles.viewOption}>
              <Icono nombre={mode === 'photo' ? 'camera-outline' : 'view-grid-outline'} tam={18}
                tono={view === mode ? color.acento : color.textoSuave} />
              <Text style={[tipo.nota, view === mode && styles.activeView]}>{mode === 'photo' ? 'Foto' : 'Diagrama'}</Text>
            </Pressable>)}
            {photo && <Pressable accessibilityRole="button" onPress={() => setZoomed(!zoomed)}
              accessibilityLabel={zoomed ? 'Ver foto completa' : 'Ampliar fusibles'} style={styles.zoom}>
              <Icono nombre={zoomed ? 'magnify-minus-outline' : 'magnify-plus-outline'} tam={19} tono={color.texto} />
              <Text style={tipo.nota}>{zoomed ? 'Foto completa' : 'Ampliar'}</Text>
            </Pressable>}
          </View>}
          <View onLayout={event => setCanvasWidth(event.nativeEvent.layout.width)}
            style={[styles.diagram, { aspectRatio: diagram.width * viewport.width / (diagram.height * viewport.height) },
              !image && styles.plainCanvas]}>
            {image && <Image source={image} style={{ position: 'absolute', left: `${-100 * viewport.x / viewport.width}%`,
                top: `${-100 * viewport.y / viewport.height}%`, width: `${100 / viewport.width}%`,
                height: `${100 / viewport.height}%` }} resizeMode="stretch" accessible={false} />}
            {slots.map(fuse => {
              const bounds: Bounds | undefined = photo && photoData ? photoData.bounds[fuse.number] : fuse;
              if (!bounds) return null;
              const current = selected?.box === fuse.box && selected.number === fuse.number;
              return <Pressable key={fuse.number}
              accessibilityRole="button" accessibilityLabel={`${fuseName(fuse)}, ${fuse.description}`}
              accessibilityState={{ selected: current }}
              onPress={() => select(fuse)}
              style={[styles.slot, !image && (fuse.amps == null ? styles.drawnEmptySlot : styles.drawnSlot), {
                left: `${100 * (bounds.x - viewport.x) / viewport.width}%`, top: `${100 * (bounds.y - viewport.y) / viewport.height}%`,
                width: `${100 * bounds.width / viewport.width}%`, height: `${100 * bounds.height / viewport.height}%`,
              }, current && styles.selectedSlot]}>
                {!image && <Text style={[styles.slotNumber, { fontSize: Math.max(9, Math.min(16, canvasWidth * bounds.height / viewport.height * 0.42)) }]}>{fuse.number}</Text>}
                {current && <FuseBeacon photo={photo} />}
              </Pressable>;
            })}
          </View>
          {selected ? <View accessibilityLiveRegion="polite" style={styles.info}>
            <Text style={styles.selectedTitle}>{fuseName(selected)} · {boxName(guide, selected.box)}</Text>
            <Text style={tipo.cuerpo}>{selected.description}</Text>
            {selected.amps != null && <Text style={tipo.nota}>{selected.label}</Text>}
            {guide.photo?.box === selected.box && guide.photo.emptySlots.includes(selected.number) &&
              <Text style={tipo.nota}>Esta posición está vacía en la foto del auto de prueba. La asignación y el amperaje corresponden al manual.</Text>}
          </View> : <Text style={tipo.nota}>Toca una posición del diagrama o un circuito de la lista.</Text>}
          {guide.manualUrl && <Pressable accessibilityRole="link" onPress={() => {
            const url = guide.manualUrl!.split('#')[0];
            void Linking.openURL(boxGuide.page ? `${url}#page=${boxGuide.page}` : url).catch(() => setLinkError(true));
          }}><Text style={styles.link}>Manual · págs. {boxGuide.pages} ↗</Text></Pressable>}
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
            <Text style={tipo.nota}>{searching ? `${boxName(guide, fuse.box)} · ` : ''}{regionName(fuse)}</Text>
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
  plainCanvas: { backgroundColor: color.superficie, borderRadius: radio.s },
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  drawnSlot: { borderWidth: 1.5, borderColor: color.textoSuave, borderRadius: radio.s, backgroundColor: color.superficieAlta },
  drawnEmptySlot: { borderWidth: 1, borderColor: color.borde, borderRadius: radio.s, borderStyle: 'dashed' },
  slotNumber: { color: color.texto, fontWeight: '700' },
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
