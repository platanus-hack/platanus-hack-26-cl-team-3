export type EventoVad = 'inicio' | 'fin' | 'reiniciar';

export type OpcionesVad = {
  inicioMs: number;
  silencioFinMs: number;
  fraseMaxMs: number;
  sinVozMs: number;
  ventanaRuidoMs: number;
  margenDb: number;
  umbralMinDb: number;
  umbralMaxDb: number;
};

export const OPCIONES_VAD: OpcionesVad = {
  inicioMs: 250,
  silencioFinMs: 1000,
  fraseMaxMs: 30000,
  sinVozMs: 10000,
  ventanaRuidoMs: 2000,
  margenDb: 15,
  umbralMinDb: -45,
  umbralMaxDb: -20,
};

type Muestra = { db: number; t: number };

const mediana = (valores: number[]) => {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = orden.length >> 1;
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
};

export function crearVad(opciones: Partial<OpcionesVad> = {}) {
  const o = { ...OPCIONES_VAD, ...opciones };
  let ruido: Muestra[] = [];
  let anterior: number | null = null;
  let enFrase = false;
  let fraseDesde = 0;
  let sobreDesde: number | null = null;
  let bajoDesde: number | null = null;
  let sinVozDesde: number | null = null;

  const umbral = () => {
    if (ruido.length === 0) return o.umbralMaxDb;
    const piso = mediana(ruido.map((m) => m.db));
    return Math.min(o.umbralMaxDb, Math.max(o.umbralMinDb, piso + o.margenDb));
  };

  const cerrar = (t: number) => {
    enFrase = false;
    sobreDesde = null;
    bajoDesde = null;
    sinVozDesde = t;
  };

  return {
    reiniciar() {
      ruido = [];
      anterior = null;
      enFrase = false;
      sobreDesde = null;
      bajoDesde = null;
      sinVozDesde = null;
    },
    cerrando: () => enFrase && bajoDesde !== null,
    push(db: number, t: number): EventoVad | null {
      const desde = anterior ?? t;
      anterior = t;
      sinVozDesde ??= desde;
      const voz = db > umbral();

      if (!voz && !enFrase) {
        ruido.push({ db, t });
        ruido = ruido.filter((m) => t - m.t <= o.ventanaRuidoMs);
      }

      if (enFrase) {
        if (t - fraseDesde >= o.fraseMaxMs) {
          cerrar(t);
          return 'fin';
        }
        if (voz) {
          bajoDesde = null;
          return null;
        }
        bajoDesde ??= desde;
        if (t - bajoDesde >= o.silencioFinMs) {
          cerrar(t);
          return 'fin';
        }
        return null;
      }

      if (voz) {
        sobreDesde ??= desde;
        if (t - sobreDesde >= o.inicioMs) {
          enFrase = true;
          fraseDesde = sobreDesde;
          bajoDesde = null;
          sobreDesde = null;
          sinVozDesde = null;
          return 'inicio';
        }
        return null;
      }

      sobreDesde = null;
      if (t - sinVozDesde >= o.sinVozMs) {
        sinVozDesde = t;
        return 'reiniciar';
      }
      return null;
    },
  };
}
