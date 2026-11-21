/**
 * Escáner con ARCore: reconoce el vano UNA vez, lo «engancha» al espacio real y, si el vehículo tiene mapa de piezas,
 * mantiene ese mapa pegado al ancla (engine-maps/).
 *
 * 1. Buscando: cuadros de la cámara AR → modelo → polígono de vista previa (ámbar, punteado). Si el vano se ve chico
 *    (auto lejos, o una foto del auto completo en una pantalla) el análisis hace zoom solo (detector/encuadre.ts).
 * 2. Cuando la detección es estable (contorno válido, completo en la imagen, ARCore siguiendo el movimiento y con
 *    medidas de profundidad, 3 análisis seguidos) —o el usuario toca «Fijar ahora»— se ancla. El módulo nativo usa
 *    el mapa de profundidad completo (miles de puntos): plano si la superficie es plana, relieve si no.
 *    Escaneo: además, cada cuadro con vano y profundidad se suma a un mapa del vano en el mundo real (módulo nativo,
 *    Escaneo.kt). Así el vano se arma completo aunque en ningún cuadro quepa entero —lo normal parado frente al
 *    auto— y se fija solo cuando ese contorno deja de cambiar. El usuario solo tiene que recorrerlo con el teléfono.
 *    Marcar a mano («lazo»): el usuario rodea con el dedo todo lo que está bajo el capó; ese trazo pasa a ser el
 *    contorno y se fija igual que uno detectado. La precisión la pone la persona que está mirando el auto.
 * 3. Anclado: el contorno o el mapa de piezas se dibuja en nativo en cada cuadro con la pose actual del teléfono.
 *    - Cada pocos segundos se compara el contorno anclado con una detección nueva («calce», 0-100 %): mide cuánto se
 *      corrió. Si baja mucho, se sugiere recalibrar.
 *    - «Recalibrar»: vuelve a reconocer desde donde está el teléfono y reemplaza las anclas.
 *    - «Empezar de nuevo»: suelta las anclas y vuelve a buscar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VistaAR, type CapturaAR, type EstadoAR, type ResultadoFijar, type VistaARRef } from '../../modules/capo-ar';
import { analizarFoto, cargarDetector } from '../detector/detector';
import { aCuadroCompleto, COMPLETO, Encuadre, recorteAlrededor, type Recorte } from '../detector/encuadre';
import { iouPoligonos, poligonoVano, Suavizador, vanoDeTrazo, type Vano } from '../detector/vano';
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

const PUNTOS_MINIMOS = 500; // puntos del mapa de profundidad para fijar solo (si el teléfono tiene profundidad)
const PAUSA_CALCE_MS = 2500;
const VISTAS_PARA_FIJAR = 5; // cuadros del escaneo antes de fijar solo
const ACUERDO_MINIMO = 0.5; // coincidencia mínima entre el contorno del escaneo y lo que se ve en el cuadro actual
const CAMBIO_ESTABLE = 0.08; // el contorno del escaneo «dejó de cambiar» si su área varía menos que esto
const CALCE_BAJO = 0.5;

const plano = (v: Vano) => v.esquinas.flatMap((e) => [e.x, e.y]);
const pares = (c: number[]) => Array.from({ length: c.length / 2 }, (_, k) => ({ x: c[2 * k], y: c[2 * k + 1] }));
const pct = (x: number) => `${Math.round(x * 100)} %`;
/** ¿La captura trae medidas de distancia suficientes para ubicar el vano? (mapa de profundidad o, de respaldo, hit tests) */
const conMedidas = (c: CapturaAR | null) => !!c && (c.puntos >= PUNTOS_MINIMOS || c.muestras >= 4);

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
  const [escaneo, setEscaneo] = useState<{ vistas: number; estable: boolean; acuerdo: number } | null>(null);
  const [vanoEscaneo, setVanoEscaneo] = useState<Vano | null>(null); // contorno del escaneo visto en la última captura
  const [lazo, setLazo] = useState(false); // modo «marcar a mano»: el dedo dibuja el contorno
  const [trazo, setTrazo] = useState<{ x: number; y: number }[]>([]); // recorrido del dedo, en puntos de pantalla
  const puntosTrazo = useRef<{ x: number; y: number }[]>([]);
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
    if (!modeloListo || !sesionActiva || !activa || anclaje || error || lazo) return; // en modo lazo manda el dedo
    let vivo = true;
    let fallos = 0;
    let seguidos = 0;
    let previousCorners: number[] = [];
    let validos = 0;
    let total = 0;
    const puntajeCapo = new PuntajeCapo();
    const suavizador = new Suavizador(SUAVIZADO);
    const encuadre = new Encuadre();
    const areas: number[] = []; // área del contorno del escaneo en los últimos análisis
    let semilla: { x: number; y: number } | null = null; // punto marcado por el usuario, en la última captura
    (async () => {
      while (vivo && ar.current) {
        const t0 = Date.now();
        try {
          encuadre.apuntar(semilla);
          const recorte = encuadre.recorte();
          const cap = await ar.current.capturar();
          let r;
          try {
            r = await analizarFoto(cap.uri, recorte);
          } finally {
            borrar(cap.uri);
          }
          if (!vivo) break;
          semilla = cap.semilla && cap.semilla.length === 2 ? { x: cap.semilla[0], y: cap.semilla[1] } : null;
          // El punto marcado, en coordenadas del recorte que vio el modelo (si cae dentro).
          const sx = semilla ? (semilla.x - recorte.x) / recorte.lado : -1;
          const sy = semilla ? (semilla.y - recorte.y) / recorte.lado : -1;
          const enRecorte = poligonoVano(suavizador.agregar(r.vano), 0.5, sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 ? { x: sx, y: sy } : undefined);
          const e = encuadre.procesar(enRecorte);
          if (e.cambio) suavizador.reiniciar(); // el próximo análisis mira otro recorte: no se mezclan
          const v = e.vano; // en coordenadas del cuadro completo
          const valido = e.valido && !!v;
          await ar.current?.mostrarVista(valido && v ? plano(v) : [], valido && v ? v.esquinas.map((q) => q.borde) : [], cap.grados);
          const corners = volumes.length && valido && v ? registrationCorners(v) : [];
          const ready = !volumes.length || (corners.length === 8 && conMedidas(cap));
          const moved = previousCorners.length === 8 && corners.some((point, index) => Math.abs(point - previousCorners[index]) > .05);
          const conProfundidad = !cap.profundidad || cap.puntos >= PUNTOS_MINIMOS;
          seguidos = valido && v && !v.cortado && cap.rastreando && conProfundidad && ready ? (moved ? 1 : seguidos + 1) : 0;
          previousCorners = corners;
          total += 1;
          if (valido) validos += 1;
          fallos = 0;
          setCapo(puntajeCapo.agregar(r.puntaje).media);
          setVano(v);
          setValido(valido);
          setZoom(1 / recorte.lado);
          setTasa({ validos, total });
          setUltima(cap);
          setEstables(seguidos);

          // Escaneo: este cuadro se suma al mapa del vano en el mundo (si trae vano y profundidad).
          let delEscaneo: Vano | null = null;
          let estable = false;
          let acuerdo = 0;
          if (vanoValido(enRecorte) && cap.rastreando && cap.puntos >= PUNTOS_MINIMOS && ar.current) {
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
          setVanoEscaneo(delEscaneo);
          setMs(Date.now() - t0);

          // Se fija solo por cualquiera de los dos caminos: una vista completa y estable, o el escaneo ya estable.
          const listoEscaneo = !!delEscaneo && estable && (!volumes.length || registrationCorners(delEscaneo).length === 8);
          if (valido && v && seguidos >= ESTABLES_PARA_FIJAR) {
            if (await fijar(cap, v)) break;
            seguidos = 0;
            await esperar(500);
          } else if (listoEscaneo && delEscaneo) {
            if (await fijar(cap, delEscaneo)) break;
            areas.length = 0;
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
  }, [modeloListo, sesionActiva, activa, anclaje, error, fijar, volumes.length, lazo]);

  // Con el contorno anclado: «calce» periódico entre las anclas y lo que el modelo ve ahora (promedio de los últimos 3).
  useEffect(() => {
    setCalce(null);
    if (!anclaje || !modeloListo || !activa || error) return;
    let vivo = true;
    const ultimos: number[] = [];
    (async () => {
      while (vivo) {
        await esperar(PAUSA_CALCE_MS);
        if (!vivo) break;
        if (ocupado.current || !ar.current) continue;
        try {
          const cap = await ar.current.capturar();
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
          const v = poligonoVano(new Suavizador().agregar(r.vano));
          // Sin contorno válido en esta vista (o anclas fuera de cuadro) no hay con qué comparar: no se opina.
          if (!vanoValido(v) || !anclas) continue;
          ultimos.push(iouPoligonos(anclas, aCuadroCompleto(v, recorte).esquinas));
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
        const enRecorte = poligonoVano(new Suavizador().agregar(r.vano));
        if (!vanoValido(enRecorte) || !cap.rastreando) continue;
        const v = aCuadroCompleto(enRecorte, recorte);
        // Si el vano toca el borde del recorte (y no el del cuadro) quedó cortado por el zoom: se reintenta más abierto.
        if (enRecorte.esquinas.some((q, k) => q.borde && !v.esquinas[k].borde)) continue;
        if (volumes.length && v.cortado) continue; // el mapa de piezas necesita el vano completo
        try {
          setAnclaje(await ar.current.fijar(cap.id, plano(v), volumes.length ? registrationCorners(v) : [], volumes));
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
    setVano(null);
    setValido(false);
    setEstables(0);
    setTasa({ validos: 0, total: 0 });
    setEscaneo(null);
    setVanoEscaneo(null);
    setLazo(false);
    setTrazo([]);
    setAviso(null);
  };

  /** Entra o sale del modo «marcar a mano». Al entrar se limpia la vista previa para dibujar sobre la imagen sola. */
  const alternarLazo = async () => {
    const activar = !lazo;
    puntosTrazo.current = [];
    setTrazo([]);
    setAviso(null);
    setLazo(activar);
    if (activar) {
      setVano(null);
      setValido(false);
      setVanoEscaneo(null);
      setEscaneo(null);
      await ar.current?.mostrarVista([], [], 0);
      await ar.current?.reiniciarEscaneo();
    }
  };

  /** El dedo se levantó: el trazo pasa a ser el contorno del vano y se fija con la pose y la profundidad de este instante. */
  const terminarTrazo = async () => {
    const puntos = puntosTrazo.current;
    puntosTrazo.current = [];
    if (!ar.current || ocupado.current) return;
    if (puntos.length < 12) {
      setTrazo([]);
      setAviso('El trazo fue muy corto. Rodea con el dedo todo lo que está bajo el capó, en una sola vuelta.');
      return;
    }
    try {
      // La vista nativa trabaja en píxeles físicos; React Native entrega puntos independientes de la densidad.
      const d = PixelRatio.get();
      const r = await ar.current.capturarTrazo(puntos.flatMap((q) => [q.x * d, q.y * d]));
      if (!r.ok || r.id === undefined || !r.trazo) {
        setTrazo([]);
        setAviso('La realidad aumentada aún no sigue el movimiento. Mueve un poco el teléfono y vuelve a dibujar.');
        return;
      }
      const v = vanoDeTrazo(pares(r.trazo));
      if (!v) {
        setTrazo([]);
        setAviso('El trazo quedó muy chico o casi en línea. Rodea todo lo que está bajo el capó.');
        return;
      }
      // La captura del trazo no tiene imagen: solo importan su id y que había seguimiento.
      const captura: CapturaAR = {
        id: r.id, uri: '', ancho: 0, alto: 0, grados: 0, rastreando: true,
        muestras: r.muestras ?? 0, profundidad: (r.puntos ?? 0) > 0, puntos: r.puntos ?? 0,
      };
      if (await fijar(captura, v)) {
        setVano(v);
        setValido(true);
        setLazo(false);
      }
      setTrazo([]);
    } catch (e) {
      setTrazo([]);
      setAviso(`No se pudo fijar el trazo. ${String((e as Error)?.message ?? e)}`);
    }
  };
  // El PanResponder se crea una vez; llama siempre a la versión más reciente de terminarTrazo.
  const alTerminar = useRef(terminarTrazo);
  alTerminar.current = terminarTrazo;
  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        puntosTrazo.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
        setTrazo(puntosTrazo.current.slice());
      },
      onPanResponderMove: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const u = puntosTrazo.current[puntosTrazo.current.length - 1];
        if (u && Math.hypot(p.x - u.x, p.y - u.y) < 6) return; // un punto cada 6 puntos de pantalla alcanza
        puntosTrazo.current.push(p);
        if (puntosTrazo.current.length % 2 === 0) setTrazo(puntosTrazo.current.slice());
      },
      onPanResponderRelease: () => void alTerminar.current(),
      onPanResponderTerminate: () => {
        puntosTrazo.current = [];
        setTrazo([]);
      },
    }),
  ).current;

  const reintentar = () => {
    setError(null);
    setVano(null);
    setIntento((i) => i + 1);
  };

  if (!VistaAR) return null;
  const errorAR = estadoAR?.estado === 'error' ? estadoAR.detalle : null;
  const rastreando = estadoAR?.estado === 'rastreando';
  const detectado = valido && !!vano;
  const tono = anclaje || detectado ? color.exito : color.acento;
  // «Fijar ahora» usa el contorno del escaneo si existe (sirve aunque el vano no quepa en la imagen); si no, la vista actual.
  const paraFijar = vanoEscaneo ?? (detectado && (!map || !vano?.cortado) ? vano : null);
  const puedeFijar = !anclaje && !fijando && !!paraFijar && (!map || conMedidas(ultima)) && !!ultima?.rastreando;
  const leCuesta = tasa.total >= 6 && tasa.validos < tasa.total * 0.5;
  const faltaProfundidad = !!ultima?.profundidad && ultima.puntos < PUNTOS_MINIMOS;
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
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · ${anclaje.esquinas} anclas · ${resumenAnclaje(anclaje)} · calce ${
              calce ? `${pct(calce.valor)} (${calce.n})` : '–'
            }`}
          />
        )}
      </>
    );
  } else if (lazo) {
    panel = (
      <>
        <Encabezado icono="vector-polygon" tono={color.acento} cargando={fijando} titulo={fijando ? 'Fijando tu trazo…' : 'Marca el vano a mano'} />
        <Detalle>
          {rastreando
            ? 'Con el teléfono quieto, rodea con el dedo todo lo que está bajo el capó, en una sola vuelta. Al soltar queda fijado.'
            : 'Mueve el teléfono despacio unos segundos para que la realidad aumentada reconozca el entorno, y luego dibuja.'}
        </Detalle>
        {aviso && <Text style={styles.aviso}>{aviso}</Text>}
        <View style={estilos.botones}>
          <Boton texto="Cancelar" variante="secundario" onPress={() => void alternarLazo()} estilo={styles.flex} />
        </View>
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
              : escaneo && escaneo.vistas >= 2 && !escaneo.estable
                ? `Escaneando el vano: recórrelo despacio con el teléfono, de un lado al otro (${escaneo.vistas} vistas). Se fija solo cuando el contorno deja de cambiar.`
              : vano?.cortado
                ? 'El vano no cabe completo en la imagen: recórrelo despacio de un lado al otro para escanearlo, o aléjate un poco.'
                : faltaProfundidad || (map && !conMedidas(ultima))
                  ? 'Párate frente al auto y muévete despacio para que la cámara mida el vano.'
                  : `Desde el frente, mantén el teléfono quieto: se fija solo (${Math.min(estables, ESTABLES_PARA_FIJAR)}/${ESTABLES_PARA_FIJAR}).`}
        </Detalle>
        {aviso && <Text style={styles.aviso}>{aviso}</Text>}
        {leCuesta && <Text style={styles.aviso}>¿Le cuesta encontrarlo? Toca «Marcar a mano» y rodea el vano con el dedo.</Text>}
        <Medidor puntaje={vano?.confianza ?? 0} tono={tono} />
        <View style={estilos.botones}>
          <Boton
            texto={fijando ? 'Fijando…' : 'Fijar ahora'}
            icono="vector-polygon"
            variante={puedeFijar ? 'primario' : 'secundario'}
            onPress={() => puedeFijar && ultima && paraFijar && fijar(ultima, paraFijar)}
            estilo={[styles.flex, !puedeFijar && styles.apagado]}
          />
          <Boton texto="Marcar a mano" icono="gesture" variante="secundario" onPress={() => void alternarLazo()} estilo={styles.flex} />
        </View>
        {debug && (
          <LineaDebug
            texto={`Debug · AR ${estadoAR?.estado ?? '–'} · detección ${tasa.validos}/${tasa.total}${
              tasa.total ? ` (${pct(tasa.validos / tasa.total)})` : ''
            } · zoom ×${zoom.toFixed(1)} · escaneo ${escaneo ? `${escaneo.vistas} vistas, acuerdo ${pct(escaneo.acuerdo)}` : '–'} · vano ${vano ? `${pct(vano.area)} · ${vano.esquinas.length} esquinas` : '–'} · capó ${pct(capo)} · profundidad ${
              ultima?.profundidad ? `${ultima.puntos} puntos` : `no (${ultima?.muestras ?? 0}/49)`
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
      {/* Modo «marcar a mano»: esta capa recibe el dedo y muestra el trazo. Va debajo de la barra y del panel. */}
      {lazo && !anclaje && (
        <View style={styles.lienzo} {...gestos.panHandlers} accessibilityLabel="Rodea con el dedo todo lo que está bajo el capó">
          {trazo.map((q, i) => (
            <View key={i} pointerEvents="none" style={[styles.puntoTrazo, { left: q.x - 4, top: q.y - 4 }]} />
          ))}
        </View>
      )}
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
  lienzo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.12)' },
  puntoTrazo: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: color.acento },
});
