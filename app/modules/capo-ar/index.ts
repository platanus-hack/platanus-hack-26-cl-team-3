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
  muestras: number; // Available hit-test distances, including frames that also have a depth image
  profundidad: boolean; // el teléfono tiene la API de profundidad de ARCore
  puntos: number; // puntos válidos del mapa de profundidad completo de ese cuadro (0 si aún no hay)
  registrationMeasurements: boolean; // Enough dense pixels or local hits to attempt map placement
  /** Solo con el contorno ya anclado: sus esquinas proyectadas a esta captura (x0, y0, x1, y1… normalizadas). */
  anclas?: number[];
};

export type ResultadoFijar = {
  esquinas: number;
  /**
   * Dense placement uses a fitted plane or local relief. The part map can also use distributed hit tests.
   * Generic contours retain their existing distance fallbacks.
   */
  metodo: 'plano' | 'relieve' | 'hit-test' | 'profundidad' | 'parcial' | 'distancia-media' | 'estimado';
  muestras: number; // puntos de profundidad usados
  mapPlaced: boolean; // el mapa de piezas del vehículo quedó ubicado
  distancia: number; // m, mediana de las distancias medidas
  // Solo con mapa de profundidad:
  puntos?: number; // puntos de profundidad dentro del contorno
  plano?: number; // fracción de esos puntos que cae sobre el plano dominante (1 = totalmente plano)
  rms?: number; // m, dispersión respecto del plano
  inclinacion?: number; // grados: 0 = superficie horizontal, 90 = vertical (una pantalla)
  anguloVista?: number; // grados: 0 = se mira de frente
};

export type EstadoAR = {
  estado: 'iniciando' | 'instalando' | 'rastreando' | 'sin-rastreo' | 'error';
  detalle: string | null;
  anclado: boolean;
  mapTracking: boolean;
  profundidad: boolean;
};

export type VistaARRef = {
  capturar(includeMeasurements?: boolean): Promise<CapturaAR>;
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
