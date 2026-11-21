/**
 * Módulo nativo propio (Android, ARCore): vista de cámara AR que ancla el polígono del vano del motor en el espacio.
 * Código nativo en ./android/src/main/java/expo/modules/capoar/.
 */
import type { ComponentType, Ref } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

type ModuloNativo = { disponibilidad(): Promise<string>; readPlatePreview(viewTag: number): Promise<string[]> };
const modulo = requireOptionalNativeModule<ModuloNativo>('CapoAr');

export const readPlatePreview = modulo?.readPlatePreview?.bind(modulo);

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
  /** Punto que el usuario marcó manteniendo presionado, visto en esta captura: [x, y] normalizado. */
  semilla?: number[];
};

export type ResultadoFijar = {
  adjustedParts?: number[];
  esquinas: number;
  /**
   * Dense placement uses a fitted plane or local relief. The part map can also use distributed hit tests.
   * Generic contours retain their existing distance fallbacks.
   */
  metodo: 'escaneo' | 'plano' | 'relieve' | 'hit-test' | 'profundidad' | 'parcial' | 'distancia-media' | 'estimado';
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

/** Catalog volume index and center in the normalized upright capture. */
export type PartCenter = [number, number, number];

export type EstadoAR = {
  estado: 'iniciando' | 'instalando' | 'rastreando' | 'sin-rastreo' | 'error';
  detalle: string | null;
  anclado: boolean;
  mapTracking: boolean;
  profundidad: boolean;
};

export type GuiaAR = {
  part: number;
  x: number;
  y: number;
  visible: boolean;
  distance: number;
};

export type VistaARRef = {
  capturar(includeMeasurements?: boolean): Promise<CapturaAR>;
  /** Vista previa (aún sin anclar): esquinas x0, y0, x1, y1… normalizadas sobre la captura. Lista vacía la borra. */
  mostrarVista(esquinas: number[], bordes: boolean[], grados: number): Promise<void>;
  /** Ancla las esquinas en el espacio usando la pose de la cámara de la captura `id`. */
  fijar(id: number, esquinas: number[], registration: number[], volumes: number[][], observedCenters?: PartCenter[]): Promise<ResultadoFijar>;
  soltar(): Promise<void>;
  pulso(): Promise<void>;
  /**
   * Escaneo: suma lo que el modelo vio en la captura `id`. `mascara`: 88×88 caracteres '0'/'1' sobre el recorte
   * (rx, ry, lado). Devuelve el mapa acumulado del vano (88×88, 0-100) sobre el plano del vano en el mundo.
   */
  acumular(id: number, mascara: string, rx: number, ry: number, lado: number): Promise<ResultadoEscaneo>;
  /**
   * Deja como vista previa (pegada al mundo) el contorno del escaneo, dado en coordenadas de su mapa, y lo devuelve
   * proyectado a la captura `id` (x0, y0, x1, y1…; puede salirse de 0..1). Lista vacía si no se pudo.
   */
  contornoEscaneo(id: number, esquinas: number[]): Promise<number[]>;
  reiniciarEscaneo(): Promise<void>;
  /** «Mantener presionado»: guarda el punto del mundo que hay en (x, y) de la vista, en píxeles. false si no se pudo medir. */
  sembrar(x: number, y: number): Promise<boolean>;
};

export type ResultadoEscaneo = {
  ok: boolean; // el cuadro sirvió (había profundidad y vano)
  vistas: number; // cuadros acumulados
  mapa?: number[]; // 88×88, fila por fila
  semilla?: number[]; // el punto marcado por el usuario, en coordenadas del mapa (0..1)
};

export type VistaARProps = ViewProps & {
  debug?: boolean;
  outbackParts?: string[];
  selectedPart?: number;
  /** Una fila por pieza, en el orden de los volúmenes: [nombre, color #RRGGBB, ícono (trazado SVG de 24 × 24)]. */
  hudParts?: readonly (readonly [string, string, string])[];
  /** Zona libre para las etiquetas: [arriba, abajo] en dp desde el borde superior de la vista. */
  hudArea?: readonly [number, number];
  onPart?: (e: NativeSyntheticEvent<{ index: number }>) => void;
  onEstado?: (e: NativeSyntheticEvent<EstadoAR>) => void;
  onGuia?: (e: NativeSyntheticEvent<GuiaAR>) => void;
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
