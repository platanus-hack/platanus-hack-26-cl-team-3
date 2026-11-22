import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import photoCredits from '../assets/vehicles/credits.json';
import { AVISO } from './aviso';
import { buildActual } from './buildActual';
import { color, espacio, radio, tipo } from './theme';
import { Boton, Icono, Tarjeta } from './ui';
import { describeBuild } from './version';

/** Aviso obligatorio (primer uso) y página «Aviso y fuentes» (siempre accesible desde el menú). */
export function PantallaAviso({ primerUso, onListo }: { primerUso: boolean; onListo: () => void }) {
  const [showCredits, setShowCredits] = useState(false);
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
        <Punto icono="car-info" texto="El Subaru Outback 2016 3.6R es el auto de pruebas. La posición de las piezas en la cámara es aproximada." />

        <Text style={[tipo.seccion, styles.seccion]}>Créditos</Text>
        <Text style={tipo.nota}>
          Reconocimiento del vano del motor: CLIPSeg de CIDAS (licencia Apache-2.0), basado en CLIP ViT-B/16 de OpenAI
          (licencia MIT), con un decodificador entrenado por el equipo.
        </Text>
        {!primerUso && <View style={styles.seccion}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCredits }} onPress={() => setShowCredits(open => !open)}>
            <Text style={tipo.cuerpo}>Fotografías de los vehículos {showCredits ? '⌃' : '⌄'}</Text>
          </Pressable>
          {showCredits && <>
            <Text style={tipo.nota}>Fotografías de referencia. El año y el equipamiento pueden variar. Imágenes redimensionadas y recortadas sobre fondo transparente.</Text>
            {photoCredits.map(item => <View key={item.id} style={{ marginTop: espacio.m }}>
              <Text accessibilityRole="link" onPress={() => void Linking.openURL(item.source)} style={tipo.cuerpo}>{item.image}</Text>
              <Text accessibilityRole="link" onPress={() => void Linking.openURL(item.licenseUrl)} style={tipo.nota}>{item.author} · {item.license}</Text>
            </View>)}
          </>}
        </View>}
        <Text style={styles.version} selectable>Hoodini · {describeBuild(buildActual())}</Text>
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
  version: { fontSize: 11, color: color.textoTenue, textAlign: 'center', marginTop: espacio.xl },
});
