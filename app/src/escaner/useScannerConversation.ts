import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { parts, type PartId } from '../engine-maps/catalog';
import type { useCameraGuide } from './CameraGuide';

export function useScannerConversation(initialLive: boolean, foreground: boolean, guide: ReturnType<typeof useCameraGuide>, vehicleId?: string, selected?: PartId) {
  const [enabled, setEnabled] = useState(initialLive);
  const focused = useIsFocused();
  const toggle = () => {
    guide.resetCaption();
    setEnabled(value => !value);
  };
  const ask = async (text: string, image: string | null, signal: AbortSignal) => {
    if (signal.aborted) return;
    const question = selected ? `Pieza seleccionada: ${parts[selected][0]}.\n${text}` : text;
    return guide.ask(question, false, { image: image ?? undefined, mode: 'vivo', signal, vehicleId });
  };
  return { enabled, listening: enabled && focused && foreground, toggle, ask };
}
