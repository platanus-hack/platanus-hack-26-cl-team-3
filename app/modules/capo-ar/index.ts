/**
 * Módulo nativo propio (Android, ARCore): vista de cámara AR que ancla el polígono del vano del motor en el espacio.
 * Código nativo en ./android/src/main/java/expo/modules/capoar/.
 */
import type { ComponentType, Ref } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

type ModuloNativo = { disponibilidad(): Promise<string> };
const modulo = requireOptionalNativeModule<ModuloNativo>('CapoAr');

/** Cuadro de la cámara AR, ya derecho, listo para el modelo. */
export type CapturaAR = {
  id: number;
  uri: string;
  ancho: number;
  alto: number;
  grados: number; // giro aplicado a la imagen del sensor (hay que devolverlo en mostrarVista)
  rastreando: boolean; // ARCore seguía el movimiento cuando se tomó (requisito para anclar)
  muestras: number; // distancias medidas por ARCore en ese cuadro (de 49)
  profundidad: boolean; // el teléfono tiene la API de profundidad de ARCore
};

export type ResultadoFijar = {
  esquinas: number;
  metodo: 'profundidad' | 'parcial' | 'distancia-media' | 'estimado';
  muestras: number;
  mapPlaced: boolean;
  distancia: number; // m, mediana de las distancias medidas
};

export type EstadoAR = {
  estado: 'iniciando' | 'instalando' | 'rastreando' | 'sin-rastreo' | 'error';
  detalle: string | null;
  anclado: boolean;
  mapTracking: boolean;
  profundidad: boolean;
};

export type VistaARRef = {
  capturar(): Promise<CapturaAR>;
  /** Vista previa (aún sin anclar): esquinas x0, y0, x1, y1… normalizadas sobre la captura. Lista vacía la borra. */
  mostrarVista(esquinas: number[], bordes: boolean[], grados: number): Promise<void>;
  /** Ancla las esquinas en el espacio usando la pose de la cámara de la captura `id`. */
  fijar(id: number, esquinas: number[], registration: number[], volumes: number[][]): Promise<ResultadoFijar>;
  soltar(): Promise<void>;
};

export type VistaARProps = ViewProps & {
  debug?: boolean;
  selectedPart?: number;
  onPart?: (e: NativeSyntheticEvent<{ index: number }>) => void;
  onEstado?: (e: NativeSyntheticEvent<EstadoAR>) => void;
  ref?: Ref<VistaARRef>;
};

export const VistaAR: ComponentType<VistaARProps> | null = modulo ? requireNativeView<VistaARProps>('CapoAr') : null;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ¿Se puede usar AR en este teléfono? true también si ARCore está soportado pero falta instalar/actualizar
 * (la vista lo pide sola).
 */
export async function arDisponible(): Promise<boolean> {
  if (!modulo) return false;
  for (let i = 0; i < 10; i++) {
    let r: string;
    try {
      r = await modulo.disponibilidad();
    } catch {
      return false;
    }
    if (r.startsWith('SUPPORTED')) return true;
    if (r !== 'UNKNOWN_CHECKING') return false;
    await espera(300);
  }
  return false;
}
