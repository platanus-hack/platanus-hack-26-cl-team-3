// Puente entre el resultado nativo (modelo 3D ubicado en una foto) y la pantalla de analizar. Código puro.
import type { PiezaImagen } from '../../modules/capo-ar';
import { parts, type PartId } from '../engine-maps/catalog';
import type { Vano } from '../detector/vano';
import type { Pieza2D, Punto } from './mapa2d';

/** Esquinas del vano del detector como x0, y0, x1, y1… (lo que espera el módulo nativo); vacío sin vano. */
export function esquinasParaModelo(vano: Vano | null): number[] {
  return vano ? vano.esquinas.flatMap((e) => [e.x, e.y]) : [];
}

const pares = (v: number[]): Punto[] => Array.from({ length: Math.floor(v.length / 2) }, (_, i) => ({ x: v[2 * i], y: v[2 * i + 1] }));

/** Las piezas que devuelve el módulo nativo, en la misma forma que las de la plantilla 2D; descarta ids que el catálogo no conoce. */
export function aPiezas2D(piezas: readonly PiezaImagen[]): Pieza2D[] {
  return piezas
    .filter((p) => p.id in parts && p.contorno.length >= 6 && p.centro.length === 2)
    .map((p) => ({ part: p.id as PartId, contorno: pares(p.contorno), centro: { x: p.centro[0], y: p.centro[1] } }));
}

function area(poligono: Punto[]): number {
  let s = 0;
  poligono.forEach((a, i) => {
    const b = poligono[(i + 1) % poligono.length];
    s += a.x * b.y - b.x * a.y;
  });
  return Math.abs(s) / 2;
}

function contiene(poligono: Punto[], p: Punto): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/**
 * La pieza que hay bajo un toque (normalizado sobre la foto). Si varias siluetas lo contienen gana la más chica (una tapa
 * sobre su depósito, un borne sobre la batería). Si ninguna lo contiene, la de centro más cercano dentro de `tolerancia`,
 * porque las piezas chicas son difíciles de acertar con el dedo.
 */
export function piezaEnPunto(piezas: readonly Pieza2D[], p: Punto, tolerancia = 0.03): PartId | null {
  const dentro = piezas.filter((pieza) => contiene(pieza.contorno, p)).sort((a, b) => area(a.contorno) - area(b.contorno));
  if (dentro.length) return dentro[0].part;
  let mejor: PartId | null = null;
  let distancia = tolerancia;
  for (const pieza of piezas) {
    const d = Math.hypot(pieza.centro.x - p.x, pieza.centro.y - p.y);
    if (d < distancia) {
      distancia = d;
      mejor = pieza.part;
    }
  }
  return mejor;
}
