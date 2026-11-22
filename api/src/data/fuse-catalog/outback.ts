/** 2016 Legacy/Outback North American owner's manual MSA5M1603C, pp. 12-10 to 12-13. */
export const outbackFuseManualUrl = 'https://techinfo.subaru.com/stis/doc/ownerManual/MSA5M1603CSTIS101515.pdf';

export type FuseBox = 'engine' | 'cabin';
export type OutbackFuse = {
  box: FuseBox;
  number: number | 'A';
  amps: number | null;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const outbackFuseGuide = {
  engine: { width: 1100, height: 800, page: 531, diagram: 'C00292', pages: '12-12–12-13' },
  cabin: { width: 1100, height: 800, page: 529, diagram: 'C00247', pages: '12-10–12-11' },
} as const;

// One row per numbered position in the manufacturer's table. Coordinates are diagram pixels.
type Entry = readonly [amps: number | null, label: string, description: string, left: number, top: number];

const engineEntries: readonly Entry[] = [
  [7.5, 'HORN RH', 'Bocina derecha', 99, 43],
  [7.5, 'HORN LH', 'Bocina izquierda', 159, 43],
  [10, 'ILLUMI', 'Iluminación', 264, 43],
  [10, 'TAIL', 'Luces de posición traseras', 323, 43],
  [15, 'H/L LO RH', 'Luz baja derecha', 429, 43],
  [15, 'H/L LO LH', 'Luz baja izquierda', 490, 43],
  [10, 'H/L HI LH', 'Luz alta izquierda', 654, 43],
  [7.5, 'DCM', 'Módulo DCM', 287, 175],
  [15, 'D/L', 'Cierre centralizado', 343, 175],
  [10, 'H/L HI RH', 'Luz alta derecha', 399, 175],
  [7.5, 'ALT-S', 'Señal del alternador', 457, 175],
  [20, 'FUEL', 'Circuito de combustible', 513, 175],
  [15, 'HAZARD', 'Luces de emergencia', 570, 175],
  [30, 'IG2', 'Encendido IG2', 626, 175],
  [7.5, 'PU B/UP', 'Circuito PU B/UP', 684, 175],
  [7.5, 'OBD', 'Diagnóstico OBD', 740, 175],
  [25, 'O2 HTR', 'Calefactor del sensor de oxígeno del motor 3.6 L', 241, 289],
  [15, 'E/G2', 'Control del motor E/G2', 299, 289],
  [15, 'ETC', 'Acelerador electrónico', 357, 289],
  [15, 'E/G1', 'Control del motor E/G1', 413, 289],
  [15, 'AVCS', 'Distribución variable AVCS', 471, 289],
  [15, 'INJ', 'Inyección', 528, 289],
  [7.5, 'CVT SSR', 'Circuito CVT SSR', 584, 289],
  [20, 'TCU', 'Unidad de control de la transmisión', 642, 289],
  [30, 'BACKUP', 'Alimentación de respaldo', 301, 414],
  [7.5, 'ACTGS', 'Circuito ACTGS', 357, 414],
  [25, 'SUB FAN', 'Electroventilador auxiliar', 415, 414],
  [25, 'MAIN FAN', 'Electroventilador principal', 471, 414],
  [30, 'ABS SOL', 'Solenoides del ABS', 530, 414],
  [20, 'AUDIO', 'Audio', 586, 414],
  [25, 'R.DEF', 'Desempañador de la luneta trasera', 642, 414],
  [15, 'BLOWER', 'Ventilador del habitáculo', 701, 414],
  [15, 'BLOWER', 'Ventilador del habitáculo', 757, 414],
  [10, 'F.FOG RH', 'Neblinero delantero derecho', 152, 589],
  [10, 'F.FOG LH', 'Neblinero delantero izquierdo', 210, 589],
  [15, 'R.WIPER', 'Limpiaparabrisas trasero', 495, 688],
  [15, 'F.WASH', 'Lavaparabrisas delantero (sapito)', 553, 688],
  [30, 'F.WIPER', 'Limpiaparabrisas delantero', 612, 688],
];

const cabinEntries: readonly Entry[] = [
  [7.5, 'START1', 'Arranque START1', 291, 121],
  [20, '12V SOCKET', 'Toma de corriente de 12 V', 503, 121],
  [7.5, 'IG1-1', 'Encendido IG1-1', 711, 121],
  [15, 'AUDIO NAVI', 'Audio y navegación', 922, 121],
  [15, 'UNIT IG2-2', 'Unidad de encendido IG2-2', 83, 204],
  [20, 'P/W R.LH', 'Alzavidrios trasero izquierdo', 291, 204],
  [10, 'CIGAR', 'Encendedor de cigarrillos', 503, 204],
  [15, 'A/C IG', 'Encendido del aire acondicionado', 711, 204],
  [7.5, 'ACC', 'Accesorios', 922, 204],
  [7.5, 'UNIT IG2-1', 'Unidad de encendido IG2-1', 83, 287],
  [30, 'P/W MAIN1', 'Circuito principal 1 de alzavidrios, sin puerta asignada en el manual', 291, 287],
  [7.5, 'START2', 'Arranque START2', 503, 287],
  [null, 'Empty', 'Posición vacía según el manual', 711, 287],
  [7.5, 'UNIT+B', 'Circuito UNIT+B', 922, 287],
  [7.5, 'METER IG', 'Encendido del cuadro de instrumentos', 83, 370],
  [20, 'P/W R.RH', 'Alzavidrios trasero derecho', 291, 370],
  [7.5, 'MIR', 'Espejos', 503, 370],
  [7.5, 'LAMP IG', 'Encendido LAMP IG', 711, 370],
  [7.5, 'IG1-2', 'Encendido IG1-2', 922, 370],
  [10, 'SRS AIR BAG', 'Airbags SRS', 83, 453],
  [20, 'P/W PASS1', 'Circuito de pasajero 1 de alzavidrios', 291, 453],
  [15, 'SEAT HTR R', 'Calefacción de asientos traseros', 503, 453],
  [10, 'DRL', 'Luces de circulación diurna', 711, 453],
  [20, 'P/W MAIN2', 'Circuito principal 2 de alzavidrios, sin puerta asignada en el manual', 922, 453],
  [null, 'Empty', 'Posición vacía según el manual', 83, 536],
  [10, 'BACK UP', 'Circuito BACK UP', 291, 536],
  [20, 'WIPER DEICER', 'Deshielo de limpiaparabrisas', 503, 536],
  [20, 'TRAIL R.FOG', 'Circuito TRAIL R.FOG', 711, 536],
  [20, 'P/W PASS2', 'Circuito de pasajero 2 de alzavidrios', 922, 536],
  [null, 'Empty', 'Posición vacía según el manual', 83, 619],
  [7.5, 'SMT', 'Circuito SMT', 291, 619],
  [15, 'SEAT HTR F', 'Calefacción de asientos delanteros', 503, 619],
  [7.5, 'KEY SW', 'Interruptor de llave', 711, 619],
  [7.5, 'D_OP+B', 'Circuito D_OP+B', 922, 607],
  [20, 'SUN ROOF', 'Techo solar', 83, 690],
  [null, 'Empty', 'Posición vacía según el manual', 291, 690],
  [7.5, 'STOP', 'Luces de freno', 503, 690],
  [7.5, 'EYE SIGHT', 'Sistema EyeSight', 711, 690],
];

function slots(box: FuseBox, entries: readonly Entry[], pixelWidth: number, pixelHeight: number): OutbackFuse[] {
  const { width, height } = outbackFuseGuide[box];
  return entries.map(([amps, label, description, left, top], i) => ({
    box, number: i + 1, amps, label, description, x: left / width, y: top / height,
    width: pixelWidth / width, height: pixelHeight / height,
  }));
}

export const outbackFuses: readonly OutbackFuse[] = [
  ...slots('engine', engineEntries, 46, 83),
  { box: 'engine', number: 'A', amps: null, label: 'Main fuse', description: 'Fusible principal. El manual identifica su posición sin indicar amperaje.',
    x: 823 / 1100, y: 150 / 800, width: 119 / 1100, height: 493 / 800 },
  ...slots('cabin', cabinEntries, 133, 51),
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function windowCircuits(query: string): string[] {
  const rear = /\b(traser[oa]s?|posterior(?:es)?|rear|atras)\b/.test(query);
  const left = /\b(izquierd[oa]s?|izq|left|lh)\b/.test(query);
  const right = /\b(derech[oa]s?|der|right|rh)\b/.test(query);
  const main = ['P/W MAIN1', 'P/W MAIN2'];
  const passenger = ['P/W PASS1', 'P/W PASS2'];
  const back = left === right ? ['P/W R.LH', 'P/W R.RH'] : [left ? 'P/W R.LH' : 'P/W R.RH'];
  if (rear) return back;
  if (/\b(conductor[a]?|piloto|driver|principal)\b/.test(query)) return main;
  if (/\b(pasajer[oa]|acompanante|copiloto|passenger)\b/.test(query)) return passenger;
  if (/\b(delanter[oa]s?|front(?:al)?)\b/.test(query)) return [...main, ...passenger];
  return [...main, ...passenger, ...back];
}

/** A lookup returns every supported candidate. MAIN/PASS pairs are not door-specific diagnoses. */
export function findOutbackFuses(query: string, box?: FuseBox): OutbackFuse[] {
  const text = normalize(query);
  const available = outbackFuses.filter(fuse => !box || fuse.box === box);
  if (!text) return available;

  if (['a', 'fusible a', 'fusible principal a', 'main fuse a', 'fuse a', 'principal', 'fusible principal'].includes(text)) {
    return available.filter(fuse => fuse.number === 'A');
  }
  const slot = text.match(/^(?:fusible\s*|fuse\s*|f\s*)?(\d+)$/);
  if (slot) return available.filter(fuse => fuse.number === Number(slot[1]));
  const exact = available.filter(fuse => normalize(fuse.label) === text);
  if (exact.length) return exact;
  if (text === 'radio') return available.filter(fuse => fuse.label.startsWith('AUDIO'));
  // Several unrelated circuits operate on glass. Resolve the mechanism before window motors.
  if (/\b(techo (?:solar|corredizo)|sun ?roof|ventana del techo)\b/.test(text)) {
    return available.filter(fuse => fuse.label === 'SUN ROOF');
  }
  if (/\b(limpiaparabrisas|limpialuneta|wipers?)\b/.test(text) && !/\b(deicer|deshielo)\b/.test(text)) {
    if (/\b(traser[oa]|rear|luneta|limpialuneta)\b/.test(text)) return available.filter(fuse => fuse.label === 'R.WIPER');
    if (/\b(delanter[oa]|front)\b/.test(text)) return available.filter(fuse => fuse.label === 'F.WIPER');
  }
  if (/\b(desempanador|desempanante|defroster|defogger|luneta termica)\b/.test(text)) {
    return available.filter(fuse => fuse.label === 'R.DEF');
  }
  if (/\b(ventanas?|ventanillas?|alzavidrios?|elevalunas?|vidrios?|windows?)\b/.test(text)) {
    const circuits = windowCircuits(text);
    return available.filter(fuse => circuits.includes(fuse.label));
  }
  const ignored = new Set(['a', 'al', 'caja', 'cambiar', 'circuito', 'cual', 'de', 'del', 'el', 'en', 'es',
    'fusible', 'fusibles', 'fuse', 'fuses', 'la', 'las', 'lo', 'los', 'mi', 'para', 'quiero', 'que', 'un', 'una']);
  const words = text.split(' ').filter(word => !ignored.has(word));
  if (!words.length) return [];
  return available.filter(fuse => {
    const terms = normalize(`${fuse.label} ${fuse.description}`).split(' ');
    return words.every(word => terms.some(term => term.startsWith(word)));
  });
}
