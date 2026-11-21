/**
 * Escáner con ARCore: reconoce el vano UNA vez y lo «engancha» al espacio real.
 *
 * 1. Buscando: cuadros de la cámara AR → modelo → polígono de vista previa (ámbar, punteado).
 * 2. Cuando la detección es estable (capó abierto, vano completo en la imagen y ARCore siguiendo el movimiento, 3
 *    análisis seguidos) —o el usuario toca «Fijar ahora»— cada esquina pasa a ser un ancla de ARCore.
 * 3. Anclado: el modelo se detiene; el polígono (verde) se dibuja en nativo en cada cuadro con la pose actual del
 *    teléfono y queda fijo sobre el auto mientras el usuario se mueve. «Volver a detectar» suelta las anclas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { VistaAR, type CapturaAR, type EstadoAR, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { poligonoVano, Suavizador, type Vano } from '../detector/vano';
import { color } from '../theme';
import { Boton } from '../ui';
import {
  BarraSuperior, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, Panel, PuntajeCapo, SUAVIZADO,
} from './comun';

const ESTABLES_PARA_FIJAR = 3;

const plano = (v: Vano) => v.esquinas.flatMap((e) => [e.x, e.y]);

export default function EscanerAR() {
  const ar = useRef<VistaARRef>(null);
  const [estadoAR, setEstadoAR] = useState<EstadoAR | null>(null);
  const [modeloListo, setModeloListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [detectado, setDetectado] = useState(false);
  const [vano, setVano] = useState<Vano | null>(null);
  const [estables, setEstables] = useState(0);
  const [anclaje, setAnclaje] = useState<ResultadoFijar | null>(null);
  const [fijando, setFijando] = useState(false);
  const [ultima, setUltima] = useState<CapturaAR | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [debug, setDebug] = useState(true);
  const [activa, setActiva] = useState(AppState.currentState === 'active');
  const fijandoRef = useRef(false);

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

  const fijar = useCallback(async (captura: CapturaAR, v: Vano) => {
    if (fijandoRef.current || !ar.current) return;
    fijandoRef.current = true;
    setFijando(true);
    try {
      setAnclaje(await ar.current.fijar(captura.id, plano(v)));
    } catch (e) {
      setError(`No se pudo fijar el contorno. ${String((e as Error)?.message ?? e)}`);
    } finally {
      fijandoRef.current = false;
      setFijando(false);
    }
  }, []);

  const sesionActiva = estadoAR?.estado === 'rastreando' || estadoAR?.estado === 'sin-rastreo';

  // Bucle de detección: solo mientras NO está anclado (después, ARCore sostiene el polígono solo).
  useEffect(() => {
    if (!modeloListo || !sesionActiva || !activa || anclaje || error) return;
    let vivo = true;
    let fallos = 0;
    let seguidos = 0;
    const capo = new PuntajeCapo();
    const suavizador = new Suavizador(SUAVIZADO);
    (async () => {
      while (vivo && ar.current) {
        const t0 = Date.now();
        try {
          const cap = await ar.current.capturar();
          let r;
          try {
            r = await analizarFoto(cap.uri);
          } finally {
            borrar(cap.uri);
          }
          if (!vivo) break;
          capo.agregar(r.puntaje);
          const v = poligonoVano(suavizador.agregar(r.vano));
          await ar.current?.mostrarVista(v ? plano(v) : [], v ? v.esquinas.map((e) => e.borde) : [], cap.grados);
          seguidos = capo.detectado && v && !v.cortado && cap.rastreando ? seguidos + 1 : 0;
          fallos = 0;
          setPuntaje(capo.media);
          setDetectado(capo.detectado);
          setVano(v);
          setUltima(cap);
          setEstables(seguidos);
          setMs(Date.now() - t0);
          if (v && seguidos >= ESTABLES_PARA_FIJAR) {
            await fijar(cap, v);
            break;
          }
        } catch (e) {
          if (!vivo) break;
          fallos += 1;
          if (fallos >= 5) {
            setError(`El análisis falló varias veces seguidas. ${String((e as Error)?.message ?? e)}`);
            break;
          }
          await esperar(800);
        }
        await esperar(100);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [modeloListo, sesionActiva, activa, anclaje, error, fijar]);

  const volverADetectar = async () => {
    await ar.current?.soltar();
    setAnclaje(null);
    setVano(null);
    setEstables(0);
    setPuntaje(null);
  };

  const reintentar = () => {
    setPuntaje(null);
    setVano(null);
    setIntento((i) => i + 1);
  };

  if (!VistaAR) return null;
  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const tono = anclaje ? color.exito : detectado ? color.exito : color.acento;
  const rastreando = estadoAR?.estado === 'rastreando';
  const puedeFijar = !anclaje && !fijando && !!vano && !!ultima?.rastreando;

  let panel;
  if (error || errorAR) {
    panel = (
      <>
        <Encabezado icono="alert-circle-outline" tono={color.peligro} titulo="Algo falló" />
        <Detalle>{error ?? errorAR}</Detalle>
        <Boton texto="Reintentar" icono="refresh" onPress={reintentar} estilo={{ marginTop: 12 }} />
      </>
    );
  } else if (estadoAR?.estado === 'instalando') {
    panel = (
      <>
        <Encabezado cargando titulo="Preparando la realidad aumentada…" />
        <Detalle>Android pide instalar o actualizar «Servicios de Google Play para RA». Acéptalo y vuelve a la app.</Detalle>
      </>
    );
  } else if (!modeloListo || !sesionActiva) {
    panel = (
      <>
        <Encabezado cargando titulo={modeloListo ? 'Iniciando la cámara AR…' : 'Preparando el reconocimiento…'} />
        <Detalle>{modeloListo ? 'Un momento.' : 'La primera vez tarda unos segundos.'}</Detalle>
      </>
    );
  } else if (anclaje) {
    panel = (
      <>
        <Encabezado icono="vector-polygon" tono={color.exito} titulo="Contorno fijado" />
        <Detalle>
          {rastreando
            ? 'Recorre el motor: el contorno se queda sobre el vano aunque muevas el teléfono.'
            : 'La realidad aumentada perdió el seguimiento: vuelve a apuntar al motor y muévete despacio.'}
          {anclaje.metodo === 'estimado' || anclaje.metodo === 'distancia-media'
            ? ' La distancia al motor se estimó; si el contorno se desliza al moverte, vuelve a detectar.'
            : ''}
        </Detalle>
        <View style={estilos.botones}>
          <Boton texto="Volver a detectar" icono="refresh" variante="secundario" onPress={volverADetectar} estilo={styles.flex} />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · anclas ${anclaje.esquinas} · ${anclaje.metodo} · ${anclaje.muestras}/49 medidas · ${anclaje.distancia.toFixed(2)} m`}
          />
        )}
      </>
    );
  } else {
    panel = (
      <>
        <Encabezado
          icono={detectado ? 'vector-polygon' : 'line-scan'}
          tono={tono}
          titulo={detectado ? (vano ? 'Vano del motor detectado' : 'Capó abierto detectado') : 'Buscando un capó abierto'}
        />
        <Detalle>
          {!rastreando
            ? 'Mueve el teléfono despacio unos segundos para que la realidad aumentada reconozca el entorno.'
            : !detectado
              ? 'Abre el capó y apunta al motor desde arriba.'
              : !vano
                ? 'No logro delimitar el vano. Prueba desde un poco más lejos.'
                : vano.cortado
                  ? 'Aléjate un poco para que todo el vano quede en la imagen: así se fija solo.'
                  : `Mantén el teléfono quieto: se fija solo (${Math.min(estables, ESTABLES_PARA_FIJAR)}/${ESTABLES_PARA_FIJAR}).`}
        </Detalle>
        <Medidor puntaje={puntaje ?? 0} tono={tono} />
        <View style={estilos.botones}>
          <Boton
            texto={fijando ? 'Fijando…' : 'Fijar ahora'}
            icono="vector-polygon"
            variante={puedeFijar ? 'primario' : 'secundario'}
            onPress={() => puedeFijar && ultima && vano && fijar(ultima, vano)}
            estilo={[styles.flex, !puedeFijar && { opacity: 0.5 }]}
          />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'}${estadoAR?.profundidad ? ' · profundidad' : ''} · vano ${
              vano ? `${Math.round(vano.area * 100)} % · ${vano.esquinas.length} esquinas` : '–'
            } · ${ultima?.muestras ?? 0}/49 medidas${ms !== null ? ` · ${ms} ms` : ''}`}
          />
        )}
      </>
    );
  }

  return (
    <View style={estilos.raiz}>
      {/* Siempre montada: al pasar a segundo plano el módulo nativo pausa ARCore y conserva las anclas. */}
      <VistaAR ref={ar} style={StyleSheet.absoluteFill} debug={debug} onEstado={(e) => setEstadoAR(e.nativeEvent)} />

      <BarraSuperior debug={debug} alCambiarDebug={() => setDebug((d) => !d)} />
      <Panel>{panel}</Panel>
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
