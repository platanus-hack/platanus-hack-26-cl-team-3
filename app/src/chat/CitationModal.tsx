import { router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { color, espacio, tipo } from '../theme';
import { Boton, Tarjeta } from '../ui';
import { fuseCitationRoute } from './camera';
import type { ViewCitation } from './history';

export function CitationModal({ citation, onClose }: { citation: ViewCitation | null; onClose: () => void }) {
  const route = citation && fuseCitationRoute(citation);
  return (
    <Modal visible={citation !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Tarjeta estilo={styles.modal}>
          <Text style={styles.title}>{citation?.title}</Text>
          <Text style={[tipo.cuerpo, { marginTop: espacio.m }]}>{citation?.cited_text}</Text>
          {route && <Boton texto={route.params.fuse ? 'Ver fusible en el diagrama' : 'Ver caja del habitáculo'}
            onPress={() => { onClose(); router.push(route); }} estilo={{ marginTop: espacio.l }} />}
          <Boton texto="Cerrar" variante="secundario" onPress={onClose} estilo={{ marginTop: espacio.l }} />
        </Tarjeta>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: color.velo, justifyContent: 'center', padding: espacio.xl },
  modal: { backgroundColor: color.superficieAlta },
  title: { fontSize: 15, fontWeight: '700', color: color.texto },
});
