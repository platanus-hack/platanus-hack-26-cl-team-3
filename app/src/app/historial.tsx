import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { list, open } from '../chat/history';
import type { ConversationSummary } from '../chat/remote-history';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono } from '../ui';

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PantallaHistorial() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    void list().then((r) => (r ? setItems(r) : setFallo(true)));
  }, []);

  const abrir = async (id: string) => {
    if (abriendo) return;
    setAbriendo(true);
    try {
      if (await open(id)) router.back();
      else setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <View style={styles.raiz}>
      <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.titulo}>Conversaciones anteriores</Text>
      </View>
      {fallo ? (
        <Text style={[tipo.nota, styles.aviso]}>No se pudo cargar el historial. Revisa tu conexión.</Text>
      ) : items === null ? (
        <ActivityIndicator style={styles.aviso} color={color.acento} />
      ) : items.length === 0 ? (
        <Text style={[tipo.nota, styles.aviso]}>Todavía no hay conversaciones guardadas en este celular.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + espacio.xl }]}
          renderItem={({ item }) => (
            <Pressable onPress={() => void abrir(item.id)} accessibilityRole="button" style={styles.fila}>
              <Text style={styles.filaTitulo} numberOfLines={2}>{item.title ?? 'Sin título'}</Text>
              <Text style={tipo.nota}>{fecha(item.updated_at)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
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
  aviso: { margin: espacio.l },
  contenido: { padding: espacio.l, gap: espacio.s },
  fila: {
    gap: espacio.xs,
    padding: espacio.m,
    borderRadius: radio.m,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
  },
  filaTitulo: { fontSize: 16, fontWeight: '600', color: color.texto },
});
