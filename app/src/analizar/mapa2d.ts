// Geometría para analizar una foto o un video ya grabado (sin cámara en vivo ni ARCore). Código puro.
import type { Vano } from '../detector/vano';
import type { PartId, Volume } from '../engine-maps/catalog';
import { registrationCorners } from '../engine-maps/registration';

export type Punto = { x: number; y: number };
export type Pieza2D = { part: PartId; contorno: Punto[]; centro: Punto };

/**
 * Ubica las huellas del catálogo sobre la imagen, en coordenadas normalizadas de esa imagen. Es la misma regla que usa
 * el módulo nativo al fijar en AR (EngineMesh.create), pero en 2D: las cuatro esquinas del registro son
 * atrás-izquierda, atrás-derecha, adelante-izquierda y adelante-derecha; u recorre el ancho y v va de atrás a adelante.
 * Devuelve [] si el vano no sirve para registrar (cortado por el borde o muy chico).
 */
export function piezasSobreImagen(vano: Vano, volumes: readonly Volume[]): Pieza2D[] {
  if (vano.cortado) return []; // con el vano cortado, la plantilla quedaría ajustada a un pedazo: piezas mal ubicadas
  const c = registrationCorners(vano);
  if (c.length !== 8) return [];
  const [alx, aly, arx, ary, dlx, dly, drx, dry] = c;
  return volumes.map(({ part, outline }) => {
    const contorno = outline.map(([u, v]) => {
      const ax = alx + (arx - alx) * u;
      const ay = aly + (ary - aly) * u;
      const dx = dlx + (drx - dlx) * u;
      const dy = dly + (dry - dly) * u;
      return { x: ax + (dx - ax) * v, y: ay + (dy - ay) * v };
    });
    const centro = {
      x: contorno.reduce((s, p) => s + p.x, 0) / contorno.length,
      y: contorno.reduce((s, p) => s + p.y, 0) / contorno.length,
    };
    return { part, contorno, centro };
  });
}

/**
 * De varios cuadros de un video, el más útil: primero los que tienen el vano completo (sirven para ubicar las piezas),
 * después los válidos, y dentro de cada grupo el de mayor confianza por área. -1 si la lista está vacía.
 */
export function mejorCuadro(cuadros: { vano: Vano | null; valido: boolean }[]): number {
  let mejor = -1;
  let nota = -1;
  cuadros.forEach(({ vano, valido }, i) => {
    const n = !vano ? 0 : (valido ? (vano.cortado ? 1 : 2) : 0.5) + vano.confianza * Math.min(1, vano.area * 2) * 0.4;
    if (n > nota) {
      nota = n;
      mejor = i;
    }
  });
  return mejor;
}

/** Rectángulo donde queda una imagen de `ancho`×`alto` al mostrarla completa («contain») dentro de una caja. */
export function encajar(ancho: number, alto: number, caja: { w: number; h: number }) {
  if (!ancho || !alto) return { x: 0, y: 0, w: caja.w, h: caja.h };
  const s = Math.min(caja.w / ancho, caja.h / alto);
  return { x: (caja.w - ancho * s) / 2, y: (caja.h - alto * s) / 2, w: ancho * s, h: alto * s };
}
