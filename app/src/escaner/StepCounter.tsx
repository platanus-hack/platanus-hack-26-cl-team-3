import { StyleSheet, Text, View } from 'react-native';

import { stageTitle } from '../chat/guide';
import type { ViewCard } from '../chat/history';
import { video } from '../theme';

export function StepCounter({ step, total, card }: { step: number; total: number; card?: ViewCard }) {
  if (!card || total < 1) return null;
  const label = `Paso ${step + 1} de ${total}`;
  return (
    <View style={styles.box} accessible accessibilityLabel={`${label}. ${stageTitle(card)}`}>
      <View style={styles.row}>
        <Text style={styles.text}>{label}</Text>
        <View style={styles.dots}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.on]} />
          ))}
        </View>
      </View>
      <Text style={styles.title}>{stageTitle(card)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    maxWidth: '100%',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: video.radio,
    borderWidth: 1,
    borderColor: video.borde,
    backgroundColor: video.panel,
  },
  row: { flexDirection: 'row', gap: video.espacio, alignItems: 'center' },
  title: { color: video.texto, fontSize: 14, fontWeight: '700' },
  text: { color: video.paso, fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: video.borde },
  on: { backgroundColor: video.paso },
});
