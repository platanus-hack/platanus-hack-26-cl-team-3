import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { boxName, fuseGuideFor } from '../fusibles/guides';
import { espacio } from '../theme';
import { fuseRoute } from './camera';
import { ChoiceButton } from './GuideChoice';
import type { ViewFuse } from './history';

export function FuseLinks({
  vehicleId,
  fuses,
  disabled,
  browse = false,
}: {
  vehicleId?: string;
  fuses: ViewFuse[];
  disabled: boolean;
  browse?: boolean;
}) {
  const guide = fuseGuideFor(vehicleId);
  if (!vehicleId || !guide) return null;
  const seen = new Set<string>();
  const targets = fuses.flatMap(({ box, numbers }) => numbers.map(number => ({ box, number })))
    .filter(({ box, number }) => {
      if (!guide.slots.some(slot => slot.box === box && slot.number === number && slot.amps !== null)) return false;
      const key = `${box}-${number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!targets.length) return browse ? <ChoiceButton compacto icono="fuse" texto="Ver fusibles por circuito"
    deshabilitado={disabled} onPress={() => router.push({ pathname: '/fusibles', params: { vehicleId } })} /> : null;
  return (
    <View style={styles.list}>
      {targets.map(({ box, number }) => (
          <ChoiceButton
            compacto
            key={`${box}-${number}`}
            icono="fuse"
            texto={`Ver fusible ${number} · ${boxName(guide, box)}`}
            deshabilitado={disabled}
            onPress={() => router.push(fuseRoute(vehicleId, box, number))}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: espacio.s, marginTop: espacio.m },
});
