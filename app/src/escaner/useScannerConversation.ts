import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { useAgentSpeech } from '../chat/AgentSpeech';
import { confirmsGuideStep } from '../chat/guide';
import { clear, conversationVehicle } from '../chat/history';
import { parts, type PartId } from '../engine-maps/catalog';
import type { useCameraGuide } from './CameraGuide';

export function useScannerConversation(initialLive: boolean, foreground: boolean, guide: ReturnType<typeof useCameraGuide>, vehicleId?: string, selected?: PartId) {
  const [enabled, setEnabled] = useState(initialLive);
  const { end, clearError } = useAgentSpeech();
  const focused = useIsFocused();
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const reset = useRef<Promise<boolean> | null>(null);
  const startReset = () => {
    const clearing = vehicleId ? clear(vehicleId) : conversationVehicle().then(id => clear(id || 'outback'));
    reset.current = clearing.then(() => true, () => {
      setError('No se pudo reiniciar la conversación. Toca para reintentar.');
      reset.current = null;
      return false;
    });
    return reset.current;
  };
  const toggle = async () => {
    if (enabled) {
      end();
      setEnabled(false);
      setEnded(true);
      setError('');
      guide.endConversation();
      void startReset();
      return;
    }
    if (ended && !await (reset.current ?? startReset())) return;
    setError('');
    guide.resetCaption();
    setEnabled(true);
  };
  const ask = async (text: string, image: string | null, signal: AbortSignal) => {
    if (signal.aborted) return;
    clearError();
    if (!guide.busy && guide.steps[guide.index + 1] && confirmsGuideStep(text)) {
      guide.done();
      return;
    }
    const question = selected ? `Pieza seleccionada: ${parts[selected][0]}.\n${text}` : text;
    return guide.ask(question, false, { image: image ?? undefined, mode: 'vivo', signal, vehicleId });
  };
  return { enabled, ended, error, listening: enabled && focused && foreground, toggle, ask };
}
