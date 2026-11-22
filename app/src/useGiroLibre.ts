import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback } from 'react';

/**
 * Mientras la pantalla de cámara está enfocada, deja girar la interfaz con el teléfono en vertical y horizontal, aunque
 * el giro automático del sistema esté apagado (como hace la app de cámara). Al salir devuelve el comportamiento normal
 * (el menú y el chat respetan el bloqueo de giro del usuario).
 *
 * El escáner AR no lo usa: su vista nativa pide la orientación por su cuenta.
 */
export function useGiroLibre() {
  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL).catch(() => {});
      return () => {
        void ScreenOrientation.unlockAsync().catch(() => {});
      };
    }, []),
  );
}
