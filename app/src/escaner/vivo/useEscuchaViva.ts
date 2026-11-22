import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { transcribeAudio } from '../../chat/transcribe';
import { crearVad } from './vad';

export type EstadoEscucha = 'escuchando' | 'oyendo' | 'transcribiendo' | 'silenciado';

const MUESTRA_MS = 100;

const VOZ: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
};

type Opciones = {
  silenciado: boolean;
  onInicio: () => void;
  onFrase: (texto: string) => void;
  onError: (mensaje: string) => void;
};

const DB_SILENCIO = -60;
const DB_VOZ = -10;

const aNivel = (db: number) => Math.min(1, Math.max(0, (db - DB_SILENCIO) / (DB_VOZ - DB_SILENCIO)));

export function useEscuchaViva({ silenciado, onInicio, onFrase, onError }: Opciones): { estado: EstadoEscucha; nivel: number; cerrando: boolean } {
  const recorder = useAudioRecorder(VOZ);
  const medida = useAudioRecorderState(recorder, MUESTRA_MS);
  const [vad] = useState(() => crearVad());
  const [oyendo, setOyendo] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const grabando = useRef(false);
  const ocupado = useRef(false);
  const vivo = useRef(true);
  const silenciadoRef = useRef(silenciado);
  const callbacks = useRef({ onInicio, onFrase, onError });
  silenciadoRef.current = silenciado;
  callbacks.current = { onInicio, onFrase, onError };

  const abrir = useCallback(async () => {
    try {
      const permiso = await AudioModule.requestRecordingPermissionsAsync();
      if (!permiso.granted) return callbacks.current.onError('Necesito permiso de micrófono para escucharte.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      grabando.current = true;
    } catch {
      callbacks.current.onError('No pude abrir el micrófono. Inténtalo de nuevo.');
    }
  }, [recorder]);

  const cerrar = useCallback(async (): Promise<string | null> => {
    if (!grabando.current) return null;
    grabando.current = false;
    try {
      await recorder.stop();
    } catch {
      return null;
    }
    return recorder.uri;
  }, [recorder]);

  const cortar = useCallback(
    async (transcribir: boolean) => {
      if (ocupado.current) return;
      ocupado.current = true;
      const uri = await cerrar();
      if (vivo.current && !silenciadoRef.current) await abrir();
      ocupado.current = false;
      setOyendo(false);
      if (!transcribir) return;
      if (!uri) return callbacks.current.onError('No pude guardar la grabación. Inténtalo de nuevo.');
      setPendientes((n) => n + 1);
      const resultado = await transcribeAudio(uri);
      if (!vivo.current) return;
      setPendientes((n) => n - 1);
      if (!resultado.ok) return callbacks.current.onError(resultado.message);
      if (resultado.text.trim()) callbacks.current.onFrase(resultado.text);
    },
    [abrir, cerrar],
  );

  useEffect(() => {
    if (silenciado) return;
    void abrir();
    return () => {
      void cerrar();
      setOyendo(false);
    };
  }, [silenciado, abrir, cerrar]);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (silenciado || ocupado.current || !medida.isRecording || typeof medida.metering !== 'number') return;
    const evento = vad.push(medida.metering, Date.now());
    if (evento === 'inicio') {
      setOyendo(true);
      callbacks.current.onInicio();
    } else if (evento === 'fin') void cortar(true);
    else if (evento === 'reiniciar') void cortar(false);
  }, [medida, silenciado, vad, cortar]);

  const estado: EstadoEscucha = silenciado ? 'silenciado' : oyendo ? 'oyendo' : pendientes > 0 ? 'transcribiendo' : 'escuchando';
  const nivel = silenciado || typeof medida.metering !== 'number' ? 0 : aNivel(medida.metering);
  return { estado, nivel, cerrando: estado === 'oyendo' && vad.cerrando() };
}
