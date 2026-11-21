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
 *  - Con detección: el recorte sigue al vano para que ocupe ~30 % de lo que ve el modelo; se aleja si el vano toca
 *    el borde del recorte.
 * El resultado siempre se entrega en coordenadas del cuadro COMPLETO. Código puro (probado en Node).
 */
import { vanoValido, type Vano } from './vano';

/** Recorte cuadrado en coordenadas normalizadas de la imagen: esquina (x, y) y lado. lado = 1 es el cuadro completo. */
export type Recorte = { x: number; y: number; lado: number };

export const COMPLETO: Recorte = { x: 0, y: 0, lado: 1 };
const LADO_MIN = 0.3;
const OCUPACION = 0.3; // fracción del recorte que debería ocupar el vano
const MARGEN_BORDE = 0.025; // igual que en vano.ts: a esta distancia del borde, una esquina «toca» el borde

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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

  /** Recorte que hay que analizar ahora. */
  recorte(): Recorte {
    return this.actual;
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
        this.actual = BUSQUEDA[this.paso];
      }
      return { vano: null, valido: false, cambio: this.actual !== r };
    }
    this.vacios = 0;
    this.conVano = true;
    const completo = aCuadroCompleto(v, r);
    // ¿El vano toca el borde del recorte sin que ese borde sea el del cuadro? Entonces quedó cortado por el zoom.
    const cortadoPorZoom = v.esquinas.some((e, i) => e.borde && !completo.esquinas[i].borde);
    let lado = Math.sqrt(completo.area / OCUPACION);
    if (cortadoPorZoom) lado = Math.max(lado, r.lado * 1.5);
    const cx = completo.esquinas.reduce((s, e) => s + e.x, 0) / completo.esquinas.length;
    const cy = completo.esquinas.reduce((s, e) => s + e.y, 0) / completo.esquinas.length;
    const objetivo = recorteCentrado(cx, cy, lado);
    // Histéresis: se cambia de recorte solo si el actual quedó claramente chico, grande o descentrado.
    const razon = objetivo.lado / r.lado;
    const corrido =
      Math.abs(objetivo.x + objetivo.lado / 2 - (r.x + r.lado / 2)) > 0.2 * r.lado ||
      Math.abs(objetivo.y + objetivo.lado / 2 - (r.y + r.lado / 2)) > 0.2 * r.lado;
    if (cortadoPorZoom || razon > 1.3 || razon < 0.7 || corrido) this.actual = objetivo;
    return { vano: completo, valido: vanoValido(v) && !cortadoPorZoom, cambio: this.actual !== r };
  }

  reiniciar() {
    this.actual = COMPLETO;
    this.paso = 0;
    this.vacios = 0;
    this.conVano = false;
  }
}
