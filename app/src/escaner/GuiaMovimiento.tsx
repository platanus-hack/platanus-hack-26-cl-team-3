import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../useReducedMotion';
import { color, radio } from '../theme';
import { Icono } from '../ui';

const ARRIBA = 124; // debajo de la pista «Apunta la cámara al motor»

/**
 * Mientras se reconoce el vano, pide mover el teléfono de un lado a otro: con el vano visto desde puntos distintos la
 * app separa lo que es relieve real de una imagen plana y fija el mapa con mejor profundidad. La barra avanza con lo
 * que la cámara se movió de verdad (`base` de `objetivo`, en metros), no con el tiempo.
 */
export function GuiaMovimiento({ base, objetivo }: { base: number; objetivo: number }) {
  const insets = useSafeAreaInsets();
  const sinMovimiento = useReducedMotion();
  const [barrido] = useState(() => new Animated.Value(0));
  const avance = Math.max(0, Math.min(1, objetivo > 0 ? base / objetivo : 0));
  const listo = avance >= 1;

  useEffect(() => {
    if (sinMovimiento || listo) {
      barrido.setValue(0.5);
      return;
    }
    const vuelta = Animated.loop(
      Animated.sequence([
        Animated.timing(barrido, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(barrido, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    vuelta.start();
    return () => vuelta.stop();
  }, [barrido, sinMovimiento, listo]);

  return (
    <View
      pointerEvents="none"
      style={[styles.caja, { top: insets.top + ARRIBA }]}
      accessible
      accessibilityLabel={listo ? 'Listo, fijando el mapa' : 'Sigue apuntando al motor y muévete despacio de un lado a otro'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(avance * 100) }}
    >
      <View style={styles.carril}>
        <Animated.View style={{ transform: [{ translateX: barrido.interpolate({ inputRange: [0, 1], outputRange: [-34, 34] }) }] }}>
          <Icono nombre={listo ? 'check-circle' : 'cellphone'} tam={26} tono={listo ? color.exito : color.acento} />
        </Animated.View>
        <Icono nombre="swap-horizontal" tam={22} tono={color.textoSuave} />
      </View>
      <Text style={styles.texto}>
        {listo ? 'Listo, fijando el mapa…' : 'Sigue apuntando al motor y muévete despacio de un lado a otro'}
      </Text>
      <View style={styles.barra}>
        <View style={[styles.relleno, { width: `${Math.round(avance * 100)}%`, backgroundColor: listo ? color.exito : color.acento }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    position: 'absolute',
    alignSelf: 'center',
    width: 268,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radio.l,
    backgroundColor: color.velo,
    borderWidth: 1,
    borderColor: color.borde,
  },
  carril: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  texto: { color: color.texto, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  barra: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: color.superficieAlta, overflow: 'hidden' },
  relleno: { height: 6, borderRadius: 3 },
});
