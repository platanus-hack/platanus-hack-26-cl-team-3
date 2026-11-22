import type { EstadoEscucha } from './useEscuchaViva';

/** Qué le muestra a la persona el borde de pantalla completa del modo en vivo. */
export type FaseVoz = 'ninguna' | 'escuchando' | 'oyendo' | 'pensando';

/**
 * El asistente tiene que dejar clarísimo en qué está: esperando su voz, oyéndola, o trabajando en la respuesta.
 * «pensando» cubre la transcripción y el turno del asistente (consultar el manual, armar la respuesta).
 */
export function faseVoz(estado: EstadoEscucha, pensando: boolean): FaseVoz {
  if (estado === 'silenciado') return 'ninguna';
  if (estado === 'oyendo') return 'oyendo';
  if (estado === 'transcribiendo') return 'pensando';
  return pensando ? 'pensando' : 'escuchando';
}

/** Nivel del micrófono (0-1) llevado a la intensidad del borde: nunca apagado mientras se oye una voz. */
export function intensidadOyendo(nivel: number): number {
  if (!Number.isFinite(nivel)) return 0.55;
  return 0.55 + 0.45 * Math.min(1, Math.max(0, nivel));
}
