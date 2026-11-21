/**
 * Geometría del vano del motor: del mapa 88×88 que entrega el modelo al polígono que se dibuja.
 * Funciones puras (sin React Native) para poder probarlas en Node.
 *
 * Coordenadas normalizadas 0..1 sobre el cuadro COMPLETO de la cámara (x a la derecha, y hacia abajo).
 */
export const CELDAS = 88;
const MAX_ESQUINAS = 8;
const AREA_MINIMA = 0.02; // fracción del cuadro: menos que esto se considera ruido
const RADIO_APERTURA = 2; // celdas: quita lo más angosto que ~6 % del cuadro
const MARGEN_BORDE = 0.025; // una esquina a menos de esto del borde «toca» el borde del cuadro

export type Punto = { x: number; y: number; borde: boolean };
export type Vano = {
  esquinas: Punto[]; // polígono convexo, en orden
  area: number; // fracción del cuadro cubierta por la región detectada
  confianza: number; // probabilidad media dentro de la región (0 a 1)
  cortado: boolean; // parte del vano queda fuera del cuadro (alguna esquina toca el borde)
};

/** Media móvil de probabilidades entre cuadros: estabiliza el polígono cuando el teléfono se mueve poco. */
export class Suavizador {
  private media: Float32Array | null = null;
  private readonly peso: number;
  constructor(peso = 0.5) {
    this.peso = peso;
  }

  agregar(logits: Float32Array): Float32Array {
    const p = new Float32Array(logits.length);
    for (let i = 0; i < p.length; i++) p[i] = 1 / (1 + Math.exp(-logits[i]));
    const m = this.media;
    if (!m) return (this.media = p);
    // Si la máscara nueva casi no se parece a la acumulada, la cámara se movió: se parte de cero (evita el «fantasma»
    // de la posición anterior). Si se parece, se promedia para que no tiemble.
    let inter = 0;
    let union = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i] > 0.5;
      const b = m[i] > 0.5;
      if (a && b) inter++;
      if (a || b) union++;
    }
    if (union > 0 && inter / union < 0.5) return (this.media = p);
    for (let i = 0; i < p.length; i++) m[i] = this.peso * p[i] + (1 - this.peso) * m[i];
    return m;
  }

  reiniciar() {
    this.media = null;
  }
}

/** Probabilidades 88×88 → polígono del vano, o null si no hay una región suficiente. */
export function poligonoVano(prob: Float32Array, umbral = 0.5): Vano | null {
  const n = CELDAS;
  const cruda = new Uint8Array(n * n);
  for (let i = 0; i < cruda.length; i++) cruda[i] = prob[i] > umbral ? 1 : 0;
  // Apertura (erosión + dilatación): corta puentes delgados y manchas sueltas pegadas a la región, que inflarían
  // la envolvente (p. ej. piezas en el piso junto al auto).
  const dentro = filtro(filtro(cruda, RADIO_APERTURA, true), RADIO_APERTURA, false);

  // Región conectada más grande (vecindad 4).
  const etiqueta = new Int32Array(n * n).fill(-1);
  let mejor = -1;
  let mejorTam = 0;
  const pila: number[] = [];
  for (let inicio = 0; inicio < dentro.length; inicio++) {
    if (!dentro[inicio] || etiqueta[inicio] !== -1) continue;
    let tam = 0;
    etiqueta[inicio] = inicio;
    pila.push(inicio);
    while (pila.length) {
      const c = pila.pop()!;
      tam++;
      const x = c % n;
      const y = (c - x) / n;
      const vecinos = [x > 0 ? c - 1 : -1, x < n - 1 ? c + 1 : -1, y > 0 ? c - n : -1, y < n - 1 ? c + n : -1];
      for (const v of vecinos) {
        if (v >= 0 && dentro[v] && etiqueta[v] === -1) {
          etiqueta[v] = inicio;
          pila.push(v);
        }
      }
    }
    if (tam > mejorTam) {
      mejorTam = tam;
      mejor = inicio;
    }
  }
  const area = mejorTam / (n * n);
  if (mejor < 0 || area < AREA_MINIMA) return null;

  // Esquinas de las celdas del borde de la región → envolvente convexa.
  const puntos: [number, number][] = [];
  for (let c = 0; c < etiqueta.length; c++) {
    if (etiqueta[c] !== mejor) continue;
    const x = c % n;
    const y = (c - x) / n;
    const esBorde =
      x === 0 || y === 0 || x === n - 1 || y === n - 1 ||
      etiqueta[c - 1] !== mejor || etiqueta[c + 1] !== mejor || etiqueta[c - n] !== mejor || etiqueta[c + n] !== mejor;
    if (!esBorde) continue;
    puntos.push([x / n, y / n], [(x + 1) / n, y / n], [x / n, (y + 1) / n], [(x + 1) / n, (y + 1) / n]);
  }
  const simple = simplificar(envolvente(puntos), MAX_ESQUINAS);
  // Arista «corta» = menos del 20 % del lado de un cuadrado de igual área: relativo, para no comerse las esquinas
  // de un vano que se ve chico (lejos).
  const casco = juntarBiseles(simple, 0.2 * Math.sqrt(areaPoligono(simple)));
  let suma = 0;
  for (let c = 0; c < etiqueta.length; c++) if (etiqueta[c] === mejor) suma += prob[c];
  const esquinas = casco.map(([x, y]) => ({
    x,
    y,
    borde: x <= MARGEN_BORDE || y <= MARGEN_BORDE || x >= 1 - MARGEN_BORDE || y >= 1 - MARGEN_BORDE,
  }));
  return { esquinas, area, confianza: suma / mejorTam, cortado: esquinas.some((e) => e.borde) };
}

