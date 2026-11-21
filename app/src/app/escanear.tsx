import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analizarFoto, cargarDetector } from '../detector/detector';
import { poligonoVano, Suavizador, tramos, type Vano } from '../detector/vano';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono, Icono } from '../ui';

// «Capó abierto»: histéresis sobre el puntaje suavizado. Entra con ≥ 0,5 (y al menos 2 análisis), sale con < 0,35.
// 0,5 medido con el CLIP ViT-B/16 int8 del modelo: 97,6 % de aciertos en 166 fotos (herramientas/vano-motor/).
const UMBRAL_ENTRA = 0.5;
const UMBRAL_SALE = 0.35;
const SUAVIZADO = 0.5; // peso del análisis nuevo en la media móvil
const PAUSA_MS = 150;
const ROJO_CLARO = 'rgba(255, 110, 110, 0.32)'; // relleno del polígono en modo debug

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** expo-router muestra esto si la pantalla falla al dibujarse: mensaje en vez de cerrar la app. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.raiz, styles.centro, { backgroundColor: color.fondo, paddingTop: insets.top }]}>
      <View style={styles.iconoGrande}>
        <Icono nombre="alert-circle-outline" tam={36} tono={color.peligro} />
      </View>
      <Text style={[tipo.titulo, styles.textoCentro]}>El escáner falló</Text>
      <Text style={[tipo.nota, styles.textoCentro, { marginTop: espacio.s, marginBottom: espacio.xl }]}>
        {error.message}
      </Text>
      <Boton texto="Reintentar" icono="refresh" onPress={() => void retry()} />
      <Boton texto="Volver al menú" variante="secundario" onPress={() => router.back()} estilo={{ marginTop: espacio.m }} />
    </View>
  );
}

/** Elige la foto más chica cuyo lado menor sea ≥ 480 px: basta para 352×352 y acelera mucho la captura. */
function elegirTamano(tamanos: string[]): string | undefined {
  const validos = tamanos
    .map((t) => {
      const [w, h] = t.split('x').map(Number);
      return { t, menor: Math.min(w, h), area: w * h };
    })
    .filter((x) => Number.isFinite(x.area) && x.menor >= 480)
    .sort((a, b) => a.area - b.area);
  return validos[0]?.t;
}

function borrar(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // caché temporal
  }
}

type Tam = { ancho: number; alto: number };

