import { StyleSheet, View } from 'react-native';

import { espacio } from '../theme';
import { ChoiceButton } from './GuideChoice';
import type { ViewFuse } from './history';

const BOX_LABEL = { cabin: 'caja de la cabina', engine: 'caja del motor' } as const;

export function FuseLinks({
  fuses,
  disabled,
  onOpen,
}: {
  fuses: ViewFuse[];
  disabled: boolean;
  onOpen: (box: ViewFuse['box'], number: number) => void;
}) {
  return (
    <View style={styles.list}>
      {fuses.flatMap((fuse) =>
        fuse.numbers.map((number) => (
          <ChoiceButton
            compacto
            key={`${fuse.box}-${number}`}
            icono="fuse"
            texto={`Ver fusible ${number} · ${BOX_LABEL[fuse.box]}`}
            deshabilitado={disabled}
            onPress={() => onOpen(fuse.box, number)}
          />
        )),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: espacio.s, marginTop: espacio.m },
});