/** Erosión (min) o dilatación (max) con un cuadrado de lado 2r+1; fuera de la grilla cuenta como «no vano». */
function filtro(src: Uint8Array, r: number, erosion: boolean): Uint8Array {
  const n = CELDAS;
  const tmp = new Uint8Array(n * n);
  const out = new Uint8Array(n * n);
  for (let pasada = 0; pasada < 2; pasada++) {
    const a = pasada === 0 ? src : tmp;
    const b = pasada === 0 ? tmp : out;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let v = erosion ? 1 : 0;
        for (let d = -r; d <= r; d++) {
          const xx = pasada === 0 ? x + d : x;
          const yy = pasada === 0 ? y : y + d;
          // En la erosión, el borde de la imagen no «come» la región: un vano cortado por el cuadro sigue llegando al borde.
          const fuera = xx < 0 || yy < 0 || xx >= n || yy >= n;
          const c = fuera ? (erosion ? 1 : 0) : a[yy * n + xx];
          if (erosion ? c === 0 : c === 1) {
            v = erosion ? 0 : 1;
            break;
          }
        }
        b[y * n + x] = v;
      }
    }
  }
  return out;
}

/** Envolvente convexa (cadena monótona de Andrew), en sentido antihorario. */
export function envolvente(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cruz = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const abajo: [number, number][] = [];
  for (const q of p) {
    while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], q) <= 0) abajo.pop();
    abajo.push(q);
  }
  const arriba: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], q) <= 0) arriba.pop();
    arriba.push(q);
  }
  return abajo.slice(0, -1).concat(arriba.slice(0, -1));
}

/** Visvalingam: quita la esquina que menos área aporta hasta dejar `max` (y descarta las casi rectas). */
export function simplificar(poli: [number, number][], max: number): [number, number][] {
  const p = [...poli];
  const aporte = (i: number) => {
    const a = p[(i - 1 + p.length) % p.length];
    const b = p[i];
    const c = p[(i + 1) % p.length];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  };
  while (p.length > 3) {
    let menor = 0;
    let valor = Infinity;
    for (let i = 0; i < p.length; i++) {
      const v = aporte(i);
      if (v < valor) {
        valor = v;
        menor = i;
      }
    }
    // Ya cumple el máximo y la esquina más débil aporta ≥ 0,6 % del cuadro: es una esquina real, no escalón de la grilla.
    if (p.length <= max && valor > 0.006) break;
    p.splice(menor, 1);
  }
  return p;
}

/**
 * La envolvente de una grilla «bisela» las esquinas reales en dos vértices cercanos. Mientras haya una arista más corta
 * que `minimo`, sus dos extremos se reemplazan por el cruce de las aristas vecinas prolongadas (la esquina real);
 * si ese cruce queda lejos (aristas casi paralelas), por el punto medio.
 */
export function juntarBiseles(poli: [number, number][], minimo = 0.09): [number, number][] {
  const p = [...poli];
  while (p.length > 3) {
    let corta = -1;
    let largo = minimo;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < largo) {
        largo = l;
        corta = i;
      }
    }
    if (corta < 0) break;
    const k = p.length;
    const a0 = p[(corta - 1 + k) % k];
    const a1 = p[corta];
    const b0 = p[(corta + 1) % k];
    const b1 = p[(corta + 2) % k];
    const medio: [number, number] = [(a1[0] + b0[0]) / 2, (a1[1] + b0[1]) / 2];
    const cruce = interseccion(a0, a1, b0, b1);
    const nuevo = cruce && Math.hypot(cruce[0] - medio[0], cruce[1] - medio[1]) < 0.15 ? cruce : medio;
    p.splice(corta, 1, [Math.min(1, Math.max(0, nuevo[0])), Math.min(1, Math.max(0, nuevo[1]))]);
    p.splice((corta + 1) % p.length, 1);
  }
  return p;
}

function areaPoligono(p: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
}

function interseccion(p1: number[], p2: number[], p3: number[], p4: number[]): [number, number] | null {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

/** Tramos horizontales para rellenar un polígono convexo con Views (sin librerías de dibujo). Coordenadas en píxeles. */
export function tramos(poli: { x: number; y: number }[], filas: number): { y: number; alto: number; x0: number; x1: number }[] {
  if (poli.length < 3) return [];
  const ys = poli.map((q) => q.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const alto = (y1 - y0) / filas;
  const salida: { y: number; alto: number; x0: number; x1: number }[] = [];
  for (let f = 0; f < filas; f++) {
    const y = y0 + (f + 0.5) * alto;
    const xs: number[] = [];
    for (let i = 0; i < poli.length; i++) {
      const a = poli[i];
      const b = poli[(i + 1) % poli.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (xs.length >= 2) salida.push({ y: y0 + f * alto, alto: alto + 0.5, x0: Math.min(...xs), x1: Math.max(...xs) });
  }
  return salida;
}
