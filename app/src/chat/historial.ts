import type { MensajeAnthropic } from './contrato';

const CLAVE = 'capo-ar:chat-v1';

export type CitaVista = { titulo: string; fuente: string; texto_citado: string };
export type ParteVista = { texto: string; citas: CitaVista[] };
export type Burbuja = { rol: 'user' | 'assistant'; partes: ParteVista[] };

const almacen = async () => (await import('@react-native-async-storage/async-storage')).default;

export async function cargar(): Promise<MensajeAnthropic[]> {
  try {
    const crudo = await (await almacen()).getItem(CLAVE);
    const v = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function guardar(mensajes: MensajeAnthropic[]): Promise<void> {
  try {
    await (await almacen()).setItem(CLAVE, JSON.stringify(mensajes));
  } catch {
  }
}

export async function borrar(): Promise<void> {
  try {
    await (await almacen()).removeItem(CLAVE);
  } catch {
  }
}

export function aVista(mensajes: MensajeAnthropic[]): Burbuja[] {
  const out: Burbuja[] = [];
  for (const m of mensajes) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.push({ rol: 'user', partes: [{ texto: m.content, citas: [] }] });
      continue;
    }
    const partes: ParteVista[] = [];
    if (Array.isArray(m.content)) {
      for (const b of m.content as any[]) {
        if (b.type !== 'text') continue;
        const citas: CitaVista[] = (b.citations ?? [])
          .filter((c: any) => c.type === 'search_result_location')
          .map((c: any) => ({ titulo: c.title ?? '', fuente: c.source, texto_citado: c.cited_text }));
        partes.push({ texto: b.text, citas });
      }
    } else if (typeof m.content === 'string') {
      partes.push({ texto: m.content, citas: [] });
    }
    if (partes.length === 0) continue;
    const ultima = out[out.length - 1];
    if (ultima?.rol === 'assistant') ultima.partes.push(...partes);
    else out.push({ rol: 'assistant', partes });
  }
  return out;
}
