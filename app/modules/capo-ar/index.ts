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
  muestras: number; // respaldo: distancias de la grilla de 49 hit tests (0 si hubo mapa de profundidad)
  profundidad: boolean; // el teléfono tiene la API de profundidad de ARCore
  puntos: number; // puntos válidos del mapa de profundidad completo de ese cuadro (0 si aún no hay)
  /** Solo con el contorno ya anclado: sus esquinas proyectadas a esta captura (x0, y0, x1, y1… normalizadas). */
  anclas?: number[];
};

export type ResultadoFijar = {
  esquinas: number;
  /**
   * Con mapa de profundidad: 'plano' (superficie plana: esquinas sobre el plano ajustado) o 'relieve' (cada esquina
   * con su profundidad local). Respaldo con 49 hit tests: 'profundidad' | 'parcial' | 'distancia-media' | 'estimado'.
   */
  metodo: 'plano' | 'relieve' | 'profundidad' | 'parcial' | 'distancia-media' | 'estimado';
  muestras: number; // puntos de profundidad usados
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
  profundidad: boolean;
};

export type VistaARRef = {
  capturar(): Promise<CapturaAR>;
  /** Vista previa (aún sin anclar): esquinas x0, y0, x1, y1… normalizadas sobre la captura. Lista vacía la borra. */
  mostrarVista(esquinas: number[], bordes: boolean[], grados: number): Promise<void>;
  /** Ancla las esquinas en el espacio usando la pose de la cámara de la captura `id`. */
  fijar(id: number, esquinas: number[]): Promise<ResultadoFijar>;
  soltar(): Promise<void>;
};

export type VistaARProps = ViewProps & {
  debug?: boolean;
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
