import { useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAviso } from './aviso';

export function useScannerPermission(enabled = true) {
  const camera = useCameraPermissions();
  const [permission, requestPermission] = camera;
  const { aceptado: accepted } = useAviso();
  const focused = useIsFocused();
  const requested = useRef(false);
  useEffect(() => {
    if (!enabled || !accepted || !focused || requested.current || permission?.status !== 'undetermined') return;
    requested.current = true;
    void requestPermission().catch(() => { /* The permission screen allows a manual retry. */ });
  }, [accepted, enabled, focused, permission?.status, requestPermission]);
  return camera;
}
