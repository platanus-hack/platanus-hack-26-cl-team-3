import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Texto validado con el equipo (README, sección 9, regla 1). No cambiar sin acordarlo.
const AVISO =
  'Esta app es una guía informativa. No reemplaza el manual del propietario ni a un mecánico. ' +
  'Confirma siempre con el manual de tu vehículo antes de actuar.';

export default function App() {
  const [avisoVisible, setAvisoVisible] = useState(true);
  const [permiso, pedirPermiso] = useCameraPermissions();

  return (
    <View style={styles.raiz}>
      <StatusBar style="light" />
      {!avisoVisible && <Contenido permiso={permiso} pedirPermiso={pedirPermiso} />}

      {!avisoVisible && (
        <View style={styles.barraSuperior} pointerEvents="box-none">
          <Text style={styles.titulo}>Capo AR</Text>
          <Pressable
            onPress={() => setAvisoVisible(true)}
            style={styles.botonInfo}
            accessibilityRole="button"
            accessibilityLabel="Ver aviso"
          >
            <Text style={styles.botonInfoTexto}>i</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={avisoVisible} transparent animationType="fade" onRequestClose={() => setAvisoVisible(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.tarjeta}>
            <Text style={styles.tarjetaTitulo}>Aviso</Text>
            <Text style={styles.tarjetaTexto}>{AVISO}</Text>
            <Pressable onPress={() => setAvisoVisible(false)} style={styles.boton} accessibilityRole="button">
              <Text style={styles.botonTexto}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type PropsContenido = {
  permiso: ReturnType<typeof useCameraPermissions>[0];
  pedirPermiso: ReturnType<typeof useCameraPermissions>[1];
};

function Contenido({ permiso, pedirPermiso }: PropsContenido) {
  if (!permiso) {
    return <View style={styles.centro} />;
  }

  if (!permiso.granted) {
    const puedePreguntar = permiso.canAskAgain;
    return (
      <View style={styles.centro}>
        <Text style={styles.mensaje}>Capo AR necesita la cámara para mostrar las piezas de tu auto.</Text>
        <Pressable
          onPress={puedePreguntar ? pedirPermiso : () => Linking.openSettings()}
          style={styles.boton}
          accessibilityRole="button"
        >
          <Text style={styles.botonTexto}>{puedePreguntar ? 'Permitir cámara' : 'Abrir ajustes'}</Text>
        </Pressable>
        {!puedePreguntar && (
          <Text style={styles.nota}>El permiso fue denegado. Actívalo en los ajustes de la app.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.raiz}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.pista} pointerEvents="none">
        <Text style={styles.pistaTexto}>Apunta la cámara al capó abierto</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000' },
  mensaje: { color: '#fff', fontSize: 17, textAlign: 'center', marginBottom: 20, lineHeight: 24 },
  nota: { color: '#bbb', fontSize: 14, textAlign: 'center', marginTop: 16 },
  barraSuperior: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '700' },
  botonInfo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonInfoTexto: { color: '#fff', fontSize: 18, fontWeight: '700', fontStyle: 'italic' },
  pista: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pistaTexto: { color: '#fff', fontSize: 15 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  tarjeta: { backgroundColor: '#1c1c1e', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 },
  tarjetaTitulo: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  tarjetaTexto: { color: '#e5e5e5', fontSize: 16, lineHeight: 23, marginBottom: 20 },
  boton: { backgroundColor: '#ffb300', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  botonTexto: { color: '#000', fontSize: 16, fontWeight: '700' },
});
