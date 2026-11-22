import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { color } from '../theme';
import { Icono } from '../ui';
import { createMicrophonePermission, microphoneError } from './microphone-permission';
import { transcribeAudio } from './transcribe';

type Estado = 'idle' | 'grabando' | 'transcribiendo';

const MAX_SEGUNDOS = 60;

const VOZ: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 48000 };

export function Dictado({
  deshabilitado,
  onTexto,
  onError,
  onEmpezar,
}: {
  deshabilitado: boolean;
  onEmpezar?: () => void;
  onTexto: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useAudioRecorder(VOZ);
  const [estado, setEstado] = useState<Estado>('idle');
  const [segundos, setSegundos] = useState(0);
  const starting = useRef(false);
  const grabando = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const desmontado = useRef(false);

  const limpiarTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const parar = useCallback(async () => {
    if (!grabando.current) return;
    grabando.current = false;
    limpiarTimer();
    try {
      await recorder.stop();
    } catch {
      if (!desmontado.current) {
        setEstado('idle');
        onError('No pude guardar la grabación. Inténtalo de nuevo.');
      }
      return;
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (desmontado.current) return;
    if (!uri) {
      setEstado('idle');
      onError('No pude guardar la grabación. Inténtalo de nuevo.');
      return;
    }
    setEstado('transcribiendo');
    const result = await transcribeAudio(uri);
    if (desmontado.current) return;
    setEstado('idle');
    if (result.ok) onTexto(result.text);
    else onError(result.message);
  }, [recorder, onTexto, onError]);

  const empezar = useCallback(async () => {
    if (starting.current || grabando.current) return;
    starting.current = true;
    onEmpezar?.();
    onError('');
    try {
      const permission = await createMicrophonePermission(
        () => AudioModule.getRecordingPermissionsAsync(),
        () => AudioModule.requestRecordingPermissionsAsync(),
      )(() => !desmontado.current);
      if (desmontado.current) return;
      if (!permission.granted) {
        onError(microphoneError(permission));
        if (!permission.canAskAgain) Alert.alert('Permiso de micrófono', 'Activa el micrófono en los ajustes de la aplicación para dictar.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings().catch(() => {}); } },
        ]);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (desmontado.current) return;
      await recorder.prepareToRecordAsync();
      if (desmontado.current) {
        await recorder.stop();
        return;
      }
      recorder.record();
    } catch {
      if (!desmontado.current) onError('No pude empezar a grabar. Inténtalo de nuevo.');
      return;
    } finally {
      starting.current = false;
    }
    grabando.current = true;
    setSegundos(0);
    setEstado('grabando');
    timer.current = setInterval(() => {
      setSegundos((s) => s + 1);
    }, 1000);
  }, [recorder, onError, onEmpezar]);

  const stopAtLimit = useEffectEvent(() => { void parar(); });
  useEffect(() => {
    if (estado !== 'grabando') return;
    const limit = setTimeout(stopAtLimit, MAX_SEGUNDOS * 1000);
    return () => clearTimeout(limit);
  }, [estado]);

  useEffect(() => {
    desmontado.current = false;
    return () => {
      desmontado.current = true;
      limpiarTimer();
      if (grabando.current) {
        grabando.current = false;
        void recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  const alToque = () => {
    if (estado === 'idle') void empezar();
    else if (estado === 'grabando') void parar();
  };
  const inactivo = estado === 'transcribiendo' || (deshabilitado && estado === 'idle');

  return (
    <Pressable
      onPress={alToque}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={estado === 'grabando' ? 'Detener dictado' : 'Dictar pregunta'}
      style={[styles.boton, estado === 'grabando' && styles.grabando, inactivo && { opacity: 0.4 }]}
    >
      {estado === 'transcribiendo' ? (
        <ActivityIndicator color={color.texto} />
      ) : estado === 'grabando' ? (
        <Text style={styles.segundos}>{segundos}s</Text>
      ) : (
        <Icono nombre="microphone" tam={22} tono={color.textoSuave} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabando: { backgroundColor: color.peligro },
  segundos: { fontSize: 13, fontWeight: '800', color: color.acentoTexto },
});
