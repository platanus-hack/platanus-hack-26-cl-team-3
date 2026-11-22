import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cargarAjustes, type VozId } from '../ajustes';
import { API_URL, CHAT_TOKEN } from './client';
import { fuenteVoz } from './voz';

const COLA_PRECARGA = 1;
const COLA_FIN_MS = 300;
const LIMITE_BASE_MS = 8000;
const LIMITE_POR_CARACTER_MS = 120;

const limiteFraseMs = (frase: string) => LIMITE_BASE_MS + frase.length * LIMITE_POR_CARACTER_MS;

type Reproductor = { player: AudioPlayer; frase: string; soltar: () => void };

export function useVoz() {
  const [phrase, setPhrase] = useState('');
  const cola = useRef<string[]>([]);
  const actual = useRef<Reproductor | null>(null);
  const precargados = useRef<Reproductor[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const vigilante = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const voz = useRef<VozId>('jorge');
  const avanzarRef = useRef<() => void>(() => {});

  const crear = useCallback((frase: string): Reproductor | null => {
    try {
      const player = createAudioPlayer(fuenteVoz(frase, { apiUrl: API_URL, token: CHAT_TOKEN, voz: voz.current }));
      const suscripcion = player.addListener('playbackStatusUpdate', (estado) => {
        if (!estado.didJustFinish && !estado.error) return;
        if (actual.current?.player !== player) return;
        clearTimeout(vigilante.current);
        reproductor.soltar();
        actual.current = null;
        avanzarRef.current();
      });
      const reproductor: Reproductor = {
        player,
        frase,
        soltar: () => {
          suscripcion.remove();
          try {
            player.remove();
          } catch {}
        },
      };
      return reproductor;
    } catch {
      return null;
    }
  }, []);

  const precargar = useCallback(() => {
    while (precargados.current.length < COLA_PRECARGA && cola.current.length > 0) {
      const frase = cola.current.shift()!;
      const reproductor = crear(frase);
      if (reproductor) precargados.current.push(reproductor);
    }
  }, [crear]);

  const avanzar = useCallback(() => {
    if (actual.current) return;
    precargar();
    const siguiente = precargados.current.shift();
    if (!siguiente) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhrase(''), COLA_FIN_MS);
      return;
    }
    clearTimeout(timer.current);
    if (siguiente.player.currentStatus?.error) {
      siguiente.soltar();
      avanzarRef.current();
      return;
    }
    actual.current = siguiente;
    setPhrase(siguiente.frase);
    try {
      siguiente.player.play();
    } catch {
      siguiente.soltar();
      actual.current = null;
      avanzarRef.current();
      return;
    }
    clearTimeout(vigilante.current);
    vigilante.current = setTimeout(() => {
      if (actual.current !== siguiente) return;
      siguiente.soltar();
      actual.current = null;
      avanzarRef.current();
    }, limiteFraseMs(siguiente.frase));
    precargar();
  }, [precargar]);

  useEffect(() => {
    void cargarAjustes().then((a) => {
      voz.current = a.voz;
    });
  }, []);

  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  const decir = useCallback(
    (frases: string[]) => {
      if (frases.length === 0) return;
      cola.current.push(...frases);
      avanzar();
      precargar();
    },
    [avanzar, precargar],
  );

  const callar = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(vigilante.current);
    cola.current = [];
    const todos = [actual.current, ...precargados.current];
    actual.current = null;
    precargados.current = [];
    for (const r of todos) {
      if (!r) continue;
      try {
        r.player.pause();
      } catch {}
      r.soltar();
    }
    setPhrase('');
  }, []);

  useEffect(() => callar, [callar]);

  return { hablando: !!phrase, phrase, decir, callar };
}
