import { Modal, StyleSheet, Text, View } from 'react-native';

import { color, espacio, tipo } from '../theme';
import { Boton, Tarjeta } from '../ui';
import type { ViewCitation } from './history';

export function CitationModal({ citation, onClose }: { citation: ViewCitation | null; onClose: () => void }) {
  return (
    <Modal visible={citation !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Tarjeta estilo={styles.modal}>
          <Text style={styles.title}>{citation?.title}</Text>
          <Text style={[tipo.cuerpo, { marginTop: espacio.m }]}>{citation?.cited_text}</Text>
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
