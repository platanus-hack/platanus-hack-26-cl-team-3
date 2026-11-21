import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cargarDetector, puntuarFoto } from '../detector/detector';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono, Icono } from '../ui';

// Histéresis sobre el puntaje suavizado: entra a «detectado» con ≥ 0,6 (y al menos 2 análisis), sale con < 0,45.
// 0,6 es el umbral medido en herramientas/detector-capo (95,8 % de aciertos con fotos de Wikimedia).
const UMBRAL_ENTRA = 0.6;
const UMBRAL_SALE = 0.45;
const SUAVIZADO = 0.5; // peso del análisis nuevo en la media móvil
const PAUSA_MS = 200;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Elige la foto más chica cuyo lado menor sea ≥ 480 px: basta para 224×224 y acelera mucho la captura. */
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
  const [ms, setMs] = useState<number | null>(null);
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

  // Bucle de análisis: foto → puntaje → media móvil con histéresis. Corre mientras la pantalla esté visible.
  useEffect(() => {
    if (!camaraLista || !modeloListo || !permiso?.granted || !activa || error) return;
    let vivo = true;
    let media = 0;
    let n = 0;
    let det = false;
    let fallos = 0;
    (async () => {
      while (vivo) {
        const t0 = Date.now();
        try {
          const foto = await camara.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
          if (!foto) throw new Error('la cámara no devolvió imagen');
          let p: number;
          try {
            p = await puntuarFoto(foto.uri);
          } finally {
            borrar(foto.uri);
          }
          if (!vivo) break;
          n += 1;
          media = n === 1 ? p : SUAVIZADO * p + (1 - SUAVIZADO) * media;
          if (!det && n >= 2 && media >= UMBRAL_ENTRA) det = true;
          else if (det && media < UMBRAL_SALE) det = false;
          fallos = 0;
          setPuntaje(media);
          setDetectado(det);
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
    setIntento((i) => i + 1);
  };

  const barraSuperior = (
    <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
      <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
      <Text style={styles.barraTitulo}>Escanear capó</Text>
      <BotonIcono icono="information-outline" etiqueta="Aviso y fuentes" onPress={() => router.push('/aviso')} />
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

  const tonoMarco = detectado ? color.exito : color.acento;
  const cargando = !error && (!modeloListo || !camaraLista || puntaje === null);

  return (
    <View style={styles.raiz}>
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
      {barraSuperior}

      {/* Guía de encuadre: el modelo analiza el cuadrado central de la imagen. */}
      <View style={styles.marcoCaja} pointerEvents="none">
        <View style={styles.marco}>
          <View style={[styles.esquina, styles.supIzq, { borderColor: tonoMarco }]} />
          <View style={[styles.esquina, styles.supDer, { borderColor: tonoMarco }]} />
          <View style={[styles.esquina, styles.infIzq, { borderColor: tonoMarco }]} />
          <View style={[styles.esquina, styles.infDer, { borderColor: tonoMarco }]} />
        </View>
      </View>

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
              <Icono nombre={detectado ? 'check-circle' : 'line-scan'} tam={26} tono={tonoMarco} />
              <Text style={styles.panelTitulo}>{detectado ? 'Capó abierto detectado' : 'Buscando un capó abierto'}</Text>
            </View>
            <Text style={[tipo.nota, styles.panelDetalle]}>
              {detectado
                ? 'Siguiente paso (pronto): marcar puntos de referencia para ubicar las piezas.'
                : 'Abre el capó y apunta al motor desde arriba, dentro del marco.'}
            </Text>
            <View style={styles.medidor}>
              <View style={styles.medidorFila}>
                <Text style={styles.medidorEtiqueta}>Confianza</Text>
                <Text style={[styles.medidorValor, { color: tonoMarco }]}>{Math.round((puntaje ?? 0) * 100)} %</Text>
              </View>
              <View style={styles.pista}>
                <View style={[styles.relleno, { width: `${Math.round((puntaje ?? 0) * 100)}%`, backgroundColor: tonoMarco }]} />
                <View style={[styles.marcaUmbral, { left: `${UMBRAL_ENTRA * 100}%` }]} />
              </View>
            </View>
            {ms !== null && <Text style={styles.tiempo}>Análisis en el teléfono · {ms} ms</Text>}
          </>
        )}
      </View>
    </View>
  );
}

const LADO_MARCO = '78%';
const GROSOR = 4;
const LARGO = 36;

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
  marcoCaja: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  marco: { width: LADO_MARCO, aspectRatio: 1 },
  esquina: { position: 'absolute', width: LARGO, height: LARGO },
  supIzq: { top: 0, left: 0, borderTopWidth: GROSOR, borderLeftWidth: GROSOR, borderTopLeftRadius: radio.m },
  supDer: { top: 0, right: 0, borderTopWidth: GROSOR, borderRightWidth: GROSOR, borderTopRightRadius: radio.m },
  infIzq: { bottom: 0, left: 0, borderBottomWidth: GROSOR, borderLeftWidth: GROSOR, borderBottomLeftRadius: radio.m },
  infDer: { bottom: 0, right: 0, borderBottomWidth: GROSOR, borderRightWidth: GROSOR, borderBottomRightRadius: radio.m },
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
