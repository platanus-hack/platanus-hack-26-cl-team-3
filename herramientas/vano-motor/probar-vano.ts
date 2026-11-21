// Pruebas de la geometría del vano y del zoom automático (app/src/detector/). Correr desde capo-ar/: app/node_modules/.bin/tsx herramientas/vano-motor/probar-vano.ts
import assert from 'node:assert/strict';
import { CELDAS, iouPoligonos, poligonoVano, tramos, Suavizador } from '../../app/src/detector/vano.ts';
import { aCuadroCompleto, COMPLETO, Encuadre, recorteAlrededor } from '../../app/src/detector/encuadre.ts';
import { completeBay, registrationCorners, sameRegistrationView } from '../../app/src/engine-maps/registration.ts';
import { engineMaps } from '../../app/src/engine-maps/catalog.ts';
import { locate, type Candidates, type Point } from '../../app/src/engine-maps/landmarks/consensus.ts';
import { confirmedPartCenters, partCenters } from '../../app/src/engine-maps/landmarks/part-centers.ts';
const n = CELDAS;
const mapa = (f: (x: number, y: number) => boolean) => { const p = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) p[y * n + x] = f(x, y) ? 0.9 : 0.1; return p; };

// 1) rectángulo interior → 4 esquinas, ninguna en el borde
let v = poligonoVano(mapa((x, y) => x >= 20 && x < 60 && y >= 30 && y < 70))!;
assert.equal(v.esquinas.length, 4); assert.equal(v.cortado, false);
assert.ok(Math.abs(v.area - (40 * 40) / (n * n)) < 1e-9);
console.log('1 ok', v.esquinas.map(e => `(${e.x.toFixed(2)},${e.y.toFixed(2)})`).join(' '));

// 2) región que sale por el borde derecho → esquinas de borde, cortado
v = poligonoVano(mapa((x, y) => x >= 50 && y >= 20 && y < 60))!;
assert.equal(v.cortado, true); assert.ok(v.esquinas.filter(e => e.borde).length >= 2);
console.log('2 ok', v.esquinas.map(e => `${e.borde ? '*' : ''}(${e.x.toFixed(2)},${e.y.toFixed(2)})`).join(' '));

// 3) ruido chico → null
assert.equal(poligonoVano(mapa((x, y) => x < 5 && y < 5)), null); console.log('3 ok');

// 4) dos regiones → la más grande
v = poligonoVano(mapa((x, y) => (x < 10 && y < 10) || (x >= 40 && x < 80 && y >= 40 && y < 80)))!;
assert.ok(v.esquinas.every(e => e.x >= 40 / n - 1e-9)); console.log('4 ok');

