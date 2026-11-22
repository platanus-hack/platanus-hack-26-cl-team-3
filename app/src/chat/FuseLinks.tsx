import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { espacio } from '../theme';
import { fuseRoute } from './camera';
import { ChoiceButton } from './GuideChoice';
import type { ViewFuse } from './history';

const BOX_LABEL = { cabin: 'caja de la cabina', engine: 'caja del motor' } as const;

export function FuseLinks({
  fuses,
  disabled,
  browse = false,
}: {
  fuses: ViewFuse[];
  disabled: boolean;
  browse?: boolean;
}) {
  const seen = new Set<string>();
  const targets = fuses.flatMap(({ box, numbers }) => numbers.map(number => ({ box, number })))
    .filter(({ box, number }) => {
      const key = box + number;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!targets.length) return browse ? <ChoiceButton compacto icono="fuse" texto="Ver fusibles por circuito"
    deshabilitado={disabled} onPress={() => router.push('/outback-fuses')} /> : null;
  return (
    <View style={styles.list}>
      {targets.map(({ box, number }) => (
          <ChoiceButton
            compacto
            key={`${box}-${number}`}
            icono="fuse"
            texto={`Ver fusible ${number} · ${BOX_LABEL[box]}`}
            deshabilitado={disabled}
            onPress={() => router.push(fuseRoute(box, number))}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: espacio.s, marginTop: espacio.m },
});
