/**
 * Escáner SIN AR (respaldo para teléfonos sin ARCore): fotos de la cámara → modelo → polígono dibujado en React Native.
 * El polígono se recalcula en cada análisis; no queda anclado al auto si el teléfono se mueve.
 */
import { CameraView } from 'expo-camera';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { analizarFoto, cargarDetector } from '../detector/detector';
import { poligonoVano, Suavizador, tramos, type Vano } from '../detector/vano';
import { color } from '../theme';
import { Boton } from '../ui';
import {
  BarraSuperior, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, Panel, PuntajeCapo, SUAVIZADO,
} from './comun';

const PAUSA_MS = 150;
const ROJO_CLARO = 'rgba(255, 110, 110, 0.32)';

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

type Tam = { ancho: number; alto: number };

export default function EscanerCamara() {
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

  useEffect(() => {
    if (!camaraLista || !modeloListo || !activa || error) return;
    let vivo = true;
    let fallos = 0;
    const capo = new PuntajeCapo();
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
          capo.agregar(r.puntaje);
          fallos = 0;
          setPuntaje(capo.media);
          setDetectado(capo.detectado);
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
  }, [camaraLista, modeloListo, activa, error]);

  const reintentar = () => {
    setPuntaje(null);
    setDetectado(false);
    setVano(null);
    setIntento((i) => i + 1);
  };

  const tono = detectado ? color.exito : color.acento;
  const cargando = !error && (!modeloListo || !camaraLista || puntaje === null);
  const mostrarVano = !!vano && !!foto && !!vista && (debug || detectado);

  return (
    <View style={estilos.raiz} onLayout={(e) => setVista({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
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
      <BarraSuperior debug={debug} alCambiarDebug={() => setDebug((d) => !d)} />
      <Panel>
        {error ? (
          <>
            <Encabezado icono="alert-circle-outline" tono={color.peligro} titulo="Algo falló" />
            <Detalle>{error}</Detalle>
            <Boton texto="Reintentar" icono="refresh" onPress={reintentar} estilo={{ marginTop: 12 }} />
          </>
        ) : cargando ? (
          <>
            <Encabezado cargando titulo={modeloListo ? 'Iniciando cámara…' : 'Preparando el reconocimiento…'} />
            <Detalle>{modeloListo ? 'Un momento.' : 'La primera vez tarda unos segundos.'}</Detalle>
          </>
        ) : (
          <>
            <Encabezado
              icono={detectado ? 'vector-polygon' : 'line-scan'}
              tono={tono}
              titulo={detectado ? (vano ? 'Vano del motor detectado' : 'Capó abierto detectado') : 'Buscando un capó abierto'}
            />
            <Detalle>
              {!detectado
                ? 'Abre el capó y apunta al motor desde arriba.'
                : !vano
                  ? 'No logro delimitar el vano. Prueba desde un poco más lejos.'
                  : vano.cortado
                    ? 'Parte del vano queda fuera de la imagen: aléjate un poco para verlo completo.'
                    : 'El contorno marca todo lo que hay bajo el capó.'}
              {' Este teléfono no tiene ARCore: el contorno no queda fijo si mueves la cámara.'}
            </Detalle>
            <Medidor puntaje={puntaje ?? 0} tono={tono} />
            {debug && (
              <LineaDebug
                texto={`Debug · sin AR · vano ${vano ? `${Math.round(vano.area * 100)} % · ${vano.esquinas.length} esquinas` : '–'}${
                  ms !== null ? ` · ${ms} ms` : ''
                }`}
              />
            )}
          </>
        )}
      </Panel>
    </View>
  );
}

/** Proyecta el polígono (coordenadas de la foto completa) sobre la vista previa, que llena la pantalla recortando bordes. */
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
              transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }],
            }}
          />
        );
      })}
      {puntos.map((p, i) => (
        <View key={`p${i}`} style={[styles.esquina, { left: p.x - 8, top: p.y - 8 }, p.borde ? styles.esquinaBorde : null]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
