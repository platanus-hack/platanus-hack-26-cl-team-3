/**
 * Analizar una foto o un video de la galería: para cuando el auto no está a mano pero hay material sobre él.
 *
 * Usa el mismo modelo que el escáner, en el teléfono (nada se sube). Con el Outback, el módulo nativo ubica el modelo 3D
 * sobre la foto con el mismo registro visual del escáner en vivo (sin ARCore ni profundidad: la pose vale para esa
 * imagen). Si no se puede, o con otro auto, se dibujan en 2D el contorno del vano y las piezas del catálogo (ubicación
 * aproximada). De un video se analizan varios cuadros repartidos en su duración y se muestra el más útil; se puede pasar
 * a los demás.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { encajar, mejorCuadro, piezasSobreImagen, volumenesBasicos, type Punto } from '../analizar/mapa2d';
import { aPiezas2D, esquinasParaModelo, piezaEnPunto } from '../analizar/modelo3d';
import { analizarImagen, type ResultadoImagen } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { Encuadre } from '../detector/encuadre';
import { poligonoVano, Suavizador, type Vano } from '../detector/vano';
import { engineMaps, parts, type PartId } from '../engine-maps/catalog';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono, Icono } from '../ui';
import { vehicles } from '../vehicles';

const CUADROS_POR_VIDEO = 8;
const PASADAS = 4; // intentos por imagen: cuadro completo y recortes (zoom) si el vano se ve chico

type Cuadro = { uri: string; ancho: number; alto: number; vano: Vano | null; valido: boolean; segundo?: number };

/** Busca el vano en una imagen, probando con zoom si hace falta (misma lógica que el escáner). */
async function detectar(uri: string): Promise<Omit<Cuadro, 'uri' | 'segundo'>> {
  const encuadre = new Encuadre();
  let mejor: { vano: Vano | null; valido: boolean } = { vano: null, valido: false };
  let ancho = 0;
  let alto = 0;
  for (let i = 0; i < PASADAS; i++) {
    const r = await analizarFoto(uri, encuadre.recorte());
    ancho = r.ancho;
    alto = r.alto;
    const e = encuadre.procesar(poligonoVano(new Suavizador().agregar(r.vano)));
    if (e.vano && (e.valido || !mejor.vano)) mejor = { vano: e.vano, valido: e.valido };
    if (e.valido || !e.cambio) break;
  }
  return { ...mejor, ancho, alto };
}

