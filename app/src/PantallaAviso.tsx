import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AVISO } from './aviso';
import { color, espacio, radio, tipo } from './theme';
import { Boton, Icono, Tarjeta } from './ui';

/** Aviso obligatorio (primer uso) y página «Aviso y fuentes» (siempre accesible desde el menú). */
export function PantallaAviso({ primerUso, onListo }: { primerUso: boolean; onListo: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.raiz, { paddingTop: insets.top + espacio.xl, paddingBottom: insets.bottom + espacio.l }]}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={styles.iconoCaja}>
          <Icono nombre="shield-alert-outline" tam={36} tono={color.acento} />
        </View>
        <Text style={tipo.titulo}>{primerUso ? 'Antes de empezar' : 'Aviso y fuentes'}</Text>

        <Tarjeta estilo={styles.avisoTarjeta}>
          <Text style={styles.avisoTexto}>{AVISO}</Text>
        </Tarjeta>

        <Text style={[tipo.seccion, styles.seccion]}>Cómo funciona</Text>
        <Punto icono="camera-iris" texto="El reconocimiento del capó corre en tu teléfono. Las imágenes de la cámara no salen del dispositivo." />
        <Punto icono="book-open-variant" texto="Cuando la app responda preguntas, cada respuesta citará el manual del propietario: documento, sección y página. Sin fuente, no se afirma." />
        <Punto icono="car-info" texto="Por ahora, solo para Subaru Outback 2016 3.6R. Los datos de otros modelos no se asumen iguales." />

        <Text style={[tipo.seccion, styles.seccion]}>Créditos</Text>
        <Text style={tipo.nota}>
          Reconocimiento: modelo CLIP ViT-B/32 de OpenAI (licencia MIT), versión ONNX de Xenova.
        </Text>
      </ScrollView>
      <Boton texto={primerUso ? 'Entendido, continuar' : 'Cerrar'} onPress={onListo} estilo={styles.boton} />
    </View>
  );
}

function Punto({ icono, texto }: { icono: 'camera-iris' | 'book-open-variant' | 'car-info'; texto: string }) {
  return (
    <View style={styles.punto}>
      <Icono nombre={icono} tam={20} tono={color.textoSuave} />
      <Text style={[tipo.nota, styles.puntoTexto]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo, paddingHorizontal: espacio.xl },
  contenido: { paddingBottom: espacio.xl },
  iconoCaja: {
    width: 64,
    height: 64,
    borderRadius: radio.l,
    backgroundColor: color.acentoSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacio.l,
  },
  avisoTarjeta: { marginTop: espacio.l, borderColor: color.acento, backgroundColor: color.acentoSuave },
  avisoTexto: { ...tipo.cuerpo, fontSize: 16, lineHeight: 24 },
  seccion: { marginTop: espacio.xl, marginBottom: espacio.m },
  punto: { flexDirection: 'row', gap: espacio.m, marginBottom: espacio.m, alignItems: 'flex-start' },
  puntoTexto: { flex: 1 },
  boton: { marginTop: espacio.m },
});
