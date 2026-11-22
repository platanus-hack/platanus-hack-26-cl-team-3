import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useVoz } from './useVoz';

function useAgentPlayback() {
  const player = useVoz();
  const { callar, decir } = player;
  const request = useRef<AbortController | null>(null);
  const transferring = useRef(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const [pending, setPending] = useState(false);
  const stop = useCallback(() => {
    generation.current++;
    callar();
  }, [callar]);

  const handoff = useCallback(() => {
    transferring.current = true;
    setError('');
  }, []);
  const end = useCallback(() => {
    transferring.current = false;
    request.current?.abort();
    request.current = null;
    setPending(false);
    setError('');
    stop();
  }, [stop]);
  const begin = useCallback(() => {
    end();
    const controller = new AbortController();
    request.current = controller;
    const id = generation.current;
    setPending(true);
    return {
      signal: controller.signal,
      speak: (sentences: string[]) => { if (generation.current === id) decir(sentences); },
      finish: (message?: string) => {
        if (request.current !== controller) return;
        request.current = null;
        setPending(false);
        if (transferring.current && message) setError(message);
      },
    };
  }, [decir, end]);

  const path = usePathname();
  useEffect(() => {
    if (path === '/escanear') return () => {
      transferring.current = false;
      setError('');
    };
  }, [path]);
  const inConversation = path === '/ask' || path === '/escanear';
  useEffect(() => {
    if (inConversation) return stop;
  }, [inConversation, stop]);
  return { ...player, pending, stop, begin, end, handoff, error, clearError: () => setError('') };
}

const SpeechContext = createContext<ReturnType<typeof useAgentPlayback> | null>(null);

export function AgentSpeechProvider({ children }: { children: ReactNode }) {
  const speech = useAgentPlayback();
  return <SpeechContext.Provider value={speech}>{children}</SpeechContext.Provider>;
}

export function useAgentSpeech() {
  const speech = useContext(SpeechContext);
  if (!speech) throw new Error('AgentSpeechProvider is required');
  return speech;
}
