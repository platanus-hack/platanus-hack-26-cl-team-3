/** Recognize the bay, then keep the selected vehicle mesh attached to its ARCore anchor. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VistaAR, type CapturaAR, type EstadoAR, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { poligonoVano, Suavizador, type Vano } from '../detector/vano';
import { engineMaps, parts } from '../engine-maps/catalog';
import { encodeVolumes, registrationCorners } from '../engine-maps/registration';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';
import type { Vehicle } from '../vehicles';
import {
  BarraSuperior, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, Panel, PuntajeCapo, SUAVIZADO, vanoValido,
} from './comun';

const ESTABLES_PARA_FIJAR = 3;
const INTENTOS_RECALIBRAR = 3;
const REGISTRATION_PENDING = 'ERR_REGISTRATION';
const isRegistrationPending = (error: unknown) => (error as { code?: string } | null)?.code === REGISTRATION_PENDING;

const plano = (v: Vano) => v.esquinas.flatMap((e) => [e.x, e.y]);

export default function EscanerAR({ vehicle }: { vehicle?: Vehicle }) {
  const map = vehicle ? engineMaps[vehicle.id] : undefined;
  const volumes = useMemo(() => map ? encodeVolumes(map.volumes) : [], [map]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const selected = map?.volumes[selectedIndex]?.part;
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
    cargarDetector()
      .then(() => setModeloListo(true))
      .catch((e) => setError(`No se pudo cargar el modelo de reconocimiento. ${String(e?.message ?? e)}`));
  }, [intento]);

  const fijar = useCallback(async (captura: CapturaAR, v: Vano) => {
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setFijando(true);
    try {
      setAnclaje(await ar.current.fijar(captura.id, plano(v), volumes.length ? registrationCorners(v) : [], volumes));
      setAviso(null);
      return true;
    } catch (e) {
      if (isRegistrationPending(e)) {
        setAviso('Aún faltan medidas del vano. Muévete un poco y vuelve a apuntar desde el frente.');
        return false;
      }
      setError(`No se pudo fijar el vano. ${String((e as Error)?.message ?? e)}`);
      return true;
    } finally {
      ocupado.current = false;
      setFijando(false);
    }
  }, [volumes]);

  const sesionActiva = estadoAR?.estado === 'rastreando' || estadoAR?.estado === 'sin-rastreo';

  // Bucle de detección: solo mientras NO está anclado (después, ARCore sostiene el polígono solo).
  useEffect(() => {
    if (!modeloListo || !sesionActiva || !activa || anclaje || error) return;
    let vivo = true;
    let fallos = 0;
    let seguidos = 0;
    let previousCorners: number[] = [];
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
          const corners = volumes.length && valido ? registrationCorners(v) : [];
          const ready = !volumes.length || (corners.length === 8 && cap.muestras >= 4);
          const moved = previousCorners.length === 8 && corners.some((point, index) => Math.abs(point - previousCorners[index]) > .05);
          seguidos = valido && !v.cortado && cap.rastreando && ready ? (moved ? 1 : seguidos + 1) : 0;
          previousCorners = corners;
          fallos = 0;
          setCapo(puntajeCapo.agregar(r.puntaje).media);
          setVano(v);
          setUltima(cap);
          setEstables(seguidos);
          setMs(Date.now() - t0);
          if (valido && seguidos >= ESTABLES_PARA_FIJAR) {
            if (await fijar(cap, v)) break;
            seguidos = 0;
            await esperar(500);
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
  }, [modeloListo, sesionActiva, activa, anclaje, error, fijar, volumes.length]);

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
        if (vanoValido(v) && (!volumes.length || !v.cortado) && cap.rastreando) {
          try {
            setAnclaje(await ar.current.fijar(cap.id, plano(v), volumes.length ? registrationCorners(v) : [], volumes));
          } catch (e) {
            if (isRegistrationPending(e)) continue;
            throw e;
          }
          setVano(v);
          setUltima(cap);
          return;
        }
      }
      setAviso('Se conservó el anclaje anterior. Ponte frente al auto, apunta al vano completo y vuelve a intentarlo.');
    } catch (e) {
      setAviso(`No se pudo recalibrar. ${String((e as Error)?.message ?? e)}`);
    } finally {
      ocupado.current = false;
      setRecalibrando(false);
    }
  };

  const empezarDeNuevo = async () => {
    if (ocupado.current) return;
    await ar.current?.soltar();
    setSelectedIndex(-1);
    setAnclaje(null);
    setVano(null);
    setEstables(0);
    setAviso(null);
  };

  const reintentar = () => {
    setError(null);
    setVano(null);
    setIntento((i) => i + 1);
  };

  if (!VistaAR) return null;
  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const rastreando = estadoAR?.estado === 'rastreando';
  const detectado = vanoValido(vano);
  const tono = anclaje || detectado ? color.exito : color.acento;
  const puedeFijar = !anclaje && !fijando && detectado && (!map || (!vano.cortado && (ultima?.muestras ?? 0) >= 4)) && !!ultima?.rastreando;
  const mapTracking = anclaje?.mapPlaced && estadoAR?.mapTracking;
  const fuseLink = selected === 'fuses' ? map?.fuseUrl : undefined;

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
          titulo={recalibrando ? 'Recalibrando…' : anclaje.mapPlaced ? 'Mapa del motor fijado' : 'Contorno fijado'}
        />
        <Detalle>
          {recalibrando
            ? 'Mantén el teléfono quieto apuntando al motor.'
            : !rastreando || (anclaje.mapPlaced && !mapTracking)
              ? 'Vuelve a apuntar al motor y muévete despacio para recuperar el seguimiento.'
              : mapTracking
                ? 'Toca una pieza del motor. Si el mapa se corre, ponte frente al auto y toca Recalibrar.'
                : map
                  ? 'Faltan medidas para colocar las piezas. Muévete despacio, apunta al vano completo y toca Recalibrar.'
                  : 'Recorre el motor. El contorno se mantiene sobre el vano.'}
        </Detalle>
        {mapTracking && map && (
          <>
            <Text style={tipo.nota}>{map.referenceVariant} · Ubicación aproximada</Text>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" style={styles.parts} showsHorizontalScrollIndicator={false}>
              {map.volumes.map(({ part }, index) => (
                <Pressable
                  key={part}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedIndex === index }}
                  onPress={() => setSelectedIndex(index)}
                  style={[styles.part, selectedIndex === index && styles.selected]}
                >
                  <Text style={tipo.nota}>{parts[part][0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {selected && (
              <Text style={tipo.nota} accessibilityLiveRegion="polite">
                {map.partDetails?.[selected] ?? parts[selected][1]}
              </Text>
            )}
            {fuseLink && (
              <Pressable
                accessibilityRole="link"
                onPress={() => { void Linking.openURL(fuseLink).catch(() => setAviso('No se pudo abrir el diagrama.')); }}
              >
                <Text style={styles.link}>Diagrama de fusibles del motor</Text>
              </Pressable>
            )}
          </>
        )}
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
              ? 'Párate frente al parachoques y apunta hacia abajo para que se vea el vano completo.'
              : vano.cortado
                ? 'Aléjate un poco para que todo el vano quede en la imagen: así se fija solo.'
                : map && (ultima?.muestras ?? 0) < 4
                  ? 'Párate frente al auto y muévete despacio para que la cámara mida el vano.'
                  : `Desde el frente, mantén el teléfono quieto: se fija solo (${Math.min(estables, ESTABLES_PARA_FIJAR)}/${ESTABLES_PARA_FIJAR}).`}
        </Detalle>
        {aviso && <Text style={styles.aviso}>{aviso}</Text>}
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
      <VistaAR
        ref={ar}
        style={StyleSheet.absoluteFill}
        debug={debug}
        selectedPart={selectedIndex}
        onPart={(e) => setSelectedIndex(e.nativeEvent.index)}
        onEstado={(e) => setEstadoAR(e.nativeEvent)}
      />
      <BarraSuperior debug={debug} alCambiarDebug={() => setDebug((d) => !d)} />
      <Panel>{panel}</Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  apagado: { opacity: 0.5 },
  parts: { marginTop: espacio.s, marginBottom: espacio.xs },
  part: { minHeight: 44, justifyContent: 'center', backgroundColor: color.superficieAlta, borderRadius: radio.m, paddingHorizontal: espacio.m, marginRight: espacio.s },
  selected: { borderColor: color.acento, borderWidth: 1 },
  link: { ...tipo.cuerpo, color: color.acento, paddingVertical: espacio.s },
  aviso: { color: color.acento, fontSize: 13, lineHeight: 19, marginTop: espacio.s },
});
