/**
 * Zoom automático de la detección.
 *
 * El modelo ve la imagen reducida a 352×352: si el vano ocupa poco del cuadro (un auto lejos, o una foto del auto
 * completo en una pantalla) no lo reconoce — medido con una grabación real: 0 % con el cuadro completo y 100 % con un
 * recorte ampliado. Además la captura abarca más que lo que muestra la pantalla del teléfono, así que todo se ve
 * todavía más chico para el modelo que para el usuario.
 *
 * Por eso se analiza un RECORTE cuadrado (en coordenadas normalizadas, mismo aspecto que la imagen):
 *  - Sin detección: ronda de búsqueda (cuadro completo → recorte central → recorte central más cerrado).
 *  - Con algo detectado pero chico o poco claro: se acerca sobre eso, sin cortar su dimensión mayor.
 *  - Con una detección válida: el recorte NO se toca (estabilidad); solo se abre si el vano toca su borde.
 * El resultado siempre se entrega en coordenadas del cuadro COMPLETO. Código puro (probado en Node).
 */
import { vanoValido, type Vano } from './vano';

/** Recorte cuadrado en coordenadas normalizadas de la imagen: esquina (x, y) y lado. lado = 1 es el cuadro completo. */
export type Recorte = { x: number; y: number; lado: number };

export const COMPLETO: Recorte = { x: 0, y: 0, lado: 1 };
const LADO_MIN = 0.3;
const OCUPACION = 0.3; // fracción del recorte que debería ocupar el vano
const HOLGURA = 1.3; // el recorte mide al menos esto por la dimensión mayor del vano
const MARGEN_BORDE = 0.025; // igual que en vano.ts: a esta distancia del borde, una esquina «toca» el borde

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const igual = (a: Recorte, b: Recorte) => a.x === b.x && a.y === b.y && a.lado === b.lado;

export function recorteCentrado(cx: number, cy: number, lado: number): Recorte {
  const l = limitar(lado, LADO_MIN, 1);
  if (l >= 0.85) return COMPLETO; // casi todo el cuadro: no vale la pena recortar
  return { x: limitar(cx - l / 2, 0, 1 - l), y: limitar(cy - l / 2, 0, 1 - l), lado: l };
}

/** Recorte que contiene los puntos dados con holgura (`factor` veces su tamaño). Para seguir un contorno ya anclado. */
export function recorteAlrededor(puntos: { x: number; y: number }[], factor = 1.7): Recorte {
  const xs = puntos.map((p) => limitar(p.x, 0, 1));
  const ys = puntos.map((p) => limitar(p.y, 0, 1));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return recorteCentrado((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * factor);
}

// La pantalla muestra la franja central de la captura y el panel tapa la parte de abajo: el usuario encuadra arriba del centro.
const BUSQUEDA: Recorte[] = [COMPLETO, recorteCentrado(0.5, 0.4, 0.6), recorteCentrado(0.5, 0.38, 0.4)];

/** Pasa un vano detectado dentro de `r` a coordenadas del cuadro completo. */
export function aCuadroCompleto(v: Vano, r: Recorte): Vano {
  const esquinas = v.esquinas.map((e) => {
    const x = r.x + e.x * r.lado;
    const y = r.y + e.y * r.lado;
    return { x, y, borde: x <= MARGEN_BORDE || y <= MARGEN_BORDE || x >= 1 - MARGEN_BORDE || y >= 1 - MARGEN_BORDE };
  });
  return { esquinas, area: v.area * r.lado * r.lado, confianza: v.confianza, cortado: esquinas.some((e) => e.borde) };
}

export type ResultadoEncuadre = {
  vano: Vano | null; // en coordenadas del cuadro completo
  valido: boolean; // detección utilizable (confianza y tamaño suficientes, y completa dentro del recorte)
  cambio: boolean; // el recorte del próximo análisis es otro: hay que reiniciar el suavizado entre cuadros
};

export class Encuadre {
  private actual: Recorte = COMPLETO;
  private paso = 0; // posición en la ronda de búsqueda
  private vacios = 0;
  private conVano = false; // el último análisis con resultado encontró un vano
  private centro: { x: number; y: number } | null = null; // punto marcado por el usuario (mantener presionado)

  /** Recorte que hay que analizar ahora. */
  recorte(): Recorte {
    return this.actual;
  }

  /**
   * El usuario marcó dónde está el motor: la ronda de búsqueda pasa a centrarse en ese punto (en coordenadas del
   * cuadro completo de la captura actual; hay que llamarlo en cada captura, porque el punto se mueve con el teléfono).
   */
  apuntar(punto: { x: number; y: number } | null) {
    this.centro = punto;
    // Mientras busca (sin vano), el recorte en curso se recentra de inmediato sobre el punto.
    if (punto && !this.conVano && this.actual.lado < 1) this.actual = recorteCentrado(punto.x, punto.y, this.actual.lado);
  }

  private ronda(): Recorte[] {
    const c = this.centro;
    return c ? [COMPLETO, recorteCentrado(c.x, c.y, 0.7), recorteCentrado(c.x, c.y, 0.45)] : BUSQUEDA;
  }

  /** `v`: lo que detectó el modelo en `recorte()`, en coordenadas de ESE recorte (o null). */
  procesar(v: Vano | null): ResultadoEncuadre {
    const r = this.actual;
    if (!v) {
      this.vacios += 1;
      // Si venía viendo un vano se tolera un análisis vacío; si no, continúa la ronda de búsqueda.
      if (!(this.conVano && this.vacios < 2)) {
        this.conVano = false;
        this.paso = (this.paso + 1) % BUSQUEDA.length;
        this.actual = this.ronda()[this.paso];
      }
      return { vano: null, valido: false, cambio: !igual(this.actual, r) };
    }
    this.vacios = 0;
    this.conVano = true;
    const completo = aCuadroCompleto(v, r);
    // ¿El vano toca el borde del recorte sin que ese borde sea el del cuadro? Entonces quedó cortado por el zoom.
    const cortadoPorZoom = v.esquinas.some((e, i) => e.borde && !completo.esquinas[i].borde);
    const xs = completo.esquinas.map((e) => e.x);
    const ys = completo.esquinas.map((e) => e.y);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const mayor = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const valido = vanoValido(v) && !cortadoPorZoom;
    // Regla de estabilidad (medida con videos del Outback real): si el recorte actual ya da una detección válida, NO
    // se toca. Reajustarlo en cada análisis hacía oscilar el zoom («Buscando» con 94 % de confianza).
    if (cortadoPorZoom) {
      // El vano no cabe en el recorte: se abre, como mínimo hasta contenerlo con holgura.
      this.actual = recorteCentrado(cx, cy, Math.max(r.lado * 1.5, HOLGURA * mayor));
    } else if (!valido) {
      // Hay algo, pero chico o poco claro: se acerca sobre eso, sin cortar su dimensión mayor.
      const objetivo = recorteCentrado(cx, cy, Math.max(Math.sqrt(completo.area / OCUPACION), HOLGURA * mayor));
      if (objetivo.lado < r.lado * 0.8) this.actual = objetivo;
      else {
        this.paso = (this.paso + 1) % BUSQUEDA.length;
        this.actual = this.ronda()[this.paso];
      }
    }
    return { vano: completo, valido, cambio: !igual(this.actual, r) };
  }

  reiniciar() {
    this.actual = COMPLETO;
    this.paso = 0;
    this.vacios = 0;
    this.conVano = false;
    this.centro = null;
  }
}
