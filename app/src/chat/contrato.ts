export type BloqueContenido = { type: string; [campo: string]: unknown };

export type MensajeAnthropic = { role: 'user' | 'assistant'; content: string | BloqueContenido[] };

export type CodigoError = 'rechazo' | 'proveedor' | 'limite' | 'credito' | 'config' | 'interno' | 'red';

export type Evento =
  | { tipo: 'herramienta'; nombre: string }
  | { tipo: 'texto'; bloque: number; texto: string }
  | { tipo: 'cita'; bloque: number; titulo: string; fuente: string; texto_citado: string }
  | { tipo: 'fin'; mensajes: MensajeAnthropic[] }
  | { tipo: 'error'; codigo: CodigoError; mensaje: string };