export default function Escanear() {
  const insets = useSafeAreaInsets();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef<CameraView>(null);
  const [camaraLista, setCamaraLista] = useState(false);
  const [tamanoFoto, setTamanoFoto] = useState<string>();
  const [modeloListo, setModeloListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [detectado, setDetectado] = useState(false);
  const [vano, setVano] = useState<Vano | null>(null);
  const [foto, setFoto] = useState<Tam | null>(null);
  const [vista, setVista] = useState<Tam | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [debug, setDebug] = useState(true);
  const [activa, setActiva] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActiva(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setError(null);
    cargarDetector()
      .then(() => setModeloListo(true))
      .catch((e) => setError(`No se pudo cargar el modelo de reconocimiento. ${String(e?.message ?? e)}`));
  }, [intento]);

  const alEstarLista = async () => {
    if (!tamanoFoto) {
      try {
        const t = elegirTamano((await camara.current?.getAvailablePictureSizesAsync()) ?? []);
        if (t) setTamanoFoto(t);
      } catch {
        // se usa el tamaño por defecto
      }
    }
    setCamaraLista(true);
  };

  // Bucle de análisis: foto → (puntaje, mapa del vano) → medias móviles → polígono. Corre mientras la pantalla esté visible.
  useEffect(() => {
    if (!camaraLista || !modeloListo || !permiso?.granted || !activa || error) return;
    let vivo = true;
    let media = 0;
    let n = 0;
    let det = false;
    let fallos = 0;
    const suavizador = new Suavizador(SUAVIZADO);
    (async () => {
      while (vivo) {
        const t0 = Date.now();
        try {
          const captura = await camara.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
          if (!captura) throw new Error('la cámara no devolvió imagen');
          let r;
          try {
            r = await analizarFoto(captura.uri);
          } finally {
            borrar(captura.uri);
          }
          if (!vivo) break;
          n += 1;
          media = n === 1 ? r.puntaje : SUAVIZADO * r.puntaje + (1 - SUAVIZADO) * media;
          if (!det && n >= 2 && media >= UMBRAL_ENTRA) det = true;
          else if (det && media < UMBRAL_SALE) det = false;
          fallos = 0;
          setPuntaje(media);
          setDetectado(det);
          setVano(poligonoVano(suavizador.agregar(r.vano)));
          setFoto({ ancho: r.ancho, alto: r.alto });
          setMs(Date.now() - t0);
        } catch (e) {
          if (!vivo) break;
          fallos += 1;
          if (fallos >= 5) {
            setError(`El análisis falló varias veces seguidas. ${String((e as Error)?.message ?? e)}`);
            break;
          }
          await esperar(800);
        }
        await esperar(PAUSA_MS);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [camaraLista, modeloListo, permiso?.granted, activa, error]);

  const reintentar = () => {
    setPuntaje(null);
    setDetectado(false);
    setVano(null);
    setIntento((i) => i + 1);
  };

  const barraSuperior = (
    <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
      <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
      <Text style={styles.barraTitulo}>Escanear capó</Text>
      <View style={styles.fila}>
        <Pressable
          onPress={() => setDebug((d) => !d)}
          accessibilityRole="switch"
          accessibilityState={{ checked: debug }}
          accessibilityLabel="Modo debug"
          style={[styles.chip, debug && styles.chipActivo]}
        >
          <Icono nombre="bug-outline" tam={16} tono={debug ? color.acentoTexto : color.texto} />
          <Text style={[styles.chipTexto, debug && { color: color.acentoTexto }]}>Debug</Text>
        </Pressable>
        <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
      </View>
    </View>
  );

  if (!permiso) return <View style={styles.raiz} />;

  if (!permiso.granted) {
    const puedePreguntar = permiso.canAskAgain;
    return (
      <View style={styles.raiz}>
        {barraSuperior}
        <View style={styles.centro}>
          <View style={styles.iconoGrande}>
            <Icono nombre="camera-off" tam={36} tono={color.acento} />
          </View>
          <Text style={[tipo.titulo, styles.textoCentro]}>Necesitamos la cámara</Text>
          <Text style={[tipo.nota, styles.textoCentro, { marginTop: espacio.s, marginBottom: espacio.xl }]}>
            La usamos para reconocer el capó abierto. Las imágenes se analizan en tu teléfono y no se envían a ningún lado.
          </Text>
          <Boton
            texto={puedePreguntar ? 'Permitir cámara' : 'Abrir ajustes'}
            icono={puedePreguntar ? 'camera-iris' : 'cog'}
            onPress={puedePreguntar ? pedirPermiso : () => Linking.openSettings()}
          />
          {!puedePreguntar && (
            <Text style={[tipo.nota, styles.textoCentro, { marginTop: espacio.l }]}>
              El permiso fue denegado. Actívalo en los ajustes de la app.
            </Text>
          )}
        </View>
      </View>
    );
  }

  const tono = detectado ? color.exito : color.acento;
  const cargando = !error && (!modeloListo || !camaraLista || puntaje === null);
  // Fuera de debug, el polígono solo aparece cuando además se reconoce un capó abierto.
  const mostrarVano = !!vano && !!foto && !!vista && (debug || detectado);

  return (
    <View style={styles.raiz} onLayout={(e) => setVista({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
      <CameraView
        ref={camara}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={activa}
        animateShutter={false}
        pictureSize={tamanoFoto}
        onCameraReady={alEstarLista}
        onMountError={(e) => setError(`No se pudo abrir la cámara. ${e.message}`)}
      />
      {mostrarVano && <CapaVano vano={vano!} foto={foto!} vista={vista!} debug={debug} tono={tono} />}
      {barraSuperior}

      <View style={[styles.panel, { marginBottom: insets.bottom + espacio.l }]}>
        {error ? (
          <>
            <View style={styles.fila}>
              <Icono nombre="alert-circle-outline" tam={26} tono={color.peligro} />
              <Text style={styles.panelTitulo}>Algo falló</Text>
            </View>
            <Text style={[tipo.nota, styles.panelDetalle]}>{error}</Text>
            <Boton texto="Reintentar" icono="refresh" onPress={reintentar} estilo={{ marginTop: espacio.m }} />
          </>
        ) : cargando ? (
          <>
            <View style={styles.fila}>
              <ActivityIndicator color={color.acento} />
              <Text style={styles.panelTitulo}>{modeloListo ? 'Iniciando cámara…' : 'Preparando el reconocimiento…'}</Text>
            </View>
            <Text style={[tipo.nota, styles.panelDetalle]}>
              {modeloListo ? 'Un momento.' : 'La primera vez tarda unos segundos.'}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.fila}>
              <Icono nombre={detectado ? 'vector-polygon' : 'line-scan'} tam={26} tono={tono} />
              <Text style={styles.panelTitulo}>
                {detectado ? (vano ? 'Vano del motor detectado' : 'Capó abierto detectado') : 'Buscando un capó abierto'}
              </Text>
            </View>
            <Text style={[tipo.nota, styles.panelDetalle]}>
              {!detectado
                ? 'Abre el capó y apunta al motor desde arriba.'
                : !vano
                  ? 'No logro delimitar el vano. Prueba desde un poco más lejos.'
                  : vano.cortado
                    ? 'Parte del vano queda fuera de la imagen: aléjate un poco para verlo completo.'
                    : 'El contorno marca todo lo que hay bajo el capó.'}
            </Text>
            <View style={styles.medidor}>
              <View style={styles.medidorFila}>
                <Text style={styles.medidorEtiqueta}>Capó abierto</Text>
                <Text style={[styles.medidorValor, { color: tono }]}>{Math.round((puntaje ?? 0) * 100)} %</Text>
              </View>
              <View style={styles.pista}>
                <View style={[styles.relleno, { width: `${Math.round((puntaje ?? 0) * 100)}%`, backgroundColor: tono }]} />
                <View style={[styles.marcaUmbral, { left: `${UMBRAL_ENTRA * 100}%` }]} />
              </View>
            </View>
            {debug && (
              <Text style={styles.tiempo}>
                Debug · vano {vano ? `${Math.round(vano.area * 100)} % del cuadro · ${vano.esquinas.length} esquinas` : 'sin región'}
                {ms !== null ? ` · ${ms} ms` : ''}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Dibuja el polígono del vano sobre la cámara. La vista previa llena la pantalla recortando los bordes («cover»),
 * así que se proyecta la foto completa con la misma escala y se centra.
 */
function CapaVano({ vano, foto, vista, debug, tono }: { vano: Vano; foto: Tam; vista: Tam; debug: boolean; tono: string }) {
  const puntos = useMemo(() => {
    const s = Math.max(vista.ancho / foto.ancho, vista.alto / foto.alto);
    const dx = (vista.ancho - foto.ancho * s) / 2;
    const dy = (vista.alto - foto.alto * s) / 2;
    return vano.esquinas.map((e) => ({ x: e.x * foto.ancho * s + dx, y: e.y * foto.alto * s + dy, borde: e.borde }));
  }, [vano, foto, vista]);
  const relleno = useMemo(() => (debug ? tramos(puntos, 64) : []), [debug, puntos]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {relleno.map((t, i) => (
        <View key={`r${i}`} style={{ position: 'absolute', top: t.y, height: t.alto, left: t.x0, width: t.x1 - t.x0, backgroundColor: ROJO_CLARO }} />
      ))}
      {puntos.map((a, i) => {
        const b = puntos[(i + 1) % puntos.length];
        const largo = Math.hypot(b.x - a.x, b.y - a.y);
        const angulo = Math.atan2(b.y - a.y, b.x - a.x);
        return (
          <View
            key={`l${i}`}
            style={{
              position: 'absolute',
              left: (a.x + b.x) / 2 - largo / 2,
              top: (a.y + b.y) / 2 - 1.5,
              width: largo,
              height: 3,
              backgroundColor: tono,
              transform: [{ rotate: `${angulo}rad` }],
            }}
          />
        );
      })}
      {puntos.map((p, i) => (
        <View
          key={`p${i}`}
          style={[
            styles.esquina,
            { left: p.x - 8, top: p.y - 8 },
            p.borde ? styles.esquinaBorde : null, // toca el borde del cuadro: el vano sigue fuera de la imagen
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  barraTitulo: {
    color: color.texto,
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
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
  esquina: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B3B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  esquinaBorde: { backgroundColor: 'transparent', borderColor: '#FF3B3B', borderWidth: 3 },
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
  tiempo: { fontSize: 11, color: color.textoTenue, marginTop: espacio.m, textAlign: 'right' },
});
