import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, espacio, radio } from '../theme';
import { Icono, type NombreIcono } from '../ui';
import type { ViewCard } from './history';
import { guideSummary } from './guide';

export function ChoiceButton({
  texto,
  icono,
  onPress,
  primario,
  seleccionado,
  deshabilitado,
  expandido,
  compacto,
}: {
  texto: string;
  icono?: NombreIcono;
  onPress: () => void;
  primario?: boolean;
  seleccionado?: boolean;
  deshabilitado?: boolean;
  expandido?: boolean;
  compacto?: boolean;
}) {
  const tono = primario ? color.acentoTexto : color.texto;
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{
        disabled: !!deshabilitado,
        ...(expandido !== undefined ? { expanded: expandido } : {}),
        ...(seleccionado !== undefined ? { selected: seleccionado } : {}),
      }}
      style={({ pressed }) => [
        styles.button,
        compacto && styles.compact,
        primario
          ? { backgroundColor: pressed ? color.acentoPresionado : color.acento }
          : [
              styles.secondary,
              (pressed || seleccionado) && { backgroundColor: color.superficieAlta, borderColor: color.textoTenue },
            ],
        deshabilitado && { opacity: 0.4 },
      ]}
    >
      {icono && <Icono nombre={icono} tam={18} tono={tono} />}
      <Text style={[styles.label, compacto && styles.compactLabel, { color: tono }]} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

export function GuideChoice({
  cards,
  disabled,
  onCamera,
  children,
}: {
  cards: ViewCard[];
  disabled: boolean;
  onCamera: (card: ViewCard, cards: ViewCard[]) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { title, subtitle } = guideSummary(cards);
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle} numberOfLines={2}>
        {subtitle}
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <ChoiceButton
            primario
            icono="video-outline"
            texto="Por video"
            deshabilitado={disabled}
            onPress={() => onCamera(cards[0], cards)}
          />
        </View>
        <View style={styles.flex}>
          <ChoiceButton
            icono="format-list-numbered"
            texto="Por texto"
            deshabilitado={disabled}
            seleccionado={open}
            expandido={open}
            onPress={() => setOpen((value) => !value)}
          />
        </View>
      </View>
      {open && !disabled && <View style={styles.text}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: color.texto },
  subtitle: { fontSize: 13, color: color.textoSuave, marginTop: espacio.xs },
  row: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.m },
  text: { marginTop: espacio.m, paddingTop: espacio.m, borderTopWidth: 1, borderTopColor: color.borde },
  button: {
    minHeight: 46,
    borderRadius: radio.m,
    paddingHorizontal: espacio.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.s,
  },
  compact: { minHeight: 40 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borde },
  label: { fontSize: 15, fontWeight: '700' },
  compactLabel: { fontSize: 14, fontWeight: '600' },
});
