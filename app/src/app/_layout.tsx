import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProveedorAviso, useAviso } from '../aviso';
import { PantallaAviso } from '../PantallaAviso';
import { VehicleSelection } from '../plates/selection';
import { color } from '../theme';

export default function Layout() {
  return (
    <SafeAreaProvider>
      <ProveedorAviso>
        <StatusBar style="light" />
        <View style={styles.raiz}>
          <VehicleSelection>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.fondo },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="aviso" options={{ animation: 'slide_from_bottom' }} />
            </Stack>
          </VehicleSelection>
          <AvisoPrimerUso />
        </View>
      </ProveedorAviso>
    </SafeAreaProvider>
  );
}

/** Tapa toda la app hasta que se acepta el aviso (README, regla 1). */
function AvisoPrimerUso() {
  const { cargado, aceptado, aceptar } = useAviso();
  if (cargado && aceptado) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {cargado ? <PantallaAviso primerUso onListo={aceptar} /> : <View style={styles.raiz} />}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
});
