import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GuiaAR } from '../../modules/capo-ar';
import { color, espacio } from '../theme';
import { Icono } from '../ui';
import { arrowPlacement, formatDistance, initialFound, nextFound, type FoundState } from './guide';

export type PartGuideRef = { push(event: GuiaAR): void };

const ARROW_SIZE = 46;
const ARROW_SIDE_INSET = 56;
const ARROW_TOP = 0.28;
const ARROW_BOTTOM = 0.6;
const PILL_OFFSET = 28;
const PILL_HEIGHT = 36;
const PILL_HALF_WIDTH = 80;

export function PartGuide({
  part,
  active,
  onFound,
  hidden,
  ref,
}: {
  part: number;
  hidden: boolean;
  active: boolean;
  onFound: () => void;
  ref?: Ref<PartGuideRef>;
}) {
  const [event, setEvent] = useState<GuiaAR | null>(null);
  const [found, setFound] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const state = useRef<FoundState>(initialFound);
  useImperativeHandle(
    ref,
    () => ({
      push(next) {
        if (!active || next.part !== part) return;
        const result = nextFound(state.current, next);
        state.current = result.state;
        setEvent(next);
        setFound(result.state.found);
        if (result.justFound) onFound();
      },
    }),
    [active, part, onFound],
  );

  const { width, height } = size;
  const ready = !hidden && active && event !== null && width > 0 && height > 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {ready && !event.visible && <Arrow event={event} width={width} height={height} />}
      {ready && event.visible && <Pill event={event} width={width} height={height} found={found} />}
    </View>
  );
}

function Arrow({ event, width, height }: { event: GuiaAR; width: number; height: number }) {
  const { left, top, rotation } = arrowPlacement(event, width, height, {
    left: ARROW_SIDE_INSET,
    top: height * ARROW_TOP,
    right: width - ARROW_SIDE_INSET,
    bottom: height * ARROW_BOTTOM,
  });
  return (
    <View
      style={[
        styles.arrow,
        { left: left - ARROW_SIZE / 2, top: top - ARROW_SIZE / 2, transform: [{ rotate: `${rotation}deg` }] },
      ]}
    >
      <Icono nombre="arrow-right" tam={28} tono={color.acentoTexto} />
    </View>
  );
}

function Pill({ event, width, height, found }: { event: GuiaAR; width: number; height: number; found: boolean }) {
  const left = Math.min(Math.max(event.x * width, PILL_HALF_WIDTH), width - PILL_HALF_WIDTH);
  const top = Math.min(Math.max(event.y * height + PILL_OFFSET, 0), height - PILL_HEIGHT);
  return (
    <View style={[styles.anchor, { left: left - PILL_HALF_WIDTH, top }]}>
      <View style={[styles.pill, { backgroundColor: found ? color.exito : color.velo }]}>
        {found && <Icono nombre="check" tam={18} tono={color.acentoTexto} />}
        <Text style={[styles.pillText, { color: found ? color.acentoTexto : color.texto }]}>
          {found ? 'La encontraste' : formatDistance(event.distance)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: {
    position: 'absolute',
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: color.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchor: { position: 'absolute', width: PILL_HALF_WIDTH * 2, height: PILL_HEIGHT, alignItems: 'center' },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingHorizontal: espacio.m,
    borderRadius: PILL_HEIGHT / 2,
  },
  pillText: { fontSize: 15, fontWeight: '700' },
});
