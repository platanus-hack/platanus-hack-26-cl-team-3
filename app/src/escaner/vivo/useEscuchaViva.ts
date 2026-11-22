import { AudioModule, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pedirTokenRealtime } from '../../chat/transcribe';
import { aBase64, dbDe, leerMensaje, urlRealtime, type MensajeRealtime } from './realtime';
import { crearVad } from './vad';

export type EstadoEscucha = 'escuchando' | 'oyendo' | 'transcribiendo' | 'silenciado';

const TASA = 16000;
const NIVEL_MS = 100;
const ESPERAS_MS = [1000, 2000, 5000];
const TRANSCRIBIENDO_MAX_MS = 4000;
const COLA_MAX = 30;
const ERRORES_SILENCIOSOS = new Set(['insufficient_audio_activity', 'session_time_limit_exceeded']);

const DB_SILENCIO = -60;
const DB_VOZ = -10;

const aNivel = (db: number) => Math.min(1, Math.max(0, (db - DB_SILENCIO) / (DB_VOZ - DB_SILENCIO)));

type Opciones = {
  silenciado: boolean;
  onInicio: () => void;
  onFrase: (texto: string) => void;
  onError: (mensaje: string) => void;
};

export function useEscuchaViva({ silenciado, onInicio, onFrase, onError }: Opciones): {
  estado: EstadoEscucha;
  nivel: number;
  cerrando: boolean;
  parcial: string;
} {
  const alBuffer = useRef<(buffer: AudioStreamBuffer) => void>(undefined);
  const { stream } = useAudioStream({
    sampleRate: TASA,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => alBuffer.current?.(buffer),
  });
  const [vad] = useState(() => crearVad());
  const [oyendo, setOyendo] = useState(false);
  const [huboVoz, setHuboVoz] = useState(false);
  const [parcial, setParcial] = useState('');
  const [nivel, setNivel] = useState(0);
  const huboVozRef = useRef(false);
  const oyendoRef = useRef(false);
  const callbacks = useRef({ onInicio, onFrase, onError });
  callbacks.current = { onInicio, onFrase, onError };

  const marcarVoz = useCallback((valor: boolean) => {
    huboVozRef.current = valor;
    setHuboVoz(valor);
  }, []);

  useEffect(() => {
    if (silenciado) return;
    let cancelado = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intento = 0;
    let tasa = 0;
    let conectando = false;
    let abierto = false;
    let errorServidor = '';
    let cola: string[] = [];
    let acumulado: Uint8Array[] = [];
    let acumuladoBytes = 0;
    let ultimoNivel = 0;

    const enviar = (ws: WebSocket, audio: string) =>
      ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: audio, commit: false, sample_rate: tasa }));

    const reconectar = (mensaje: string) => {
      if (cancelado) return;
      if (mensaje) callbacks.current.onError(mensaje);
      const espera = ESPERAS_MS[Math.min(intento, ESPERAS_MS.length - 1)];
      intento += 1;
      clearTimeout(timer);
      timer = setTimeout(() => void conectar(), espera);
    };

    const manejar = (mensaje: MensajeRealtime | null) => {
      if (!mensaje) return;
      if (mensaje.tipo === 'sesion') intento = 0;
      else if (mensaje.tipo === 'parcial') {
        if (huboVozRef.current) setParcial(mensaje.texto);
      } else if (mensaje.tipo === 'final') {
        const texto = mensaje.texto.trim();
        if (huboVozRef.current && texto) callbacks.current.onFrase(texto);
        setParcial('');
        marcarVoz(oyendoRef.current);
      } else if (mensaje.tipo === 'error') errorServidor = mensaje.codigo;
    };

    const conectar = async () => {
      if (cancelado || conectando || !tasa) return;
      conectando = true;
      const token = await pedirTokenRealtime();
      conectando = false;
      if (cancelado) return;
      if (!token.ok) return reconectar(token.message);
      const url = urlRealtime(token.token, tasa);
      if (!url) return callbacks.current.onError('Tu micrófono usa una frecuencia que no puedo transcribir.');
      const ws = new WebSocket(url);
      socket = ws;
      abierto = false;
      errorServidor = '';
      ws.onopen = () => {
        if (socket !== ws) return;
        abierto = true;
        for (const audio of cola) enviar(ws, audio);
        cola = [];
      };
      ws.onmessage = (evento) => {
        if (socket === ws) manejar(leerMensaje(String(evento.data)));
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        abierto = false;
        reconectar(ERRORES_SILENCIOSOS.has(errorServidor) ? '' : 'No pude conectar la escucha en vivo. Reintentando…');
      };
    };

    const mandarAudio = (bytes: Uint8Array) => {
      acumulado.push(bytes);
      acumuladoBytes += bytes.length;
      if (acumuladoBytes < (tasa / 10) * 2) return;
      const junto = new Uint8Array(acumuladoBytes);
      let desde = 0;
      for (const parte of acumulado) {
        junto.set(parte, desde);
        desde += parte.length;
      }
      acumulado = [];
      acumuladoBytes = 0;
      const audio = aBase64(junto);
      if (socket && abierto) enviar(socket, audio);
      else if (socket || conectando) {
        cola.push(audio);
        if (cola.length > COLA_MAX) cola.shift();
      }
    };

    alBuffer.current = (buffer) => {
      if (cancelado) return;
      if (!tasa) {
        tasa = buffer.sampleRate;
        void conectar();
      }
      const bytes = new Uint8Array(buffer.data);
      const db = dbDe(new Int16Array(buffer.data, 0, bytes.length >> 1));
      const ahora = Date.now();
      const evento = vad.push(db, ahora);
      if (evento === 'inicio') {
        oyendoRef.current = true;
        setOyendo(true);
        marcarVoz(true);
        callbacks.current.onInicio();
      } else if (evento === 'fin') {
        oyendoRef.current = false;
        setOyendo(false);
      }
      if (ahora - ultimoNivel >= NIVEL_MS) {
        ultimoNivel = ahora;
        setNivel(aNivel(db));
      }
      mandarAudio(bytes);
    };

    void (async () => {
      try {
        const permiso = await AudioModule.requestRecordingPermissionsAsync();
        if (cancelado) return;
        if (!permiso.granted) return callbacks.current.onError('Necesito permiso de micrófono para escucharte.');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (cancelado) return;
        await stream.start();
      } catch {
        if (!cancelado) callbacks.current.onError('No pude abrir el micrófono. Inténtalo de nuevo.');
      }
    })();

    return () => {
      cancelado = true;
      alBuffer.current = undefined;
      clearTimeout(timer);
      const ws = socket;
      socket = null;
      ws?.close();
      try {
        stream.stop();
      } catch {}
      oyendoRef.current = false;
      setOyendo(false);
      setParcial('');
      setNivel(0);
      marcarVoz(false);
    };
  }, [silenciado, stream, vad, marcarVoz]);

  const transcribiendo = !silenciado && !oyendo && huboVoz;

  useEffect(() => {
    if (!transcribiendo) return;
    const timer = setTimeout(() => {
      marcarVoz(false);
      setParcial('');
    }, TRANSCRIBIENDO_MAX_MS);
    return () => clearTimeout(timer);
  }, [transcribiendo, marcarVoz]);

  const estado: EstadoEscucha = silenciado ? 'silenciado' : oyendo ? 'oyendo' : transcribiendo ? 'transcribiendo' : 'escuchando';
  return {
    estado,
    nivel: silenciado ? 0 : nivel,
    cerrando: estado === 'oyendo' && vad.cerrando(),
    parcial: silenciado ? '' : parcial,
  };
}