// 5) pentágono tipo vano (convexo, 5 esquinas) y relleno por tramos ≈ área del polígono
const pent = [[0.5, 0.1], [0.95, 0.45], [0.7, 0.95], [0.3, 0.95], [0.05, 0.42]];
const dentro = (px: number, py: number) => { let c = false; for (let i = 0, j = pent.length - 1; i < pent.length; j = i++) { const [xi, yi] = pent[i], [xj, yj] = pent[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
v = poligonoVano(mapa((x, y) => dentro((x + 0.5) / n, (y + 0.5) / n)))!;
console.log('5 esquinas:', v.esquinas.length, v.esquinas.map(e => `(${e.x.toFixed(2)},${e.y.toFixed(2)})`).join(' '));
assert.equal(v.esquinas.length, 5);
const px = v.esquinas.map(e => ({ x: e.x * 1000, y: e.y * 1000 }));
const areaTramos = tramos(px, 200).reduce((s, t) => s + (t.x1 - t.x0) * (t.alto - 0.5), 0) / 1e6;
let areaPol = 0; for (let i = 0; i < px.length; i++) { const a = px[i], b = px[(i + 1) % px.length]; areaPol += a.x * b.y - b.x * a.y; } areaPol = Math.abs(areaPol) / 2 / 1e6;
assert.ok(Math.abs(areaTramos - areaPol) < 0.01); console.log(`5 ok relleno ${areaTramos.toFixed(3)} ≈ polígono ${areaPol.toFixed(3)}`);

// 6) suavizador: media móvil de sigmoides (escena parecida: se promedia)
const s = new Suavizador(0.5); const a = s.agregar(new Float32Array([10, 10, 10, -10])); assert.ok(a[0] > 0.99);
const b = s.agregar(new Float32Array([10, 10, 10, 10])); assert.ok(Math.abs(b[3] - 0.5) < 0.01 && b[0] > 0.99); console.log('6 ok');
// 7) vano chico y lejano (pentágono reducido al 30 %) → mantiene sus 5 esquinas
const chico = pent.map(([x, y]) => [0.35 + x * 0.3, 0.35 + y * 0.3]);
const dentroChico = (px: number, py: number) => { let c = false; for (let i = 0, j = chico.length - 1; i < chico.length; j = i++) { const [xi, yi] = chico[i], [xj, yj] = chico[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
v = poligonoVano(mapa((x, y) => dentroChico((x + 0.5) / n, (y + 0.5) / n)))!;
console.log('7 esquinas:', v.esquinas.length, v.esquinas.map(e => `(${e.x.toFixed(2)},${e.y.toFixed(2)})`).join(' '));
assert.equal(v.esquinas.length, 5); console.log('7 ok');

// 8) apertura: una mancha pegada por un puente delgado NO infla el polígono
v = poligonoVano(mapa((x, y) => (x >= 20 && x < 60 && y >= 30 && y < 70) || (y >= 48 && y < 50 && x >= 60 && x < 84) || (x >= 80 && x < 86 && y >= 44 && y < 54)))!;
assert.ok(v.esquinas.every(e => e.x <= 60 / n + 1e-9), 'el puente delgado debe cortarse'); assert.equal(v.esquinas.length, 4); console.log('8 ok');

// 9) la apertura no «come» un vano cortado por el borde del cuadro
v = poligonoVano(mapa((x, y) => y >= 60))!;
assert.ok(v.cortado && v.esquinas.some(e => e.y > 0.99) && Math.abs(v.area - 28 / 88) < 1e-6); console.log('9 ok');

// 10) confianza = probabilidad media dentro de la región
assert.ok(Math.abs(v.confianza - 0.9) < 1e-6); console.log('10 ok');

// 11) el suavizador parte de cero si la escena cambió (máscaras casi disjuntas)
const s2 = new Suavizador(0.5); const L = (f: (i: number) => boolean) => Float32Array.from({ length: n * n }, (_, i) => (f(i) ? 8 : -8));
s2.agregar(L(i => i % n < 30)); const m2 = s2.agregar(L(i => i % n >= 50));
assert.ok(m2[0] < 0.01 && m2[60] > 0.99, 'sin fantasma de la posición anterior'); console.log('11 ok');

// 12) calce entre polígonos: idénticos = 1; desplazado medio ancho ≈ 1/3; lo de fuera del cuadro no cuenta
const cuad = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
assert.ok(Math.abs(iouPoligonos(cuad(0.2, 0.2, 0.6, 0.6), cuad(0.2, 0.2, 0.6, 0.6)) - 1) < 1e-9);
assert.ok(Math.abs(iouPoligonos(cuad(0.2, 0.2, 0.6, 0.6), cuad(0.4, 0.2, 0.8, 0.6)) - 1 / 3) < 0.03);
assert.ok(iouPoligonos(cuad(-0.5, 0, 0.5, 1), cuad(0, 0, 0.5, 1)) > 0.97);
assert.equal(iouPoligonos(cuad(0, 0, 0.3, 0.3), cuad(0.6, 0.6, 0.9, 0.9)), 0); console.log('12 ok');

// 13) zoom automático: sin detección recorre completo → zoom → más zoom; al detectar entrega coordenadas del cuadro completo
const enc = new Encuadre();
assert.equal(enc.recorte(), COMPLETO);
let res = enc.procesar(null); assert.ok(res.cambio && Math.abs(enc.recorte().lado - 0.6) < 1e-9);
res = enc.procesar(null); assert.ok(res.cambio && Math.abs(enc.recorte().lado - 0.4) < 1e-9);
const r04 = enc.recorte();
const vRec = poligonoVano(mapa((x, y) => x >= 22 && x < 66 && y >= 26 && y < 62))!; // vano centrado, 20 % del recorte
res = enc.procesar(vRec);
assert.ok(res.valido && res.vano && !res.cambio, 'detección válida y el recorte se mantiene');
assert.ok(Math.abs(res.vano!.area - vRec.area * 0.16) < 1e-9, 'área referida al cuadro completo');
assert.ok(Math.abs(res.vano!.esquinas[0].x - (r04.x + vRec.esquinas[0].x * 0.4)) < 1e-9);
assert.ok(!res.vano!.cortado, 'dentro del cuadro: no cortado');
console.log('13 ok', `recorte lado ${r04.lado} en (${r04.x.toFixed(2)}, ${r04.y.toFixed(2)})`);

// 14) si el vano toca el borde del recorte (no del cuadro), no es válido y el zoom se aleja
res = enc.procesar(poligonoVano(mapa((x, y) => x >= 40 && y >= 20 && y < 70))!);
assert.ok(!res.valido && res.cambio && enc.recorte().lado > 0.4 * 1.4, 'se aleja'); console.log('14 ok', `lado ${enc.recorte().lado.toFixed(2)}`);

// 15) con el cuadro completo: un vano grande mantiene el cuadro completo; uno chico acerca el zoom sobre él
const enc2 = new Encuadre();
res = enc2.procesar(poligonoVano(mapa((x, y) => x >= 10 && x < 78 && y >= 20 && y < 75))!);
assert.ok(res.valido && enc2.recorte() === COMPLETO);
res = enc2.procesar(poligonoVano(mapa((x, y) => x >= 50 && x < 70 && y >= 20 && y < 34))!); // 3,6 % del cuadro, arriba a la derecha
const rz = enc2.recorte();
assert.ok(res.cambio && rz.lado < 0.5 && rz.x < 50 / n && rz.x + rz.lado > 70 / n && rz.y < 20 / n && rz.y + rz.lado > 34 / n, 'el recorte contiene al vano');
console.log('15 ok', `lado ${rz.lado.toFixed(2)}`);

// 16) un análisis vacío no hace perder el recorte si venía viendo un vano; dos sí
const enc3 = new Encuadre(); enc3.procesar(null); enc3.procesar(null); enc3.procesar(vRec); const fijo = enc3.recorte();
assert.ok(!enc3.procesar(null).cambio && enc3.recorte() === fijo); assert.ok(enc3.procesar(null).cambio); console.log('16 ok');

// 17) recorte alrededor de un contorno anclado (para recalibrar y medir el calce con zoom)
const ra = recorteAlrededor([{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.42 }, { x: 0.4, y: 0.42 }]);
assert.ok(Math.abs(ra.lado - 0.34) < 1e-9 && Math.abs(ra.x + ra.lado / 2 - 0.5) < 1e-9 && Math.abs(ra.y + ra.lado / 2 - 0.36) < 1e-9);
assert.equal(aCuadroCompleto(vRec, COMPLETO).area, vRec.area); console.log('17 ok');

const clippedByCrop = poligonoVano(mapa((x, y) => x >= 40 && y >= 20 && y < 70))!;
assert.equal(completeBay(clippedByCrop, r04), null);
assert.equal(completeBay(clippedByCrop, COMPLETO), null);
assert.ok(completeBay(vRec, r04));
console.log('18 ok: registration requires a complete bay in the crop and sensor image');

const smallBay = completeBay(vRec, r04)!;
const referenceCorners = registrationCorners(smallBay);
const shiftedCorners = (offset: number) => referenceCorners.map((value, index) => value + (index % 2 === 0 ? offset : 0));
assert.ok(sameRegistrationView(referenceCorners, shiftedCorners(.01)));
assert.ok(sameRegistrationView(shiftedCorners(.01), shiftedCorners(.02)));
assert.ok(!sameRegistrationView(referenceCorners, shiftedCorners(.02)));
console.log('19 ok: consecutive frames cannot accumulate movement across the placement window');

const measuredBay = poligonoVano(mapa((x, y) => x >= 10 && x < 78 && y >= 12 && y < 75))!;
const aspect = .75;
const identified = partCenters(engineMaps.outback.volumes, {
  fuseLidRearLeft: [720, 200], fuseLidFrontRight: [800, 250],
  oilDipstick: [700, 540], washerCap: [1060, 200],
}, measuredBay, aspect);
assert.deepEqual(identified.map(([index]) => engineMaps.outback.volumes[index].part), ['fuses', 'dipstick']);
assert.deepEqual(confirmedPartCenters([[0, .70, .28], [2, .42, .64]], identified, measuredBay, aspect), [identified[0]]);
assert.deepEqual(confirmedPartCenters([], identified, measuredBay, aspect), []);
assert.ok(!partCenters(engineMaps.outback.volumes, { fuseLidRearLeft: [720, 200], fuseLidFrontRight: [721, 199] },
  measuredBay, aspect).length);
console.log('20 ok: reject partial or conflicting observations without changing catalog part indices');

const consensusPoints: Record<string, Point> = {
  a: [120,100], b: [430,115], c: [780,140], d: [145,345], e: [480,325],
  f: [740,305], g: [170,550], h: [470,515], i: [800,510], outlier: [530,440],
};
const hypotheses: Candidates['hypotheses'] = {};
for (const [name, [x, y]] of Object.entries(consensusPoints)) {
  const u = x / 1080;
  const v = (y + (name === 'outlier' ? 23 : 0)) / 660;
  hypotheses[name] = [[u, v], [u - .1, v + .11], [u + .1, v - .11]];
}
const appearance = Object.fromEntries(Object.entries(hypotheses).map(([name, peaks]) => [name, peaks[0]]));
const fit = locate([{ file: 'test view', width: 1080, points: consensusPoints }], {
  width: 1080, height: 660, detector_bounds: [[.09, .1], [.8, .9]],
}, { appearance, hypotheses });
assert.ok(fit);
assert.ok(fit.landmarks.i);
assert.equal(fit.landmarks.outlier, undefined);
console.log('21 ok: an appearance match rejected by projective consensus cannot adjust a part');
