import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlateCamera } from '../plates/PlateCamera';
import { identifiedVehicle, lookupPlate, normalizePlate, type PlateRecord } from '../plates/lookup';
import { useVehicleSelection } from '../plates/selection';
import { color, espacio, radio, tipo } from '../theme';
import { Boton, BotonIcono } from '../ui';
import { useGiroLibre } from '../useGiroLibre';

export default function RecognizeVehicle() {
  const insets = useSafeAreaInsets();
  useGiroLibre(); // la cámara de la patente gira con el teléfono
  const focused = useIsFocused();
  const { setVehicle } = useVehicleSelection();
  const [scanning, setScanning] = useState(true);
  const [plate, setPlate] = useState('');
  const [record, setRecord] = useState<PlateRecord>();
  const [status, setStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const search = useCallback(async (input: string) => {
    Keyboard.dismiss();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const normalized = normalizePlate(input);
    setScanning(false);
    setPlate(normalized);
    setRecord(undefined);
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      setStatus('Escribe los seis caracteres de la patente.');
      return;
    }
    setStatus('Consultando la patente…');
    const timeout = setTimeout(() => {
      if (request.current === controller) {
        controller.abort();
        setStatus('La consulta tardó demasiado. Inténtalo de nuevo.');
      }
    }, 12000);
    try {
      const vehicle = await lookupPlate(normalized, controller.signal);
      if (!controller.signal.aborted) {
        setRecord(vehicle);
        setStatus('');
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof TypeError
        ? 'No se pudo conectar con el registro. Revisa tu conexión.'
        : error instanceof Error ? error.message : 'No se pudo consultar el registro.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }, []);

  function edit(value: string) {
    request.current?.abort();
    request.current = null;
    setScanning(false);
    setRecord(undefined);
    setStatus('');
    setPlate(value.toUpperCase());
  }
  const selected = record && identifiedVehicle(record);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.xl }]}>
      <View style={styles.header}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={tipo.titulo}>Reconocer auto</Text>
      </View>
      {scanning && <>
        <Text style={tipo.cuerpo}>Apunta a una sola patente y mantén el teléfono quieto.</Text>
        {focused && <PlateCamera onRead={search} />}
      </>}
      <View style={styles.card}>
        <Text style={tipo.cuerpo}>Escribir patente a mano</Text>
        <TextInput style={styles.input} accessibilityLabel="Patente" value={plate} placeholder="ABCD12"
          placeholderTextColor={color.textoSuave} autoCapitalize="characters" autoCorrect={false} maxLength={12}
          onFocus={() => setScanning(false)} onChangeText={edit} returnKeyType="search" onSubmitEditing={() => void search(plate)} />
        <Boton texto="Buscar patente" icono="magnify" onPress={() => void search(plate)} />
      </View>
      {!!status && <Text accessibilityLiveRegion="polite" style={tipo.cuerpo}>{status}</Text>}
      {selected && <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={tipo.seccion}>Auto encontrado</Text>
        <Text style={tipo.titulo}>{selected.name}</Text>
        <Text style={tipo.cuerpo}>{[record.plate, record.year].filter(Boolean).join(' · ')}</Text>
        <Boton texto="OK" icono="check" onPress={() => { setVehicle(selected); router.back(); }} />
      </View>}
      {!scanning && <Boton texto="Volver a la cámara" variante="secundario" icono="camera-outline"
        onPress={() => { Keyboard.dismiss(); edit(''); setScanning(true); }} />}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.fondo },
  content: { paddingHorizontal: espacio.xl, gap: espacio.l },
  header: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  card: { backgroundColor: color.superficie, borderColor: color.borde, borderWidth: 1, borderRadius: radio.l, padding: espacio.l, gap: espacio.m },
  input: { color: color.texto, fontSize: 22, letterSpacing: 2, backgroundColor: color.superficieAlta,
    padding: espacio.m, borderWidth: 1, borderColor: color.borde, borderRadius: radio.s },
});
