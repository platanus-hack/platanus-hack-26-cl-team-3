/**
 * Escáner con ARCore: reconoce el vano UNA vez, lo «engancha» al espacio real y, si el vehículo tiene mapa de piezas,
 * mantiene ese mapa pegado al ancla (engine-maps/).
 *
 * 1. Buscando: cuadros de la cámara AR → modelo → polígono de vista previa (ámbar, punteado). Si el vano se ve chico
 *    (auto lejos, o una foto del auto completo en una pantalla) el análisis hace zoom solo (detector/encuadre.ts).
 * 2. Cuando la detección es estable (contorno válido, completo en la imagen, ARCore siguiendo el movimiento y con
 *    medidas de profundidad, 3 análisis seguidos) —o el usuario toca «Fijar ahora»— se ancla. El módulo nativo usa
 *    el mapa de profundidad completo (miles de puntos): plano si la superficie es plana, relieve si no.
 * 3. Anclado: el contorno o el mapa de piezas se dibuja en nativo en cada cuadro con la pose actual del teléfono.
 *    - Cada pocos segundos se compara el contorno anclado con una detección nueva («calce», 0-100 %): mide cuánto se
 *      corrió. Si baja mucho, se sugiere recalibrar.
 *    - «Recalibrar»: vuelve a reconocer desde donde está el teléfono y reemplaza las anclas.
 *    - «Empezar de nuevo»: suelta las anclas y vuelve a buscar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VistaAR, type CapturaAR, type EstadoAR, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { aCuadroCompleto, COMPLETO, Encuadre, recorteAlrededor, type Recorte } from '../detector/encuadre';
import { iouPoligonos, poligonoVano, Suavizador, vanoValido, type Vano } from '../detector/vano';
import { engineMaps, parts } from '../engine-maps/catalog';
import { completeBay, encodeVolumes, registrationCorners, sameRegistrationView } from '../engine-maps/registration';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';
import type { Vehicle } from '../vehicles';
import {
  BarraSuperior, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, Panel, PuntajeCapo, SUAVIZADO,
} from './comun';

const ESTABLES_PARA_FIJAR = 3;
const INTENTOS_RECALIBRAR = 3;
const REGISTRATION_PENDING = 'ERR_REGISTRATION';
const isRegistrationPending = (error: unknown) => (error as { code?: string } | null)?.code === REGISTRATION_PENDING;

const CONTOUR_AUTO_DEPTH_POINTS = 500;
const PAUSA_CALCE_MS = 2500;
const CALCE_BAJO = 0.5;

const plano = (v: Vano) => v.esquinas.flatMap((e) => [e.x, e.y]);
const pares = (c: number[]) => Array.from({ length: c.length / 2 }, (_, k) => ({ x: c[2 * k], y: c[2 * k + 1] }));
const pct = (x: number) => `${Math.round(x * 100)} %`;
function resumenAnclaje(a: ResultadoFijar): string {
  if (a.metodo === 'plano' || a.metodo === 'relieve') {
    const partes = [`${a.metodo} · ${a.puntos ?? a.muestras} puntos`];
    if (a.plano !== undefined) partes.push(`${pct(a.plano)} en el plano`);
    if (a.rms !== undefined) partes.push(`±${(a.rms * 100).toFixed(1)} cm`);
    if (a.inclinacion !== undefined) partes.push(`superficie a ${Math.round(a.inclinacion)}°`);
    if (a.anguloVista !== undefined) partes.push(`vista a ${Math.round(a.anguloVista)}°`);
    partes.push(`${a.distancia.toFixed(2)} m`);
    return partes.join(' · ');
  }
  return `${a.metodo} · ${a.muestras} medidas · ${a.distancia.toFixed(2)} m`;
}

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
  const [vano, setVano] = useState<Vano | null>(null); // en coordenadas del cuadro completo
  const [valido, setValido] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tasa, setTasa] = useState({ validos: 0, total: 0 }); // análisis con contorno válido / análisis hechos
  const [calce, setCalce] = useState<{ valor: number; n: number } | null>(null);
  const [estables, setEstables] = useState(0);
  const [anclaje, setAnclaje] = useState<ResultadoFijar | null>(null);
  const [fijando, setFijando] = useState(false);
  const [recalibrando, setRecalibrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultima, setUltima] = useState<CapturaAR | null>(null);
  const [registrationCandidate, setRegistrationCandidate] = useState<{ capture: CapturaAR; bay: Vano } | null>(null);
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
      setCalce(null);
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
    let stableCorners: number[] = [];
    let validos = 0;
    let total = 0;
    const puntajeCapo = new PuntajeCapo();
    const suavizador = new Suavizador(SUAVIZADO);
    const frameMask = new Suavizador(1);
    const encuadre = new Encuadre();
    (async () => {
      while (vivo && ar.current) {
        const t0 = Date.now();
        try {
          const recorte = encuadre.recorte();
          const cap = await ar.current.capturar();
          let r;
          try {
            r = await analizarFoto(cap.uri, recorte);
          } finally {
            borrar(cap.uri);
          }
          if (!vivo) break;
          const freshBay = volumes.length ? completeBay(poligonoVano(frameMask.agregar(r.vano)), recorte) : null;
          const e = encuadre.procesar(poligonoVano(suavizador.agregar(r.vano)));
          if (e.cambio) suavizador.reiniciar(); // el próximo análisis mira otro recorte: no se mezclan
          const v = e.vano; // en coordenadas del cuadro completo
          const valido = e.valido && !!v;
          await ar.current?.mostrarVista(valido && v ? plano(v) : [], valido && v ? v.esquinas.map((q) => q.borde) : [], cap.grados);
          const corners = freshBay ? registrationCorners(freshBay) : [];
          const candidateBay = volumes.length
            ? (corners.length === 8 && cap.registrationMeasurements ? freshBay : null)
            : (valido ? v : null);
          const candidate = candidateBay && cap.rastreando ? { capture: cap, bay: candidateBay } : null;
          const autoReady = candidate && !candidate.bay.cortado
            && (volumes.length > 0 || !cap.profundidad || cap.puntos >= CONTOUR_AUTO_DEPTH_POINTS);
          if (!autoReady) {
            seguidos = 0;
            stableCorners = [];
          } else if (volumes.length && !sameRegistrationView(stableCorners, corners)) {
            stableCorners = corners;
            seguidos = 1;
          } else {
            seguidos += 1;
          }
          total += 1;
          if (valido) validos += 1;
          fallos = 0;
          setCapo(puntajeCapo.agregar(r.puntaje).media);
          setVano(v);
          setValido(valido);
          setZoom(1 / recorte.lado);
          setTasa({ validos, total });
          setUltima(cap);
          setRegistrationCandidate(candidate);
          setEstables(seguidos);
          setMs(Date.now() - t0);
          if (candidate && seguidos >= ESTABLES_PARA_FIJAR) {
            if (await fijar(candidate.capture, candidate.bay)) break;
            seguidos = 0;
            stableCorners = [];
            setRegistrationCandidate(null);
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

  // Con el contorno anclado: «calce» periódico entre las anclas y lo que el modelo ve ahora (promedio de los últimos 3).
  useEffect(() => {
    if (!anclaje || !modeloListo || !activa || error) return;
    let vivo = true;
    const ultimos: number[] = [];
    (async () => {
      while (vivo) {
        await esperar(PAUSA_CALCE_MS);
        if (!vivo) break;
        if (ocupado.current || !ar.current) continue;
        try {
          const cap = await ar.current.capturar(false);
          // El modelo mira la zona donde quedó el contorno anclado, con holgura (zoom): así también mide vanos chicos.
          const anclas = cap.anclas && cap.anclas.length >= 6 ? pares(cap.anclas) : null;
          const recorte = anclas ? recorteAlrededor(anclas, 2) : COMPLETO;
          let r;
          try {
            r = await analizarFoto(cap.uri, recorte);
          } finally {
            borrar(cap.uri);
          }
          if (!vivo) break;
          const bay = completeBay(poligonoVano(new Suavizador().agregar(r.vano)), recorte);
          if (!bay || !anclas || anclas.some(({ x, y }) => x <= 0 || x >= 1 || y <= 0 || y >= 1)) {
            ultimos.length = 0;
            setCalce(null);
            continue;
          }
          ultimos.push(iouPoligonos(anclas, bay.esquinas));
          if (ultimos.length > 3) ultimos.shift();
          setCalce({ valor: ultimos.reduce((a, b) => a + b, 0) / ultimos.length, n: ultimos.length });
        } catch {
          // una medición fallida no importa: se reintenta en la próxima vuelta
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [anclaje, modeloListo, activa, error]);

  /** Reconoce de nuevo desde la posición actual y reemplaza las anclas. Si no reconoce, deja el contorno como estaba. */
  const recalibrar = async () => {
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setRecalibrando(true);
    setAviso(null);
    try {
      for (let i = 0; i < INTENTOS_RECALIBRAR; i++) {
        const cap = await ar.current.capturar();
        // Primero mira cerca de donde está el contorno actual (zoom); en el último intento, el cuadro completo.
        const anclas = cap.anclas && cap.anclas.length >= 6 ? pares(cap.anclas) : null;
        const recorte: Recorte = anclas && i < INTENTOS_RECALIBRAR - 1 ? recorteAlrededor(anclas, i === 0 ? 1.8 : 2.8) : COMPLETO;
        let r;
        try {
          r = await analizarFoto(cap.uri, recorte);
        } finally {
          borrar(cap.uri);
        }
        const detection = poligonoVano(new Suavizador().agregar(r.vano));
        if (!cap.rastreando || !vanoValido(detection)) continue;
        const v = volumes.length ? completeBay(detection, recorte) : aCuadroCompleto(detection, recorte);
        if (!v || (volumes.length && (!cap.registrationMeasurements || registrationCorners(v).length !== 8))) continue;
        if (detection.esquinas.some((corner, index) => corner.borde && !v.esquinas[index].borde)) continue;
        try {
          setAnclaje(await ar.current.fijar(cap.id, plano(v), volumes.length ? registrationCorners(v) : [], volumes));
          setCalce(null);
        } catch (e) {
          if (isRegistrationPending(e)) continue;
          throw e;
        }
        setVano(v);
        setValido(true);
        setUltima(cap);
        return;
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
    setCalce(null);
    setVano(null);
    setValido(false);
    setEstables(0);
    setRegistrationCandidate(null);
    setTasa({ validos: 0, total: 0 });
    setAviso(null);
  };

  const reintentar = () => {
    setError(null);
    setVano(null);
    setRegistrationCandidate(null);
    setIntento((i) => i + 1);
  };

  if (!VistaAR) return null;
  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const rastreando = estadoAR?.estado === 'rastreando';
  const detectado = valido && !!vano;
  const tono = anclaje || detectado ? color.exito : color.acento;
  const puedeFijar = !anclaje && !fijando && rastreando && !!registrationCandidate;
  const corrido = !!calce && calce.n >= 2 && calce.valor < CALCE_BAJO;
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
          tono={corrido ? color.acento : color.exito}
          cargando={recalibrando}
          titulo={recalibrando ? 'Recalibrando…' : anclaje.mapPlaced ? 'Mapa del motor fijado' : 'Contorno fijado'}
        />
        <Detalle>
          {recalibrando
            ? 'Mantén el teléfono quieto apuntando al motor.'
            : !rastreando || (anclaje.mapPlaced && !mapTracking)
              ? 'Vuelve a apuntar al motor y muévete despacio para recuperar el seguimiento.'
              : corrido
                ? 'El anclaje parece corrido respecto de lo que veo ahora. Ponte frente al auto, apunta al vano completo y toca Recalibrar.'
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
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · ${anclaje.esquinas} anclas · ${resumenAnclaje(anclaje)} · calce del contorno ${
              calce ? `${pct(calce.valor)} (${calce.n})` : '–'
            }`}
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
              : vano?.cortado
                ? 'Aléjate un poco para que todo el vano quede en la imagen: así se fija solo.'
                : (map && !ultima?.registrationMeasurements)
                  || (!map && ultima?.profundidad && ultima.puntos < CONTOUR_AUTO_DEPTH_POINTS)
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
            onPress={() => puedeFijar && registrationCandidate && fijar(registrationCandidate.capture, registrationCandidate.bay)}
            estilo={[styles.flex, !puedeFijar && styles.apagado]}
          />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · detección ${tasa.validos}/${tasa.total}${
              tasa.total ? ` (${pct(tasa.validos / tasa.total)})` : ''
            } · zoom ×${zoom.toFixed(1)} · vano ${vano ? `${pct(vano.area)} · ${vano.esquinas.length} esquinas` : '–'} · capó ${pct(capo)} · profundidad ${
              ultima?.profundidad ? `${ultima.puntos} puntos · ${ultima.muestras}/49 medidas` : `no (${ultima?.muestras ?? 0}/49)`
            }${ms !== null ? ` · ${ms} ms` : ''}`}
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
