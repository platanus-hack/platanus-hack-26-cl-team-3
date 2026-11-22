/**
 * Escáner con ARCore: reconoce el vano UNA vez, lo «engancha» al espacio real y, si el vehículo tiene mapa de piezas,
 * mantiene ese mapa pegado al ancla (engine-maps/).
 *
 * 1. Buscando: cuadros de la cámara AR → modelo → polígono de vista previa (ámbar, punteado). Si el vano se ve chico
 *    (auto lejos, o una foto del auto completo en una pantalla) el análisis hace zoom solo (detector/encuadre.ts).
 * 2. The Outback compares initial visual placements in a common ARCore reference before anchoring.
 * 3. Anclado: el contorno o el mapa de piezas se dibuja en nativo en cada cuadro con la pose actual del teléfono.
 *    - Cada pocos segundos se compara el contorno anclado con una detección nueva («calce», 0-100 %): mide cuánto se
 *      corrió. Si baja mucho, se sugiere recalibrar.
 *    - «Recalibrar»: vuelve a reconocer desde donde está el teléfono y reemplaza las anclas.
 *    - «Empezar de nuevo»: suelta las anclas y vuelve a buscar.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VistaAR, type CapturaAR, type EstadoAR, type PartCenter, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { aCuadroCompleto, COMPLETO, Encuadre, recorteAlrededor, type Recorte } from '../detector/encuadre';
import { iouPoligonos, poligonoVano, Suavizador, vanoValido, type Vano } from '../detector/vano';
import swiftBinding from '../../modules/capo-ar/android/src/main/assets/engine-models/swift-registration.json';
import { inspectionActions, inspectionLabels, inspectionSeconds, type InspectionAction } from '../engine-maps/inspection';
import { engineMaps, parts, type PartId } from '../engine-maps/catalog';
import { confirmedPartCenters } from '../engine-maps/landmarks/part-centers';
import { locateOutbackParts, releaseOutbackEncoder } from '../engine-maps/landmarks/outback';
import { lastSonnetStatus, locatePartsWithSonnet, resetSonnetCalls } from '../engine-maps/landmarks/sonnet';
import { completeBay, extendsPartialMap, encodeVolumes, consistentCorrection, needsVisualCorrection, overlapsPlacedBay, registrationCorners, sameRegistrationView, visualBay } from '../engine-maps/registration';
import { InitialVisualScan } from './initial-visual-scan';
import { CameraHint, PartGuide, type PartGuideRef } from './PartGuide';
import { GuideCaptions, useCameraGuide } from './CameraGuide';
import { vanoParaChat } from './vivo/foto';
import { ProveedorVivo } from './vivo/ModoVivo';
import { StepCounter } from './StepCounter';
import type { ViewCard } from '../chat/history';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';
import type { Vehicle } from '../vehicles';
import {
  ScannerControls, useScannerControls, borrar, Detalle, Encabezado, esperar, estilos, LineaDebug, Medidor, PuntajeCapo, SUAVIZADO,
} from './comun';

const swiftMotions = new Map(
  (swiftBinding.parts as { id: string; inspection?: { kind: string } }[])
    .map(part => [part.id, part.inspection?.kind])
);

function swiftInspectionActions(part: PartId): InspectionAction[] {
  const motion = swiftMotions.get(part === 'brake_fluid' ? 'brake_cap' : part);
  const actions: InspectionAction[] = ['highlight', 'lift'];
  if (motion === 'separate') actions.push('separate');
  if (motion === 'twist') actions.push('open');
  if (part === 'washer' && motion === 'separate') actions.push('refill');
  return actions;
}

type PlacementCandidate = {
  capture: CapturaAR; bay: Vano; centers: PartCenter[]; partial: boolean;
};

const ESTABLES_PARA_FIJAR = 3;
const INTENTOS_RECALIBRAR = 3;
const REGISTRATION_PENDING = 'ERR_REGISTRATION';
const isRegistrationPending = (error: unknown) => (error as { code?: string } | null)?.code === REGISTRATION_PENDING;

const CONTOUR_AUTO_DEPTH_POINTS = 500;
const PAUSA_CALCE_MS = 2500;
const VISTAS_PARA_FIJAR = 5; // cuadros del escaneo antes de fijar solo
const ACUERDO_MINIMO = 0.5; // coincidencia mínima entre el contorno del escaneo y lo que se ve en el cuadro actual
const CAMBIO_ESTABLE = 0.08; // el contorno del escaneo «dejó de cambiar» si su área varía menos que esto
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

export default function EscanerAR({ vehicle, initialPart, steps = [], initialStep = 0, vivo = false }: { vehicle?: Vehicle; initialPart?: PartId; steps?: ViewCard[]; initialStep?: number; vivo?: boolean }) {
  const map = vehicle ? engineMaps[vehicle.id] : undefined;
  const outbackParts = useMemo(() => vehicle?.id === 'outback' ? map?.volumes.map(({ part }) => part) : undefined, [vehicle?.id, map]);
  const swiftParts = useMemo(() => vehicle?.id === 'swift' ? map?.volumes.map(({ part }) => part) : undefined, [vehicle?.id, map]);
  const volumes = useMemo(() => map ? encodeVolumes(map.volumes) : [], [map]);
  const initialIndex = map?.volumes.findIndex((volume) => volume.part === initialPart) ?? -1;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const selected = map?.volumes[selectedIndex]?.part;
  const cameraGuide = useCameraGuide(steps, initialStep, (card) => setSelectedIndex(map?.volumes.findIndex((volume) => volume.part === card.part) ?? -1));
  const ar = useRef<VistaARRef>(null);
  const guide = useRef<PartGuideRef>(null);
  const [estadoAR, setEstadoAR] = useState<EstadoAR | null>(null);
  const [modeloListo, setModeloListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [targetRevision, setTargetRevision] = useState(0);
  const [capo, setCapo] = useState(0); // puntaje «capó abierto» de CLIP (solo debug)
  const [vano, setVano] = useState<Vano | null>(null); // en coordenadas del cuadro completo
  const capturarVano = async () => {
    if (!vano || !ar.current) return null;
    const cap = await ar.current.capturar();
    return vanoParaChat(cap.uri, vano);
  };
  const [valido, setValido] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tasa, setTasa] = useState({ validos: 0, total: 0 }); // análisis con contorno válido / análisis hechos
  const [calce, setCalce] = useState<{ valor: number; n: number } | null>(null);
  const [estables, setEstables] = useState(0);
  const [anclaje, setAnclaje] = useState<(ResultadoFijar & { partial?: boolean; manual?: boolean }) | null>(null);
  const [editingMap, setEditingMap] = useState(false);
  const insets = useSafeAreaInsets();
  const [fijando, setFijando] = useState(false);
  const [recalibrando, setRecalibrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [escaneo, setEscaneo] = useState<{ vistas: number; estable: boolean; acuerdo: number } | null>(null);
  const [motorMarcado, setMotorMarcado] = useState(false);
  const [marca, setMarca] = useState<{ x: number; y: number } | null>(null); // aro visible donde se mantuvo presionado
  const [ultima, setUltima] = useState<CapturaAR | null>(null);
  const [registrationCandidate, setRegistrationCandidate] = useState<PlacementCandidate | null>(null);
  const [ms, setMs] = useState<number | null>(null);

  const [activa, setActiva] = useState(AppState.currentState === 'active');
  const registrationGeneration = useRef(0);
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

  const sonnetAnchorRef = useRef(false);
  const [sonnetNote, setSonnetNote] = useState('–');

  useEffect(() => {
    resetSonnetCalls();
  }, []);

  const lookForPartCenters = useCallback(async (captura: CapturaAR, bay: Vano): Promise<PartCenter[]> => {
    if (vehicle?.id !== 'outback' || !captura.profundidad || captura.puntos <= 0) return [];
    if (sonnetAnchorRef.current) {
      const fromSonnet = await locatePartsWithSonnet(captura, bay, engineMaps.outback.volumes);
      const last = lastSonnetStatus();
      if (last) setSonnetNote(last.points ? `${last.points} puntos en ${last.ms} ms` : 'sin respuesta');
      if (fromSonnet.length) return fromSonnet;
    }
    return locateOutbackParts(captura, bay, engineMaps.outback.volumes);
  }, [vehicle?.id]);

  const fijar = useCallback(async (captura: CapturaAR, v: Vano, centers: PartCenter[], partial = false, initial = false) => {
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setFijando(true);
    try {
      const place = initial && ar.current.placeInitial
        ? ar.current.placeInitial.bind(ar.current) : ar.current.fijar.bind(ar.current);
      const result = await place(captura.id, plano(v), volumes.length ? registrationCorners(v) : [], volumes, centers, !!visualBay(captura.visualOutline, v));
      setAnclaje({ ...result, partial: result.metodo !== 'visual' && partial });
      setCalce(null);
      setAviso(null);
      return true;
    } catch (e) {
      if (isRegistrationPending(e)) {
        setAviso('Aún faltan medidas del vano. Muévete un poco y vuelve a apuntar desde el frente.');
        return false;
      }
      if (anclaje) {
        setAviso('Se mantiene el mapa anterior. Puedes volver a recalibrar.');
        return false;
      }
      setError(`No se pudo fijar el vano. ${String((e as Error)?.message ?? e)}`);
      return true;
    } finally {
      ocupado.current = false;
      setFijando(false);
    }
  }, [volumes, anclaje]);

  const sesionActiva = estadoAR?.estado === 'rastreando' || estadoAR?.estado === 'sin-rastreo';

  const swiftDepthUnavailable = !!swiftParts && sesionActiva && estadoAR?.profundidad === false;
  const awaitingVisual = vehicle?.id === 'outback' && anclaje?.mapPlaced && anclaje.metodo !== 'visual' && !anclaje.manual;

  // Bucle de detección: solo mientras NO está anclado (después, ARCore sostiene el polígono solo).
  useEffect(() => {
    if (!modeloListo || !sesionActiva || swiftDepthUnavailable || !activa || (anclaje && ((!anclaje.partial && !awaitingVisual) || anclaje.manual)) || recalibrando || error) return;
    const generation = registrationGeneration.current;
    const initialScan = (outbackParts || swiftParts) && !anclaje ? new InitialVisualScan<PlacementCandidate & { visual: boolean }>() : null;
    let vivo = true;
    let fallos = 0;
    let seguidos = 0;
    let validos = 0;
    let total = 0;
    const puntajeCapo = new PuntajeCapo();
    const suavizador = new Suavizador(SUAVIZADO);
    const frameMask = new Suavizador(1);
    const encuadre = new Encuadre();
    const areas: number[] = []; // área del contorno del escaneo en los últimos análisis
    let semilla: { x: number; y: number } | null = null; // punto marcado por el usuario, en la última captura
    (async () => {
      while (vivo && ar.current && generation === registrationGeneration.current) {
        const t0 = performance.now();
        let captureUri: string | undefined;
        try {
          encuadre.apuntar(semilla);
          const recorte = encuadre.recorte();
          const cap = await ar.current.capturar();
          captureUri = cap.uri;
          const r = await analizarFoto(cap.uri, recorte);
          if (!vivo || generation !== registrationGeneration.current) break;
          semilla = cap.semilla && cap.semilla.length === 2 ? { x: cap.semilla[0], y: cap.semilla[1] } : null;
          // El punto marcado, en coordenadas del recorte que vio el modelo (si cae dentro).
          const sx = semilla ? (semilla.x - recorte.x) / recorte.lado : -1;
          const sy = semilla ? (semilla.y - recorte.y) / recorte.lado : -1;
          const seed = sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 ? { x: sx, y: sy } : undefined;
          const detection = volumes.length ? poligonoVano(frameMask.agregar(r.vano), .5, seed) : null;
          const enRecorte = poligonoVano(suavizador.agregar(r.vano), .5, seed);
          const e = encuadre.procesar(enRecorte);
          if (e.cambio) suavizador.reiniciar(); // el próximo análisis mira otro recorte: no se mezclan
          const v = e.vano; // en coordenadas del cuadro completo
          const valido = e.valido && !!v;
          let candidateBay = vanoValido(detection) ? aCuadroCompleto(detection, recorte) : (valido ? v : null);
          let clipped = vanoValido(detection) ? detection.cortado : (enRecorte?.cortado ?? true);
          if (candidateBay && detection?.cortado && recorte.lado < 1) {
            // The same JPEG may contain the missing portion outside the search crop.
            try {
              const wide = await analizarFoto(cap.uri, COMPLETO);
              const full = poligonoVano(frameMask.agregar(wide.vano), .5, semilla ?? undefined);
              if (vanoValido(full) && full.area > candidateBay.area
                && iouPoligonos(candidateBay.esquinas, full.esquinas) >= .6 * candidateBay.area / full.area) {
                candidateBay = full;
                clipped = full.cortado;
              }
            } catch {
              // The original detection remains usable.
            }
            if (!vivo) break;
          }
          const visual = visualBay(cap.visualOutline, candidateBay);
          if (!candidateBay && visual) {
            candidateBay = visual;
            clipped = visual.cortado;
          }
          await ar.current?.mostrarVista(candidateBay ? plano(candidateBay) : [], candidateBay?.esquinas.map(q => q.borde) ?? [], cap.grados);
          const contourReady = candidateBay && cap.rastreando && !candidateBay.cortado
            && (!cap.profundidad || cap.puntos >= CONTOUR_AUTO_DEPTH_POINTS);
          seguidos = contourReady ? seguidos + 1 : 0;
          total += 1;
          if (valido) validos += 1;
          setCapo(puntajeCapo.agregar(r.puntaje).media);
          setVano(candidateBay ?? v);
          setValido(!!candidateBay);
          setZoom(1 / recorte.lado);
          setTasa({ validos, total });
          setUltima(cap);
          setEstables(seguidos);

          // Escaneo: este cuadro se suma al mapa del vano en el mundo (si trae vano y profundidad).
          let delEscaneo: Vano | null = null;
          let estable = false;
          let acuerdo = 0;
          if (vanoValido(enRecorte) && cap.rastreando && cap.puntos >= CONTOUR_AUTO_DEPTH_POINTS && ar.current) {
            let bits = '';
            for (let k = 0; k < r.vano.length; k++) bits += r.vano[k] > 0 ? '1' : '0';
            const acc = await ar.current.acumular(cap.id, bits, recorte.x, recorte.y, recorte.lado);
            if (!vivo) break;
            if (acc.ok && acc.mapa && acc.vistas >= 2) {
              const enMapa = poligonoVano(
                Float32Array.from(acc.mapa, (q) => q / 100),
                0.5,
                acc.semilla ? { x: acc.semilla[0], y: acc.semilla[1] } : undefined,
              );
              if (enMapa && ar.current) {
                // Deja el contorno pegado al mundo como vista previa y lo trae proyectado a esta captura.
                const enImagen = await ar.current.contornoEscaneo(cap.id, plano(enMapa));
                if (!vivo) break;
                if (enImagen.length === enMapa.esquinas.length * 2) {
                  const candidato: Vano = { esquinas: pares(enImagen).map((q) => ({ ...q, borde: false })), area: enMapa.area, confianza: enMapa.confianza, cortado: false };
                  // Control cruzado: dentro de la imagen, el contorno del escaneo tiene que coincidir con lo que el modelo
                  // ve en este mismo cuadro. Si no coincide (teléfono movido, o un error al ubicar el mapa), no se usa.
                  acuerdo = v ? iouPoligonos(candidato.esquinas, v.esquinas) : 0;
                  if (acuerdo >= ACUERDO_MINIMO) {
                    delEscaneo = candidato;
                    areas.push(enMapa.area);
                    if (areas.length > 3) areas.shift();
                    estable =
                      acc.vistas >= VISTAS_PARA_FIJAR && areas.length === 3 && (Math.max(...areas) - Math.min(...areas)) / Math.max(...areas) < CAMBIO_ESTABLE;
                  }
                }
              }
            }
            setEscaneo({ vistas: acc.vistas, estable, acuerdo });
          }

          setMs(Math.round(performance.now() - t0));
          const previous = cap.anclas ? pares(cap.anclas) : [];
          const expanded = !!delEscaneo && extendsPartialMap(previous, delEscaneo);
          const scan = estable && (!anclaje || expanded) ? delEscaneo : null;
          const bay = swiftParts ? visual : (scan ?? candidateBay);
          const freshTarget = vanoValido(detection) ? candidateBay : visual;
          let candidate: (PlacementCandidate & { visual: boolean }) | undefined;
          if (bay && cap.rastreando) {
            const partial = !!volumes.length && clipped;
            const sameTarget = !!scan || (previous.length > 0 && overlapsPlacedBay(previous, bay));
            const attempt = volumes.length
              ? (!anclaje || (awaitingVisual && !!visual && overlapsPlacedBay(previous, visual)) || (anclaje.partial && sameTarget && (!partial || !!scan)))
              : (!!scan || seguidos >= ESTABLES_PARA_FIJAR);
            const centers = attempt && volumes.length && !visual ? await lookForPartCenters(cap, bay) : [];
            if (!vivo || generation !== registrationGeneration.current) break;
            setRegistrationCandidate(initialScan && !freshTarget ? null : { capture: cap, bay: attempt ? bay : (delEscaneo ?? bay), centers, partial });
            if (attempt) candidate = { capture: cap, bay, centers, partial, visual: !!visualBay(cap.visualOutline, bay) };
          } else {
            setRegistrationCandidate(null);
          }
          if (!cap.rastreando) initialScan?.reset();
          const placement = initialScan && cap.rastreando
            ? initialScan.select(t0, performance.now(), candidate, freshTarget ?? undefined) : candidate;
          if (vivo && generation === registrationGeneration.current && placement) {
            if (await fijar(placement.capture, placement.bay, placement.centers, placement.partial, !!initialScan)) break;
            initialScan?.discard(placement.capture.id);
          }
          fallos = 0;
        } catch (e) {
          if (!vivo || generation !== registrationGeneration.current) break;
          initialScan?.reset();
          seguidos = 0;
          setRegistrationCandidate(null);
          setEstables(0);
          fallos += 1;
          if (fallos >= 5) {
            if (anclaje) {
              setAviso('Se mantiene el mapa mientras se recupera la cámara.');
              fallos = 0;
              await esperar(PAUSA_CALCE_MS);
              continue;
            }
            setError(`El análisis falló varias veces seguidas. ${String((e as Error)?.message ?? e)}`);
            break;
          }
          await esperar(800);
        } finally {
          if (captureUri) borrar(captureUri);
        }
        await esperar(awaitingVisual ? PAUSA_CALCE_MS : 100);
      }
    })();
    return () => {
      vivo = false;
      releaseOutbackEncoder();
    };
  }, [modeloListo, sesionActiva, activa, anclaje, error, fijar, lookForPartCenters, volumes.length, recalibrando, awaitingVisual, outbackParts, swiftParts, swiftDepthUnavailable, targetRevision]);

  // Con el contorno anclado: «calce» periódico entre las anclas y lo que el modelo ve ahora (promedio de los últimos 3).
  useEffect(() => {
    if (!anclaje || anclaje.partial || awaitingVisual || !modeloListo || !activa || error) return;
    const generation = registrationGeneration.current;
    let vivo = true;
    const ultimos: number[] = [];
    let previousCorrection: number[] | null = null;
    const monitor = anclaje.metodo === 'visual' && !anclaje.manual;
    (async () => {
      while (vivo) {
        await esperar(monitor ? 750 : PAUSA_CALCE_MS);
        if (!vivo) break;
        if (ocupado.current || !ar.current) continue;
        try {
          const cap = await ar.current.capturar(monitor);
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
          const visual = monitor && cap.rastreando ? visualBay(cap.visualOutline, bay) : null;
          const registered = cap.registeredOutline;
          const correction = registered && visual && needsVisualCorrection(registered, visual, cap.landmarkGainPx)
            ? visual.esquinas.flatMap(({ x, y }, i) => [x - registered[2*i], y - registered[2*i+1]])
            : null;
          const confirmed = consistentCorrection(previousCorrection, correction);
          previousCorrection = correction;
          if (visual && confirmed && generation === registrationGeneration.current) {
            previousCorrection = null;
            if (await fijar(cap, bay ?? visual, [])) break;
          }
          if (!bay || !anclas || anclas.some(({ x, y }) => x <= 0 || x >= 1 || y <= 0 || y >= 1)) {
            ultimos.length = 0;
            setCalce(null);
            continue;
          }
          ultimos.push(iouPoligonos(anclas, bay.esquinas));
          if (ultimos.length > 3) ultimos.shift();
          setCalce({ valor: ultimos.reduce((a, b) => a + b, 0) / ultimos.length, n: ultimos.length });
        } catch {
          previousCorrection = null;
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [anclaje, modeloListo, activa, error, awaitingVisual, fijar]);

  /** Reconoce de nuevo desde la posición actual y reemplaza las anclas. Si no reconoce, deja el contorno como estaba. */
  const recalibrar = async () => {
    if (ocupado.current || !ar.current) return;
    ocupado.current = true;
    setRecalibrando(true);
    setAviso(null);
    try {
      let previousCenters: PartCenter[] = [];
      let previousCorners: number[] = [];
      for (let i = 0; i < INTENTOS_RECALIBRAR; i++) {
        const cap = await ar.current.capturar();
        // Primero mira cerca de donde está el contorno actual (zoom); en el último intento, el cuadro completo.
        const anclas = cap.anclas && cap.anclas.length >= 6 ? pares(cap.anclas) : null;
        const recorte: Recorte = anclas && i < INTENTOS_RECALIBRAR - 1 ? recorteAlrededor(anclas, i === 0 ? 1.8 : 2.8) : COMPLETO;
        try {
          const r = await analizarFoto(cap.uri, recorte);
          const detection = poligonoVano(new Suavizador().agregar(r.vano));
          const detected = vanoValido(detection) ? aCuadroCompleto(detection, recorte) : null;
          const visual = visualBay(cap.visualOutline, detected);
          const v = detected ?? visual;
          if (!cap.rastreando || !v) {
            previousCenters = [];
            previousCorners = [];
            continue;
          }
          const corners = volumes.length ? registrationCorners(v) : [];
          const observed = visual ? [] : await lookForPartCenters(cap, v);
          const centers = sameRegistrationView(previousCorners, corners)
            ? confirmedPartCenters(previousCenters, observed, v, cap.alto / cap.ancho)
            : [];
          previousCenters = observed;
          previousCorners = corners;
          if (!centers.length && observed.length && i < INTENTOS_RECALIBRAR - 1) continue;
          try {
            const result = await ar.current.fijar(cap.id, plano(v), corners, volumes, centers, !!visual);
            setAnclaje({ ...result, partial: result.metodo !== 'visual' && !!volumes.length && v.cortado });
            setCalce(null);
          } catch (e) {
            if (isRegistrationPending(e)) continue;
            throw e;
          }
          setVano(v);
          setValido(true);
          setUltima(cap);
          return;
        } finally {
          borrar(cap.uri);
        }
      }
      setAviso('Se conservó el anclaje anterior. Ponte frente al auto, apunta al vano completo y vuelve a intentarlo.');
    } catch (e) {
      setAviso(`No se pudo recalibrar. ${String((e as Error)?.message ?? e)}`);
    } finally {
      ocupado.current = false;
      setRecalibrando(false);
      releaseOutbackEncoder();
    }
  };

  const empezarDeNuevo = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    registrationGeneration.current++;
    try {
      await ar.current?.soltar();
    } catch {
      setAviso('No se pudo reiniciar el mapa. Vuelve a intentarlo.');
      setAnclaje(current => current && { ...current });
      return;
    } finally {
      ocupado.current = false;
    }
    setSelectedIndex(initialIndex);
    setEditingMap(false);
    setAnclaje(null);
    setCalce(null);
    setVano(null);
    setValido(false);
    setEstables(0);
    setRegistrationCandidate(null);
    setTasa({ validos: 0, total: 0 });
    setEscaneo(null);
    setMotorMarcado(false);
    setMarca(null);
    setAviso(null);
  };

  /** El usuario mantuvo presionado sobre el motor: se guarda ese punto del mundo para centrar y desambiguar la detección. */
  const marcarMotor = async (x: number, y: number) => {
    if (!ar.current || anclaje || ocupado.current) return;
    const revision = ++registrationGeneration.current;
    ocupado.current = true;
    setRegistrationCandidate(null);
    try {
      // La vista nativa trabaja en píxeles físicos; React Native entrega puntos independientes de la densidad.
      const ok = await ar.current.sembrar(x * PixelRatio.get(), y * PixelRatio.get());
      if (!ok) {
        setAviso('No pude medir ese punto. Mueve un poco el teléfono y vuelve a mantener presionado sobre el motor.');
        return;
      }
      setMotorMarcado(true);
      setAviso(null);
      setMarca({ x, y });
      setTimeout(() => setMarca(null), 1800);
    } catch (e) {
      setAviso(`No se pudo marcar el motor. ${String((e as Error)?.message ?? e)}`);
    } finally {
      ocupado.current = false;
      setTargetRevision(revision);
    }
  };

  const reintentar = () => {
    setError(null);
    setVano(null);
    setRegistrationCandidate(null);
    setIntento((i) => i + 1);
  };

  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const controls = useScannerControls(!!(error || errorAR));
  const { debug } = controls;
  useEffect(() => { sonnetAnchorRef.current = controls.sonnetAnchor; }, [controls.sonnetAnchor]);
  const playedStep = useRef(-1);
  const mapTracking = anclaje?.mapPlaced && estadoAR?.mapTracking;
  const { current: step, stepKey, play, stop, focus } = cameraGuide;
  const detailedParts = swiftParts ?? outbackParts;
  const refillLoop = !!(cameraGuide.refilling && mapTracking && selected === 'washer' &&
    (outbackParts || (swiftParts && swiftInspectionActions('washer').includes('refill'))));
  const choosePart = (index: number) => {
    setSelectedIndex(index);
    const part = map?.volumes[index]?.part;
    if (detailedParts && part) cameraGuide.toggleFocus(part);
    else if (part !== focus) cameraGuide.clearFocus();
  };
  const playedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus) playedFocus.current = null;
    else if (playedFocus.current !== focus && mapTracking && detailedParts && selected === focus && ar.current) {
      playedFocus.current = focus;
      play('highlight');
      void ar.current.playPartAction(focus, 'highlight').catch(() => setAviso('No se pudo mostrar la acción.'));
    }
  }, [focus, mapTracking, detailedParts, selected, play]);
  useEffect(() => {
    if (refillLoop) {
      playedStep.current = stepKey;
      return;
    }
    if (playedStep.current !== stepKey && mapTracking && detailedParts && step?.action && selected === step.part && ar.current &&
        (!swiftParts || swiftInspectionActions(step.part).includes(step.action))) {
      playedStep.current = stepKey;
      play(step.action);
      void ar.current.playPartAction(step.part, step.action).catch(() => setAviso('No se pudo mostrar la acción.'));
    }
  }, [refillLoop, mapTracking, detailedParts, swiftParts, selected, step, stepKey, play]);
  useEffect(() => {
    if (!refillLoop) return;
    const cycle = () => {
      play('refill', true);
      void ar.current?.playPartAction('washer', 'refill').catch(() => setAviso('No se pudo mostrar la acción.'));
    };
    cycle();
    const id = setInterval(cycle, inspectionSeconds.refill * 1000);
    return () => {
      clearInterval(id);
      stop();
    };
  }, [refillLoop, play, stop]);
  if (!VistaAR) return null;
  const rastreando = estadoAR?.estado === 'rastreando';
  const detectado = valido && !!vano;
  const tono = anclaje || detectado ? color.exito : color.acento;
  const puedeFijar = !anclaje && !fijando && rastreando && !!registrationCandidate;
  const leCuesta = !motorMarcado && tasa.total >= 6 && tasa.validos < tasa.total * 0.5;
  const corrido = !!calce && calce.n >= 2 && calce.valor < CALCE_BAJO;
  const fuseLink = selected === 'fuses' ? map?.fuseUrl : undefined;

  let status = 'Apunta al motor';
  let engineHint: string | null = null;
  if (error || errorAR) status = 'Error de cámara';
  else if (estadoAR?.estado === 'instalando') status = 'Preparando RA…';
  else if (!modeloListo || !sesionActiva) status = 'Iniciando cámara…';
  else if (recalibrando) status = 'Recalibrando…';
  else if (aviso) status = 'Ver aviso';
  else if (anclaje && (!rastreando || (anclaje.mapPlaced && !mapTracking))) {
    status = 'Buscando seguimiento…';
    engineHint = 'Vuelve a apuntar al motor';
  } else if (mapTracking) status = selected ? parts[selected][0] : 'Mapa fijado';
  else if (anclaje) status = 'Contorno fijado';
  else if (swiftDepthUnavailable) {
    status = 'Profundidad no disponible';
    engineHint = 'Este dispositivo no admite la profundidad necesaria para anclar el mapa del Swift.';
  } else if (swiftParts && !registrationCandidate) status = 'Apunta al depósito de frenos y a la batería. El anclaje requiere profundidad.';
  else if ((outbackParts || swiftParts) && registrationCandidate) status = 'Scanning…';
  else if (detectado) status = map ? 'Alineando mapa…' : 'Vano detectado';
  else engineHint = 'Apunta la cámara al motor';

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
  } else if (swiftDepthUnavailable) {
    panel = (
      <>
        <Encabezado icono="information-outline" titulo="Profundidad no disponible" />
        <Detalle>Para ubicar estas piezas del Swift se necesita un teléfono compatible con profundidad ARCore.</Detalle>
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
              : anclaje.partial
                ? 'Mapa aproximado. Recorre el vano despacio para ajustar las piezas con una vista más amplia.'
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
                  onPress={() => choosePart(index)}
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
            {(outbackParts || swiftParts) && selected && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parts}>
                {(swiftParts ? swiftInspectionActions(selected) : inspectionActions(selected)).map((action) => (
                  <Pressable key={action} accessibilityRole="button" style={styles.part}
                    onPress={() => {
                      controls.setMode('compact');
                      cameraGuide.play(action);
                      void ar.current?.playPartAction(selected, action).catch(() => setAviso('No se pudo mostrar la acción.'));
                    }}>
                    <Text style={tipo.nota}>{action === 'separate' && selected === 'brake_fluid' ? 'Separar tapa en 3D' : inspectionLabels[action]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {outbackParts && selected === 'fuses' && (
              <Boton texto="Ver fusibles por circuito" icono="fuse" variante="secundario"
                onPress={() => router.push('/outback-fuses')} />
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
        {mapTracking && (
          <Boton texto="Ajustar mapa a mano" icono="gesture-pinch" variante="secundario" onPress={() => {
            if (ocupado.current) return;
            registrationGeneration.current++;
            setAnclaje(current => current && { ...current, manual: true });
            setEditingMap(true);
            controls.setMode('compact');
          }} />
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
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · ${anclaje.esquinas} anclas · ${resumenAnclaje(anclaje)}${
              anclaje.adjustedParts?.length ? ` · ${anclaje.adjustedParts.length} piezas ajustadas` : ''
            } · calce del contorno ${
              calce ? `${pct(calce.valor)} (${calce.n})` : '–'
            }${controls.sonnetAnchor ? ` · Sonnet ${sonnetNote}` : ''}`}
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
              : map ? 'Alineando el mapa con la parte visible del vano…'
              : escaneo && escaneo.vistas >= 2 && !escaneo.estable
                ? `Escaneando el vano: recórrelo despacio con el teléfono, de un lado al otro (${escaneo.vistas} vistas). Se fija solo cuando el contorno deja de cambiar.`
              : vano?.cortado
                ? 'El vano no cabe completo en la imagen: recórrelo despacio de un lado al otro para escanearlo, o aléjate un poco.'
                : ultima?.profundidad && ultima.puntos < CONTOUR_AUTO_DEPTH_POINTS
                  ? 'Párate frente al auto y muévete despacio para que la cámara mida el vano.'
                  : `Desde el frente, mantén el teléfono quieto: se fija solo (${Math.min(estables, ESTABLES_PARA_FIJAR)}/${ESTABLES_PARA_FIJAR}).`}
        </Detalle>
        {aviso && <Text style={styles.aviso}>{aviso}</Text>}
        {leCuesta && <Text style={styles.aviso}>¿Le cuesta encontrarlo? Mantén presionado sobre el motor en la imagen.</Text>}
        {motorMarcado && !detectado && <Text style={tipo.nota}>Motor marcado: la búsqueda se centra en ese punto.</Text>}
        <Medidor puntaje={vano?.confianza ?? 0} tono={tono} />
        <View style={estilos.botones}>
          <Boton
            texto={fijando ? 'Fijando…' : 'Fijar ahora'}
            icono="vector-polygon"
            variante={puedeFijar ? 'primario' : 'secundario'}
            onPress={() => puedeFijar && registrationCandidate && fijar(
              registrationCandidate.capture, registrationCandidate.bay, registrationCandidate.centers, registrationCandidate.partial
            )}
            estilo={[styles.flex, !puedeFijar && styles.apagado]}
          />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · detección ${tasa.validos}/${tasa.total}${
              tasa.total ? ` (${pct(tasa.validos / tasa.total)})` : ''
            } · zoom ×${zoom.toFixed(1)} · escaneo ${escaneo ? `${escaneo.vistas} vistas, acuerdo ${pct(escaneo.acuerdo)}` : '–'}${motorMarcado ? ' · motor marcado' : ''} · vano ${vano ? `${pct(vano.area)} · ${vano.esquinas.length} esquinas` : '–'} · capó ${pct(capo)} · profundidad ${
              ultima?.profundidad ? `${ultima.puntos} puntos` : `no (${ultima?.muestras ?? 0}/49)`
            }${ms !== null ? ` · ${ms} ms` : ''}${controls.sonnetAnchor ? ` · Sonnet ${sonnetNote}` : ''}`}
          />
        )}
      </>
    );
  }

  return (
    <ProveedorVivo
      activo={vivo}
      capturarVano={capturarVano}
      preguntar={(t, img, signal) => cameraGuide.ask(t, false, { image: img ?? undefined, mode: 'vivo', signal })}
    >
      <View style={estilos.raiz}>
        {/* Siempre montada: al pasar a segundo plano el módulo nativo pausa ARCore y conserva las anclas. */}
        <VistaAR
          ref={ar}
          style={StyleSheet.absoluteFill}
          editingMap={editingMap && !error && !errorAR}
          debug={debug}
          outbackParts={outbackParts}
          swiftParts={swiftParts}
          selectedPart={selectedIndex}
          focusedPart={focus}
          onPart={(e) => choosePart(e.nativeEvent.index)}
          onEstado={(e) => setEstadoAR(e.nativeEvent)}
          onGuia={(e) => guide.current?.push(e.nativeEvent)}
        />
        <PartGuide hidden={editingMap || controls.mode === 'hidden'} key={`${selectedIndex}:${!!mapTracking}`} ref={guide} part={selectedIndex}
          name={selected ? parts[selected][0] : undefined} active={!!mapTracking && selectedIndex >= 0} onFound={() => void ar.current?.pulso()} />
        {engineHint && !editingMap && controls.mode !== 'hidden' && <CameraHint text={engineHint} />}
        {/* Mientras busca: mantener presionado sobre el motor ayuda a la detección. Ya anclado no se pone, para no tapar
            los toques sobre las piezas del mapa. */}
        {!anclaje && (
          <Pressable
            style={StyleSheet.absoluteFill}
            delayLongPress={450}
            onLongPress={(e) => void marcarMotor(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            accessibilityLabel="Mantén presionado sobre el motor para ayudar a la detección"
          />
        )}
        {marca && <View pointerEvents="none" style={[styles.marca, { left: marca.x - 22, top: marca.y - 22 }]} />}
        {editingMap && !error && !errorAR ? (
          <View style={[styles.editBar, { bottom: insets.bottom + espacio.m }]}>
            <Text style={styles.editHint}>{mapTracking ? 'Arrastra o pellizca el mapa' : 'Vuelve a apuntar al motor'}</Text>
            <Boton texto="Listo" icono="check" onPress={() => setEditingMap(false)} />
          </View>
        ) : (
          <ScannerControls controls={controls} status={status} top={<StepCounter step={cameraGuide.index} total={cameraGuide.steps.length} />}
            captions={<GuideCaptions guide={cameraGuide} />} step={cameraGuide.current}>{panel}</ScannerControls>
        )}
      </View>
    </ProveedorVivo>
  );
}

const styles = StyleSheet.create({
  editBar: { position: 'absolute', alignSelf: 'center', maxWidth: '96%', flexDirection: 'row', alignItems: 'center',
    gap: espacio.s, paddingLeft: espacio.m, borderRadius: radio.m, backgroundColor: color.velo },
  editHint: { ...tipo.nota, color: color.texto, flexShrink: 1 },
  flex: { flex: 1 },
  apagado: { opacity: 0.5 },
  parts: { marginTop: espacio.s, marginBottom: espacio.xs },
  part: { minHeight: 44, justifyContent: 'center', backgroundColor: color.superficieAlta, borderRadius: radio.m, paddingHorizontal: espacio.m, marginRight: espacio.s },
  selected: { borderColor: color.acento, borderWidth: 1 },
  link: { ...tipo.cuerpo, color: color.acento, paddingVertical: espacio.s },
  aviso: { color: color.acento, fontSize: 13, lineHeight: 19, marginTop: espacio.s },
  marca: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: color.acento, backgroundColor: color.acentoSuave },
});