export default function Analizar() {
  const insets = useSafeAreaInsets();
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const vehicle = vehicles.find((option) => option.id === vehicleId);
  const map = vehicle ? engineMaps[vehicle.id] : undefined;
  const [modeloListo, setModeloListo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null); // texto mientras analiza
  const [cuadros, setCuadros] = useState<Cuadro[]>([]);
  const [indice, setIndice] = useState(0);
  const [seleccion, setSeleccion] = useState<PartId | null>(null);
  const [modelos, setModelos] = useState<Record<string, ResultadoImagen>>({}); // modelo 3D por imagen
  const [error, setError] = useState<string | null>(null);
  const [caja, setCaja] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    cargarDetector()
      .then(() => setModeloListo(true))
      .catch((e) => setError(`No se pudo cargar el modelo de reconocimiento. ${String(e?.message ?? e)}`));
  }, []);

  const elegir = async () => {
    setError(null);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
      if (r.canceled || !r.assets.length) return;
      const medio = r.assets[0];
      setCuadros([]);
      setModelos({});
      setSeleccion(null);
      if (medio.type === 'video') {
        const nuevos: Cuadro[] = [];
        const duracion = medio.duration ?? 0; // ms
        for (let k = 0; k < CUADROS_POR_VIDEO; k++) {
          setProgreso(`Analizando el video: cuadro ${k + 1} de ${CUADROS_POR_VIDEO}…`);
          // Repartidos entre el 5 % y el 95 % de la duración; si no se conoce, uno por segundo.
          const ms = duracion > 0 ? duracion * (0.05 + (0.9 * (k + 0.5)) / CUADROS_POR_VIDEO) : k * 1000;
          try {
            const miniatura = await VideoThumbnails.getThumbnailAsync(medio.uri, { time: Math.round(ms), quality: 0.9 });
            nuevos.push({ uri: miniatura.uri, segundo: ms / 1000, ...(await detectar(miniatura.uri)) });
          } catch {
            if (duracion <= 0) break; // sin duración conocida: se llegó al final del video
          }
        }
        if (!nuevos.length) throw new Error('no se pudo leer ningún cuadro del video');
        setCuadros(nuevos);
        setIndice(Math.max(0, mejorCuadro(nuevos)));
      } else {
        setProgreso('Analizando la foto…');
        setCuadros([{ uri: medio.uri, ...(await detectar(medio.uri)) }]);
        setIndice(0);
      }
    } catch (e) {
      setError(`No se pudo analizar. ${String((e as Error)?.message ?? e)}`);
    } finally {
      setProgreso(null);
    }
  };

  const cuadro = cuadros[indice];
  const modelo3d = vehicle?.id === 'outback' && !!analizarImagen;
  // Ubica el modelo 3D de la imagen que se está viendo (en un video, solo la del cuadro mostrado).
  useEffect(() => {
    if (!modelo3d || !analizarImagen || !cuadro || modelos[cuadro.uri]) return;
    let vigente = true;
    analizarImagen(cuadro.uri, esquinasParaModelo(cuadro.vano))
      .catch((e): ResultadoImagen => ({ ok: false, motivo: String(e?.message ?? e) }))
      .then((r) => vigente && setModelos((m) => ({ ...m, [cuadro.uri]: r })));
    return () => {
      vigente = false;
    };
  }, [cuadro, modelo3d, modelos]);
  const resultado3d = cuadro ? modelos[cuadro.uri] : undefined;
  const ubicando = modelo3d && !!cuadro && !resultado3d; // el resultado (bueno o no) siempre llega y apaga el aviso
  const en3d = resultado3d?.ok ? resultado3d : null;
  const piezas = useMemo(
    () =>
      en3d
        ? aPiezas2D(en3d.piezas)
        : cuadro?.vano && cuadro.valido && map
          ? piezasSobreImagen(cuadro.vano, volumenesBasicos(map.volumes, map.partDetails))
          : [],
    [en3d, cuadro, map],
  );
  // Con el modelo 3D se puede tocar cualquiera de sus piezas; los botones son las que tienen ficha del manual.
  const botones = en3d && map?.partDetails ? piezas.filter(({ part }) => map.partDetails?.[part]) : piezas;
  const elegida = seleccion && piezas.some(({ part }) => part === seleccion) ? seleccion : null;
  const contornoElegido = piezas.find(({ part }) => part === elegida)?.contorno;
  const ancho = en3d?.ancho ?? cuadro?.ancho ?? 0;
  const alto = en3d?.alto ?? cuadro?.alto ?? 0;
  const marco = caja && cuadro ? encajar(ancho, alto, caja) : null;
  // De coordenadas normalizadas de la imagen a puntos de pantalla dentro de la caja.
  const aPantalla = (p: Punto) => ({ x: (marco?.x ?? 0) + p.x * (marco?.w ?? 0), y: (marco?.y ?? 0) + p.y * (marco?.h ?? 0) });
  const cambiarCuadro = (paso: number) => {
    setIndice((i) => Math.min(cuadros.length - 1, Math.max(0, i + paso)));
    setSeleccion(null);
  };

  return (
    <View style={[styles.raiz, { paddingTop: insets.top + espacio.s, paddingBottom: insets.bottom + espacio.m }]}>
      <View style={styles.barra}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <View style={styles.titulos}>
          <Text style={styles.titulo}>Analizar foto o video</Text>
          {vehicle && <Text style={tipo.nota} numberOfLines={1}>{vehicle.name} {vehicle.year} · {vehicle.engine}</Text>}
        </View>
        <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
      </View>

      <View style={styles.lienzo} onLayout={(e) => setCaja({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {cuadro && marco ? (
          <>
            <Image source={{ uri: en3d ? en3d.foto : cuadro.uri }} style={{ position: 'absolute', left: marco.x, top: marco.y, width: marco.w, height: marco.h }} />
            {en3d ? (
              <>
                <Image source={{ uri: en3d.capa }} style={{ position: 'absolute', left: marco.x, top: marco.y, width: marco.w, height: marco.h }} />
                {contornoElegido && <Poligono puntos={contornoElegido.map(aPantalla)} tono={color.acento} grosor={3} />}
                <Pressable
                  style={StyleSheet.absoluteFill}
                  accessibilityRole="button"
                  accessibilityLabel="Toca una pieza del modelo"
                  onPress={(e) => {
                    const { locationX, locationY } = e.nativeEvent;
                    setSeleccion(piezaEnPunto(piezas, { x: (locationX - marco.x) / marco.w, y: (locationY - marco.y) / marco.h }));
                  }}
                />
              </>
            ) : (
              <>
                {cuadro.vano && (
                  <Poligono puntos={cuadro.vano.esquinas.map(aPantalla)} tono={cuadro.valido ? color.exito : color.acento} grosor={3} conPuntos />
                )}
                {piezas.map((pieza) => (
                  <Poligono key={pieza.part} puntos={pieza.contorno.map(aPantalla)} tono={pieza.part === elegida ? color.acento : color.exito} grosor={pieza.part === elegida ? 3 : 1.5} />
                ))}
                {piezas.map((pieza) => {
                  const c = aPantalla(pieza.centro);
                  return (
                    <Pressable
                      key={`c-${pieza.part}`}
                      onPress={() => setSeleccion(pieza.part)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={parts[pieza.part][0]}
                      style={[styles.centroPieza, { left: c.x - 9, top: c.y - 9 }, pieza.part === elegida && { backgroundColor: color.acento }]}
                    />
                  );
                })}
              </>
            )}
          </>
        ) : (
          <View style={styles.vacio}>
            <Icono nombre="image-search-outline" tam={48} tono={color.textoTenue} />
            <Text style={[tipo.nota, styles.centrado]}>
              ¿No tienes el auto a mano? Elige una foto o un video donde se vea el capó abierto, idealmente desde el frente.
            </Text>
          </View>
        )}
        {(progreso || ubicando) && (
          <View style={styles.velo}>
            <ActivityIndicator color={color.acento} size="large" />
            <Text style={[tipo.cuerpo, styles.centrado]}>{progreso ?? 'Ubicando el modelo 3D sobre la foto…'}</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContenido}>
        {error && <Text style={styles.error}>{error}</Text>}
        {cuadro && !progreso && !ubicando && (
          <>
            <Text style={styles.resultado}>
              {en3d
                ? 'Modelo 3D ubicado sobre la foto. Toca una pieza para ver qué es.'
                : !cuadro.vano
                ? 'No encontré el vano del motor en esta imagen.'
                : !cuadro.valido
                  ? 'Veo algo que podría ser el vano, pero no con claridad.'
                  : cuadro.vano.cortado
                    ? 'Vano detectado, pero no se ve completo: no puedo ubicar las piezas.'
                    : piezas.length
                      ? 'Vano detectado. Toca una pieza para ver qué es.'
                      : 'Vano detectado.'}
            </Text>
            {cuadros.length > 1 && (
              <View style={styles.navegacion}>
                <BotonIcono icono="chevron-left" etiqueta="Cuadro anterior" onPress={() => cambiarCuadro(-1)} />
                <Text style={tipo.nota}>
                  Cuadro {indice + 1} de {cuadros.length}
                  {cuadro.segundo !== undefined ? ` · ${cuadro.segundo.toFixed(1)} s` : ''}
                </Text>
                <BotonIcono icono="chevron-right" etiqueta="Cuadro siguiente" onPress={() => cambiarCuadro(1)} />
              </View>
            )}
            {piezas.length > 0 && map && (
              <>
                <Text style={tipo.nota}>
                  {map.referenceVariant} · {en3d ? 'Modelo 3D registrado con la foto (sin profundidad)' : 'Ubicación aproximada'}
                </Text>
                <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.chips}>
                  {botones.map(({ part }) => (
                    <Pressable
                      key={part}
                      accessibilityRole="button"
                      accessibilityState={{ selected: part === elegida }}
                      onPress={() => setSeleccion(part)}
                      style={[styles.chip, part === elegida && styles.chipElegido]}
                    >
                      <Text style={tipo.nota}>{parts[part][0]}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {elegida && <Text style={tipo.nota}>{map.partDetails?.[elegida] ?? parts[elegida][1]}</Text>}
              </>
            )}
            {cuadro.valido && !cuadro.vano?.cortado && !map && (
              <Text style={tipo.nota}>Elige tu auto en el menú para ver dónde va cada pieza.</Text>
            )}
          </>
        )}
        <Boton
          texto={!modeloListo ? 'Preparando el reconocimiento…' : cuadros.length ? 'Elegir otra foto o video' : 'Elegir foto o video'}
          icono="image-multiple-outline"
          variante={cuadros.length ? 'secundario' : 'primario'}
          onPress={() => modeloListo && !progreso && void elegir()}
          estilo={[styles.boton, (!modeloListo || !!progreso) && { opacity: 0.5 }]}
        />
        <Text style={[tipo.nota, styles.centrado]}>Se analiza en tu teléfono: la foto o el video no se suben a ningún lado.</Text>
      </ScrollView>
    </View>
  );
}

/** Polígono cerrado dibujado con Views (sin librerías de dibujo): un tramo girado por cada lado. */
function Poligono({ puntos, tono, grosor, conPuntos }: { puntos: Punto[]; tono: string; grosor: number; conPuntos?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {puntos.map((a, i) => {
        const b = puntos[(i + 1) % puntos.length];
        const largo = Math.hypot(b.x - a.x, b.y - a.y);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (a.x + b.x) / 2 - largo / 2,
              top: (a.y + b.y) / 2 - grosor / 2,
              width: largo,
              height: grosor,
              backgroundColor: tono,
              transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }],
            }}
          />
        );
      })}
      {conPuntos && puntos.map((p, i) => <View key={`p${i}`} style={[styles.esquina, { left: p.x - 6, top: p.y - 6 }]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingHorizontal: espacio.l, paddingBottom: espacio.s },
  titulos: { flex: 1, alignItems: 'center' },
  titulo: { color: color.texto, fontSize: 17, fontWeight: '700' },
  lienzo: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espacio.m, paddingHorizontal: espacio.xl },
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: espacio.m, backgroundColor: color.velo, paddingHorizontal: espacio.xl },
  centrado: { textAlign: 'center' },
  esquina: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF3B3B', borderWidth: 2, borderColor: '#FFFFFF' },
  centroPieza: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: color.exito, borderWidth: 2, borderColor: '#FFFFFF' },
  panel: { flexGrow: 0, maxHeight: '42%' },
  panelContenido: { paddingHorizontal: espacio.l, paddingTop: espacio.m, gap: espacio.s },
  resultado: { ...tipo.cuerpo, fontWeight: '700' },
  error: { color: color.peligro, fontSize: 14, lineHeight: 20 },
  navegacion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { marginVertical: espacio.xs },
  chip: { minHeight: 44, justifyContent: 'center', backgroundColor: color.superficieAlta, borderRadius: radio.m, paddingHorizontal: espacio.m, marginRight: espacio.s },
  chipElegido: { borderColor: color.acento, borderWidth: 1 },
  boton: { marginTop: espacio.s },
});
