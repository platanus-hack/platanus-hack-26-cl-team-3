import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { color } from '../../theme';
import { useReducedMotion } from '../../useReducedMotion';
import { faseVoz, intensidadOyendo, type FaseVoz } from './fase';
import { useVivo } from './ModoVivo';

const CAPAS = 7; // un resplandor suave sin librerías de degradado: bordes concéntricos cada vez más tenues
const GROSOR = 5;
const RADIO_PANTALLA = 34;
const PENSANDO = '#B388FF';

/** Resplandor que bordea toda la pantalla. */
function Resplandor({ tono }: { tono: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CAPAS }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * GROSOR * 0.7,
            top: i * GROSOR * 0.7,
            right: i * GROSOR * 0.7,
            bottom: i * GROSOR * 0.7,
            borderWidth: GROSOR,
            borderRadius: Math.max(0, RADIO_PANTALLA - i * 3),
            borderColor: tono,
            opacity: Math.pow(1 - i / CAPAS, 1.6),
          }}
        />
      ))}
    </View>
  );
}

type Lado = 'arriba' | 'derecha' | 'abajo' | 'izquierda';
const LADOS: Lado[] = ['arriba', 'derecha', 'abajo', 'izquierda'];

/** Un lado de la pantalla con su resplandor; la «luz que recorre» enciende un lado tras otro. */
function ResplandorLado({ lado, tono }: { lado: Lado; tono: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CAPAS }, (_, i) => {
        const d = i * GROSOR * 0.7;
        const base = {
          position: 'absolute' as const,
          backgroundColor: tono,
          opacity: Math.pow(1 - i / CAPAS, 1.6),
        };
        if (lado === 'arriba') return <View key={i} style={{ ...base, left: 0, right: 0, top: d, height: GROSOR }} />;
        if (lado === 'abajo') return <View key={i} style={{ ...base, left: 0, right: 0, bottom: d, height: GROSOR }} />;
        if (lado === 'izquierda') return <View key={i} style={{ ...base, top: 0, bottom: 0, left: d, width: GROSOR }} />;
        return <View key={i} style={{ ...base, top: 0, bottom: 0, right: d, width: GROSOR }} />;
      })}
    </View>
  );
}

function useFase(fase: FaseVoz, objetivo: FaseVoz) {
  const [opacidad] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacidad, { toValue: fase === objetivo ? 1 : 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fase, objetivo, opacidad]);
  return opacidad;
}

/**
 * Feedback de voz a pantalla completa para el modo en vivo: se nota a simple vista, sin leer nada, si el asistente
 * está esperando (azul, respira), oyendo (verde, reacciona al volumen de la voz) o pensando (violeta, una luz recorre
 * el borde). Con «reducir movimiento» no hay animaciones en bucle, solo el color y el nivel de la voz.
 * No intercepta toques ni tapa los controles: es solo borde.
 */
export function EstadoVozPantalla({ pensando }: { pensando: boolean }) {
  const vivo = useVivo();
  const sinMovimiento = useReducedMotion();
  const fase = vivo ? faseVoz(vivo.estado, pensando) : 'ninguna';
  const nivel = vivo?.nivel ?? 0;

  const opEscucha = useFase(fase, 'escuchando');
  const opOyendo = useFase(fase, 'oyendo');
  const opPensando = useFase(fase, 'pensando');

  // Respiración del borde mientras espera.
  const [respiracion] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    if (fase !== 'escuchando' || sinMovimiento) {
      respiracion.setValue(0.6);
      return;
    }
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(respiracion, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(respiracion, { toValue: 0.35, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [fase, sinMovimiento, respiracion]);

  // El borde verde sigue el volumen de la voz.
  const [volumen] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    Animated.timing(volumen, { toValue: intensidadOyendo(nivel), duration: 90, easing: Easing.linear, useNativeDriver: true }).start();
  }, [nivel, volumen]);

  // Luz que recorre el borde mientras piensa: 0..4, un lado por unidad.
  const [vuelta] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (fase !== 'pensando' || sinMovimiento) {
      vuelta.setValue(0);
      return;
    }
    const bucle = Animated.loop(Animated.timing(vuelta, { toValue: 4, duration: 2000, easing: Easing.linear, useNativeDriver: true }));
    bucle.start();
    return () => bucle.stop();
  }, [fase, sinMovimiento, vuelta]);

  if (!vivo || fase === 'ninguna') return null;

  const luzDe = (lado: number) => {
    const una = vuelta.interpolate({ inputRange: [lado - 1, lado, lado + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
    const otra = vuelta.interpolate({ inputRange: [lado + 3, lado + 4, lado + 5], outputRange: [0, 1, 0], extrapolate: 'clamp' });
    return Animated.add(una, otra);
  };

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={fase === 'pensando' ? 'Pensando' : fase === 'oyendo' ? 'Te escucho hablar' : 'Escuchando'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(opEscucha, respiracion) }]}>
        <Resplandor tono={color.acento} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(opOyendo, volumen) }]}>
        <Resplandor tono={color.exito} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opPensando }]}>
        {sinMovimiento ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0.7 }]}>
            <Resplandor tono={PENSANDO} />
          </Animated.View>
        ) : (
          LADOS.map((lado, i) => (
            <Animated.View key={lado} style={[StyleSheet.absoluteFill, { opacity: luzDe(i) }]}>
              <ResplandorLado lado={lado} tono={PENSANDO} />
            </Animated.View>
          ))
        )}
      </Animated.View>
    </View>
  );
}
