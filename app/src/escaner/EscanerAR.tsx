/**
 * Escáner con ARCore: reconoce el vano UNA vez y lo «engancha» al espacio real.
 *
 * 1. Buscando: cuadros de la cámara AR → modelo → polígono de vista previa (ámbar, punteado).
 * 2. Cuando la detección es estable (contorno válido, completo en la imagen y ARCore siguiendo el movimiento, 3
 *    análisis seguidos) —o el usuario toca «Fijar ahora»— cada esquina pasa a ser un ancla de ARCore.
 * 3. Anclado: el modelo se detiene; el polígono (verde) se dibuja en nativo en cada cuadro con la pose actual del
 *    teléfono y queda fijo sobre el auto mientras el usuario se mueve.
 *    - «Recalibrar»: vuelve a reconocer desde donde está el teléfono y reemplaza las anclas (para cuando el contorno
 *      quedó corrido tras alejarse y volver). El contorno anterior se mantiene hasta que hay uno nuevo.
 *    - «Empezar de nuevo»: suelta las anclas y vuelve a buscar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { VistaAR, type CapturaAR, type EstadoAR, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { poligonoVano, Suavizador, type Vano } from '../detector/vano';
import { color, espacio } from '../theme';
import { Boton } from '../ui';
import {
  BarraSuperior, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, Panel, PuntajeCapo, SUAVIZADO, vanoValido,
} from './comun';

const ESTABLES_PARA_FIJAR = 3;
const INTENTOS_RECALIBRAR = 3;

const plano = (v: Vano) => v.esquinas.flatMap((e) => [e.x, e.y]);

export default function EscanerAR() {
  const ar = useRef<VistaARRef>(null);
  const [estadoAR, setEstadoAR] = useState<EstadoAR | null>(null);
  const [modeloListo, setModeloListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [capo, setCapo] = useState(0); // puntaje «capó abierto» de CLIP (solo debug)
  const [vano, setVano] = useState<Vano | null>(null);
  const [estables, setEstables] = useState(0);
  const [anclaje, setAnclaje] = useState<ResultadoFijar | null>(null);
  const [fijando, setFijando] = useState(false);
  const [recalibrando, setRecalibrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultima, setUltima] = useState<CapturaAR | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [debug, setDebug] = useState(true);
  const [activa, setActiva] = useState(AppState.currentState === 'active');
  const ocupado = useRef(false); // fijando o recalibrando

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
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setFijando(true);
    try {
      setAnclaje(await ar.current.fijar(captura.id, plano(v)));
      setAviso(null);
    } catch (e) {
      setError(`No se pudo fijar el contorno. ${String((e as Error)?.message ?? e)}`);
    } finally {
      ocupado.current = false;
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
    const puntajeCapo = new PuntajeCapo();
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
          const v = poligonoVano(suavizador.agregar(r.vano));
          const valido = vanoValido(v);
          await ar.current?.mostrarVista(valido ? plano(v) : [], valido ? v.esquinas.map((e) => e.borde) : [], cap.grados);
          seguidos = valido && !v.cortado && cap.rastreando ? seguidos + 1 : 0;
          fallos = 0;
          setCapo(puntajeCapo.agregar(r.puntaje).media);
          setVano(v);
          setUltima(cap);
          setEstables(seguidos);
          setMs(Date.now() - t0);
          if (valido && seguidos >= ESTABLES_PARA_FIJAR) {
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

  /** Reconoce de nuevo desde la posición actual y reemplaza las anclas. Si no reconoce, deja el contorno como estaba. */
  const recalibrar = async () => {
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setRecalibrando(true);
    setAviso(null);
    try {
      for (let i = 0; i < INTENTOS_RECALIBRAR; i++) {
        const cap = await ar.current.capturar();
        let r;
        try {
          r = await analizarFoto(cap.uri);
        } finally {
          borrar(cap.uri);
        }
        const v = poligonoVano(new Suavizador().agregar(r.vano));
        if (vanoValido(v) && cap.rastreando) {
          setAnclaje(await ar.current.fijar(cap.id, plano(v)));
          setVano(v);
          setUltima(cap);
          return;
        }
      }
      setAviso('No reconocí el vano desde aquí, así que dejé el contorno como estaba. Apunta al motor completo y vuelve a intentarlo.');
    } catch (e) {
      setAviso(`No se pudo recalibrar. ${String((e as Error)?.message ?? e)}`);
    } finally {
      ocupado.current = false;
      setRecalibrando(false);
    }
  };

  const empezarDeNuevo = async () => {
    await ar.current?.soltar();
    setAnclaje(null);
    setVano(null);
    setEstables(0);
    setAviso(null);
  };

  const reintentar = () => {
    setVano(null);
    setIntento((i) => i + 1);
  };

  if (!VistaAR) return null;
  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const rastreando = estadoAR?.estado === 'rastreando';
  const detectado = vanoValido(vano);
  const tono = anclaje || detectado ? color.exito : color.acento;
  const puedeFijar = !anclaje && !fijando && detectado && !!ultima?.rastreando;

  let panel;
  if (error || errorAR) {
    panel = (
      <>
        <Encabezado icono="alert-circle-outline" tono={color.peligro} titulo="Algo falló" />
        <Detalle>{error ?? errorAR}</Detalle>
        <Boton texto="Reintentar" icono="refresh" onPress={reintentar} estilo={{ marginTop: espacio.m }} />
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
        <Encabezado
          icono="vector-polygon"
          tono={color.exito}
          cargando={recalibrando}
          titulo={recalibrando ? 'Recalibrando…' : 'Contorno fijado'}
        />
        <Detalle>
          {recalibrando
            ? 'Mantén el teléfono quieto apuntando al motor.'
            : rastreando
              ? 'Recorre el motor: el contorno se queda sobre el vano. Si se corre, apunta al motor completo y toca Recalibrar.'
              : 'La realidad aumentada perdió el seguimiento: vuelve a apuntar al motor y muévete despacio.'}
        </Detalle>
        {aviso && <Text style={styles.aviso}>{aviso}</Text>}
        <View style={estilos.botones}>
          <Boton
            texto="Recalibrar"
            icono="crosshairs-gps"
            onPress={recalibrar}
            estilo={[styles.flex, recalibrando && styles.apagado]}
          />
          <Boton texto="Empezar de nuevo" variante="secundario" onPress={empezarDeNuevo} estilo={[styles.flex, recalibrando && styles.apagado]} />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · anclas ${anclaje.esquinas} · ${anclaje.metodo} · ${anclaje.muestras} medidas en el vano · ${anclaje.distancia.toFixed(2)} m`}
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
          titulo={detectado ? 'Vano del motor detectado' : 'Buscando el vano del motor'}
        />
        <Detalle>
          {!rastreando
            ? 'Mueve el teléfono despacio unos segundos para que la realidad aumentada reconozca el entorno.'
            : !detectado
              ? 'Abre el capó y apunta al motor desde arriba, a un paso de distancia.'
              : vano.cortado
                ? 'Aléjate un poco para que todo el vano quede en la imagen: así se fija solo.'
                : `Mantén el teléfono quieto: se fija solo (${Math.min(estables, ESTABLES_PARA_FIJAR)}/${ESTABLES_PARA_FIJAR}).`}
        </Detalle>
        <Medidor puntaje={vano?.confianza ?? 0} tono={tono} />
        <View style={estilos.botones}>
          <Boton
            texto={fijando ? 'Fijando…' : 'Fijar ahora'}
            icono="vector-polygon"
            variante={puedeFijar ? 'primario' : 'secundario'}
            onPress={() => puedeFijar && ultima && vano && fijar(ultima, vano)}
            estilo={[styles.flex, !puedeFijar && styles.apagado]}
          />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'}${estadoAR?.profundidad ? ' · profundidad' : ''} · vano ${
              vano ? `${Math.round(vano.area * 100)} % · ${vano.esquinas.length} esquinas` : '–'
            } · capó ${Math.round(capo * 100)} % · ${ultima?.muestras ?? 0}/49 medidas${ms !== null ? ` · ${ms} ms` : ''}`}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  apagado: { opacity: 0.5 },
  aviso: { color: color.acento, fontSize: 13, lineHeight: 19, marginTop: espacio.s },
});
