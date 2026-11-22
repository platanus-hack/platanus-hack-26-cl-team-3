import { engineMaps } from './engine-maps/catalog';
import { fuseGuides } from './fusibles/guides';

/**
 * Qué sabe hacer la app con cada auto. El auto que elige la persona (en el menú o al leer la patente) manda en toda la
 * app: el escáner, el manual, los fusibles, el tablero y el chat consultan esto en vez de preguntar «¿es el Outback?».
 * Lo que no existe para un auto se dice; no se inventa (regla 1 del README).
 *
 * `manual` refleja el flag del perfil del servidor (api/src/vehicles/registry.ts); `fusibles` sale de las guías de
 * fusibles de la app (fusibles/guides.ts), que deben coincidir con las tablas del servidor (test de consistencia).
 */
export type NivelAR =
  | 'completo' // modelo 3D de las piezas + registro visual
  | 'medido' // modelo 3D de las piezas que se ancla con profundidad medida
  | 'plantilla' // plantilla 2D aproximada del vano
  | 'ninguno'; // sin mapa de piezas

export type Capacidades = { ar: NivelAR; manual: boolean; fusibles: boolean; tablero: boolean };

const EXPLICITAS: Record<string, Capacidades> = {
  outback: { ar: 'completo', manual: true, fusibles: false, tablero: true },
  swift: { ar: 'medido', manual: false, fusibles: false, tablero: false },
  ram700: { ar: 'medido', manual: false, fusibles: false, tablero: false },
};

export function capacidadesDe(vehicleId: string | undefined): Capacidades {
  const fusibles = !!vehicleId && Object.hasOwn(fuseGuides, vehicleId);
  const explicitas = vehicleId && Object.hasOwn(EXPLICITAS, vehicleId) ? EXPLICITAS[vehicleId] : undefined;
  if (explicitas) return { ...explicitas, fusibles };
  const ar: NivelAR = vehicleId && Object.hasOwn(engineMaps, vehicleId) ? 'plantilla' : 'ninguno';
  return { ar, manual: false, fusibles, tablero: false };
}

const PARTES: Record<NivelAR, string> = {
  completo: 'mapa 3D de las piezas del vano',
  medido: 'mapa 3D de las piezas del vano (necesita profundidad en el teléfono)',
  plantilla: 'plantilla aproximada del vano',
  ninguno: 'sin mapa de piezas del vano',
};

/** Una frase honesta de lo que la app tiene para este auto, para el aviso y los mensajes de «todavía no». */
export function resumenCapacidades(nombre: string, c: Capacidades): string {
  const verificado = [c.manual && 'manual', c.fusibles && 'fusibles', c.tablero && 'luces del tablero'].filter(Boolean) as string[];
  const datos = verificado.length
    ? `Con datos verificados de ${verificado.join(', ')}.`
    : 'Sin manual ni datos verificados todavía: no se afirma nada del auto que no esté en una fuente.';
  return `Tu auto: ${nombre}. ${PARTES[c.ar][0].toUpperCase()}${PARTES[c.ar].slice(1)}. ${datos}`;
}
