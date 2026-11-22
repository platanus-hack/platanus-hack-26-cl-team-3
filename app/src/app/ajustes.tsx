import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cargarAjustes, ESFUERZOS, guardarAjustes, MODELOS, type Ajustes } from '../ajustes';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Icono } from '../ui';

function Opcion({ nombre, nota, activa, onPress }: { nombre: string; nota?: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      style={[styles.opcion, activa && styles.opcionActiva]}
    >
      <View style={styles.flex}>
        <Text style={styles.opcionNombre}>{nombre}</Text>
        {nota && <Text style={tipo.nota}>{nota}</Text>}
      </View>
      <Icono nombre={activa ? 'radiobox-marked' : 'radiobox-blank'} tono={activa ? color.acento : color.textoTenue} />
    </Pressable>
  );
}

export default function PantallaAjustes() {
  const insets = useSafeAreaInsets();
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);

  useEffect(() => {
    void cargarAjustes().then(setAjustes);
  }, []);

  const cambiar = (parcial: Partial<Ajustes>) => {
    if (!ajustes) return;
    const siguiente = { ...ajustes, ...parcial };
    setAjustes(siguiente);
    void guardarAjustes(siguiente);
  };

  return (
    <View style={styles.raiz}>
      <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.titulo}>Ajustes del asistente</Text>
      </View>
      {ajustes && (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + espacio.xl }]}>
          <Text style={tipo.seccion}>Modelo</Text>
          {MODELOS.map((m) => (
            <Opcion key={m.id} nombre={m.nombre} nota={m.nota} activa={ajustes.modelo === m.id} onPress={() => cambiar({ modelo: m.id })} />
          ))}

          <Text style={[tipo.seccion, styles.separado]}>Esfuerzo</Text>
          <Opcion nombre="Según el modelo" activa={ajustes.esfuerzo === null} onPress={() => cambiar({ esfuerzo: null })} />
          {ESFUERZOS.map((e) => (
            <Opcion key={e.id} nombre={e.nombre} activa={ajustes.esfuerzo === e.id} onPress={() => cambiar({ esfuerzo: e.id })} />
          ))}
          <Text style={tipo.nota}>Más esfuerzo piensa más antes de responder: respuestas más cuidadas, pero más lentas y caras.</Text>

          <Text style={[tipo.seccion, styles.separado]}>Anclaje con el modelo</Text>
          <View style={styles.opcion}>
            <Text style={[tipo.nota, styles.flex]}>
              Al fijar el mapa, Sonnet 5.5 ubica las piezas en la foto del vano. Al servidor va solo el recorte del vano.
            </Text>
            <Switch
              value={ajustes.anclajeConModelo}
              onValueChange={(v) => cambiar({ anclajeConModelo: v })}
              accessibilityLabel="Anclaje con el modelo"
              trackColor={{ true: color.acento, false: color.borde }}
            />
          </View>

          <Text style={[tipo.seccion, styles.separado]}>Voz del asistente</Text>
          <View style={styles.opcion}>
            <Text style={[tipo.nota, styles.flex]}>Leer respuestas en el modo vivo (experimental)</Text>
            <Switch
              value={ajustes.vozVivo}
              onValueChange={(v) => cambiar({ vozVivo: v })}
              accessibilityLabel="Leer respuestas en el modo vivo"
              trackColor={{ true: color.acento, false: color.borde }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
  flex: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.m,
    borderBottomWidth: 1,
    borderBottomColor: color.borde,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: color.texto },
  contenido: { padding: espacio.l, gap: espacio.s },
  separado: { marginTop: espacio.l },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    padding: espacio.m,
    borderRadius: radio.m,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
  },
  opcionActiva: { borderColor: color.acento, backgroundColor: color.acentoSuave },
  opcionNombre: { fontSize: 16, fontWeight: '600', color: color.texto },
});
