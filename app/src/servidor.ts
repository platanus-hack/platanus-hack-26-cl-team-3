const KEY = 'capo-ar:servidor:v1';

export const SERVIDOR_POR_DEFECTO = (process.env.EXPO_PUBLIC_API_URL || 'https://ph26.berguecio.cl').replace(/\/+$/, '');

export function normalizarServidor(raw: string): string | null {
  const texto = raw.trim().replace(/\/+$/, '');
  try {
    const url = new URL(texto);
    if (url.protocol !== 'https:' || !url.hostname || url.search || url.hash) return null;
    return texto;
  } catch {
    return null;
  }
}

const storage = async () => (await import('@react-native-async-storage/async-storage')).default;

let cache: string | null = null;

export async function servidor(): Promise<string> {
  if (cache !== null) return cache;
  try {
    const s = await storage();
    const guardado = await s.getItem(KEY);
    const actual = (guardado && normalizarServidor(guardado)) || SERVIDOR_POR_DEFECTO;
    cache = actual;
    return actual;
  } catch {
    return SERVIDOR_POR_DEFECTO;
  }
}

export async function fijarServidor(url: string | null): Promise<void> {
  const normalizada = url === null ? null : normalizarServidor(url);
  cache = normalizada ?? SERVIDOR_POR_DEFECTO;
  try {
    const s = await storage();
    if (normalizada === null) await s.removeItem(KEY);
    else await s.setItem(KEY, normalizada);
  } catch {}
}
