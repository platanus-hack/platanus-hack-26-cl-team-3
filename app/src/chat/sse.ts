import type { Evento } from './contrato';

export function aEvento(nombre: string, datos: any): Evento | null {
  switch (nombre) {
    case 'herramienta':
      return { tipo: 'herramienta', nombre: datos.nombre };
    case 'texto':
      return { tipo: 'texto', bloque: datos.bloque, texto: datos.texto };
    case 'cita':
      return { tipo: 'cita', bloque: datos.bloque, titulo: datos.titulo, fuente: datos.fuente, texto_citado: datos.texto_citado };
    case 'fin':
      return { tipo: 'fin', mensajes: datos.mensajes };
    case 'error':
      return { tipo: 'error', codigo: datos.codigo, mensaje: datos.mensaje };
    default:
      return null;
  }
}

export function separarEventos(buffer: string): { eventos: Evento[]; resto: string } {
  const eventos: Evento[] = [];
  const partes = buffer.split('\n\n');
  const resto = partes.pop() ?? '';
  for (const bloque of partes) {
    let nombre = '';
    let datos = '';
    for (const linea of bloque.split('\n')) {
      if (linea.startsWith('event:')) nombre = linea.slice(6).trim();
      else if (linea.startsWith('data:')) datos += linea.slice(5).trim();
    }
    if (!nombre || !datos) continue;
    try {
      const ev = aEvento(nombre, JSON.parse(datos));
      if (ev) eventos.push(ev);
    } catch {
      continue;
    }
  }
  return { eventos, resto };
}
