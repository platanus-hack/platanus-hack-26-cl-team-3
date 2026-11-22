import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CitationModal } from '../../chat/CitationModal';
import type { ViewCitation } from '../../chat/history';
import type { PartId } from '../../engine-maps/catalog';
import { color, espacio, radio, video } from '../../theme';
import { Icono } from '../../ui';
import { sourceLabel } from '../captions';
import { useCaptionChunk } from '../LiveCaptions';
import type { ModoVivoEstado } from './ModoVivo';
import { OPCIONES_VAD } from './vad';

const VARIACION = [0.7, 1, 0.55, 0.9, 0.8];
const BARRA_MIN = 4;
const BARRA_MAX = 16;

type Caption = { text: string; citations: ViewCitation[]; pensando: boolean };

export function TarjetaVivo({ vivo, caption, part, children }: {
  vivo: ModoVivoEstado;
  caption: Caption;
  part?: PartId;
  children?: ReactNode;
}) {
  const { estado, nivel, cerrando, parcial, pregunta, error, hablando: asistenteHabla, callar } = vivo;
  const [open, setOpen] = useState(false);
  const chunk = useCaptionChunk(vivo.agentPhrase || caption.text);
  const pensando = vivo.waitingForAgent || (estado === 'escuchando' && caption.pensando);
  const hablando = estado === 'oyendo';
  const transcribiendo = estado === 'transcribiendo';
  const guia = !error && !hablando && !transcribiendo && !pensando;
  const citation = guia ? (caption.citations.at(-1) ?? null) : null;
  const respondiendo = asistenteHabla && !error && !hablando && !transcribiendo;
  const label = citation ? sourceLabel(citation.title) || citation.source : '';

  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <View style={styles.izquierda}>
          {pensando || transcribiendo ? (
            <ActivityIndicator size="small" color={color.acento} />
          ) : estado === 'silenciado' && !respondiendo ? (
            <View style={[styles.punto, { backgroundColor: color.textoTenue }]} />
          ) : respondiendo ? (
            <Icono nombre="volume-high" tam={16} tono={color.acento} />
          ) : hablando ? null : (
            <PuntoRespira />
          )}
          {estado !== 'silenciado' && !pensando && !transcribiendo && !respondiendo && (
            <Barras nivel={nivel} tono={hablando ? (cerrando ? 'plano' : 'activo') : 'reposo'} />
          )}
          <Text style={styles.etiqueta} numberOfLines={1}>
            {vivo.waitingForAgent ? 'Pensando…' : pensando ? caption.text : respondiendo ? 'Hablando · toca para callar' : etiqueta(estado, cerrando)}
          </Text>
        </View>
        {guia && (
          <View style={styles.derecha}>
            {part && <Text style={styles.pieza} numberOfLines={1}>Asistente</Text>}
            {citation && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Ver cita: ${label}`} onPress={() => setOpen(true)} style={styles.fuente} hitSlop={8}>
                <Text style={styles.fuenteTexto} numberOfLines={1}>{label}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {error ? (
        <Text style={[styles.cuerpo, { color: color.textoSuave }]} numberOfLines={2}>{error}</Text>
      ) : hablando ? (
        <Text style={styles.cuerpo} numberOfLines={3}>
          {parcial}
          {!cerrando && <Cursor />}
        </Text>
      ) : transcribiendo ? (
        <Text style={[styles.cuerpo, !parcial && { color: color.textoTenue }]} numberOfLines={3}>{parcial || '…'}</Text>
      ) : pensando ? (
        <Text style={[styles.cuerpo, { color: color.textoSuave }]} numberOfLines={2}>{pregunta}</Text>
      ) : (
        <Text style={styles.cuerpo} numberOfLines={2} accessibilityLiveRegion="polite"
          onPress={respondiendo ? callar : undefined}
          accessibilityRole={respondiendo ? 'button' : undefined}
          accessibilityHint={respondiendo ? 'Toca para callar al asistente' : undefined}>{chunk}</Text>
      )}
      {guia && children}
      {hablando && cerrando && <BarraCierre />}
      <CitationModal citation={open ? citation : null} onClose={() => setOpen(false)} />
    </View>
  );
}

function etiqueta(estado: ModoVivoEstado['estado'], cerrando: boolean) {
  if (estado === 'silenciado') return 'Micrófono silenciado';
  if (estado === 'transcribiendo') return 'Transcribiendo…';
  if (estado === 'oyendo') return cerrando ? 'Te escuché' : 'Escuchando';
  return 'Te escucho';
}

function Barras({ nivel, tono }: { nivel: number; tono: 'reposo' | 'activo' | 'plano' }) {
  const fondo = tono === 'activo' ? color.acento : tono === 'plano' ? color.textoTenue : color.textoSuave;
  return (
    <View style={styles.barras}>
      {VARIACION.map((v, i) => (
        <View
          key={i}
          style={[styles.barra, { backgroundColor: fondo, height: tono === 'plano' ? BARRA_MIN : BARRA_MIN + (BARRA_MAX - BARRA_MIN) * Math.min(1, nivel * v) }]}
        />
      ))}
    </View>
  );
}

function useBucle(desde: number, hasta: number, ms: number) {
  const [valor] = useState(() => new Animated.Value(desde));
  useEffect(() => {
    valor.setValue(desde);
    const bucle = Animated.loop(Animated.timing(valor, { toValue: hasta, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    bucle.start();
    return () => bucle.stop();
  }, [valor, desde, hasta, ms]);
  return valor;
}

function PuntoRespira() {
  const t = useBucle(0, 1, 2000);
  return (
    <View style={styles.punto}>
      <Animated.View
        style={[
          styles.anillo,
          { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }) }] },
        ]}
      />
    </View>
  );
}

function Cursor() {
  const [valor] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(valor, { toValue: 0, duration: 1, delay: 500, useNativeDriver: true }),
        Animated.timing(valor, { toValue: 1, duration: 1, delay: 500, useNativeDriver: true }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [valor]);
  return <Animated.View style={[styles.cursor, { opacity: valor }]} />;
}

function BarraCierre() {
  const [avance] = useState(() => new Animated.Value(0));
  useEffect(() => {
    avance.setValue(0);
    const animacion = Animated.timing(avance, { toValue: 1, duration: OPCIONES_VAD.silencioFinMs, easing: Easing.linear, useNativeDriver: false });
    animacion.start();
    return () => animacion.stop();
  }, [avance]);
  return <Animated.View style={[styles.cierre, { width: avance.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />;
}

const styles = StyleSheet.create({
  tarjeta: { alignSelf: 'stretch', minWidth: 0, overflow: 'hidden', backgroundColor: color.velo, borderRadius: radio.l, padding: espacio.m, gap: espacio.s },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, minHeight: 16 },
  izquierda: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, flexShrink: 0 },
  derecha: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: espacio.s, minWidth: 0 },
  etiqueta: { color: color.textoSuave, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  pieza: { flexShrink: 1, color: video.paso, fontSize: 12, fontWeight: '700' },
  fuente: { maxWidth: '60%', borderColor: color.borde, borderWidth: 1, borderRadius: radio.s, paddingHorizontal: espacio.s, paddingVertical: 2 },
  fuenteTexto: { color: color.textoSuave, fontSize: 12, fontWeight: '600' },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.exito },
  anillo: { position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderRadius: 6, borderWidth: 2, borderColor: color.exito },
  barras: { flexDirection: 'row', alignItems: 'center', gap: 2, height: BARRA_MAX },
  barra: { width: 3, borderRadius: 2 },
  cuerpo: { color: color.texto, fontSize: 16, lineHeight: 22, fontWeight: '600', minHeight: 44 },
  cursor: { width: 2, height: 16, marginLeft: 2, backgroundColor: color.acento },
  cierre: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: color.acento },
});
