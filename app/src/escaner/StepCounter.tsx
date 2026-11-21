import { StyleSheet, Text, View } from 'react-native';

import { video } from '../theme';

export function StepCounter({ step, total }: { step: number; total: number }) {
  if (total < 2) return null;
  const label = `Paso ${step + 1} de ${total}`;
  return (
    <View style={styles.box} accessible accessibilityLabel={label}>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, i <= step && styles.on]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: video.espacio,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: video.radio,
    borderWidth: 1,
    borderColor: video.borde,
    backgroundColor: video.panel,
  },
  text: { color: video.paso, fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: video.borde },
  on: { backgroundColor: video.paso },
});
