import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { parts, type PartId } from '../engine-maps/catalog';
import { color, espacio, radio, tipo } from '../theme';
import { Boton } from '../ui';

export function GuideBanner({ part, instruction }: { part?: PartId; instruction: string }) {
  return (
    <View style={styles.banner}>
      {part && <Text style={styles.part}>{parts[part][0]}</Text>}
      <Text style={tipo.cuerpo}>{instruction}</Text>
      <Boton texto="Volver al chat" icono="arrow-left" variante="secundario" onPress={() => router.back()} estilo={styles.back} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: color.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: color.borde,
    padding: espacio.l,
    gap: espacio.xs,
  },
  part: { fontSize: 13, fontWeight: '800', color: color.acento, letterSpacing: 0.4 },
  back: { marginTop: espacio.s, paddingVertical: espacio.m },
});
