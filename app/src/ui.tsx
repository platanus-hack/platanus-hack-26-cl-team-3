// Componentes comunes. Estilo en src/theme.ts.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, espacio, radio } from './theme';

export type NombreIcono = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icono({ nombre, tam = 24, tono = color.texto }: { nombre: NombreIcono; tam?: number; tono?: string }) {
  return <MaterialCommunityIcons name={nombre} size={tam} color={tono} />;
}

export function Boton({
  texto,
  onPress,
  icono,
  variante = 'primario',
  estilo,
}: {
  texto: string;
  onPress: () => void;
  icono?: NombreIcono;
  variante?: 'primario' | 'secundario';
  estilo?: StyleProp<ViewStyle>;
}) {
  const primario = variante === 'primario';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.boton,
        primario ? styles.botonPrimario : styles.botonSecundario,
        pressed && { opacity: 0.8 },
        estilo,
      ]}
    >
      {icono && <Icono nombre={icono} tam={20} tono={primario ? color.acentoTexto : color.texto} />}
      <Text style={[styles.botonTexto, { color: primario ? color.acentoTexto : color.texto }]}>{texto}</Text>
    </Pressable>
  );
}

export function BotonIcono({ icono, onPress, etiqueta }: { icono: NombreIcono; onPress: () => void; etiqueta: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={8}
      style={({ pressed }) => [styles.botonIcono, pressed && { opacity: 0.7 }]}
    >
      <Icono nombre={icono} tam={22} />
    </Pressable>
  );
}

export function Insignia({ texto, tono = color.textoSuave, fondo = color.superficieAlta }: { texto: string; tono?: string; fondo?: string }) {
  return (
    <View style={[styles.insignia, { backgroundColor: fondo }]}>
      <Text style={[styles.insigniaTexto, { color: tono }]}>{texto}</Text>
    </View>
  );
}

export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: StyleProp<ViewStyle> }) {
  return <View style={[styles.tarjeta, estilo]}>{children}</View>;
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.s,
    paddingVertical: 15,
    paddingHorizontal: espacio.xl,
    borderRadius: radio.m,
  },
  botonPrimario: { backgroundColor: color.acento },
  botonSecundario: { backgroundColor: color.superficieAlta, borderWidth: 1, borderColor: color.borde },
  botonTexto: { fontSize: 16, fontWeight: '700' },
  botonIcono: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 27, 34, 0.85)',
    borderWidth: 1,
    borderColor: color.borde,
  },
  insignia: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  insigniaTexto: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  tarjeta: {
    backgroundColor: color.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: color.borde,
    padding: espacio.l,
  },
});
