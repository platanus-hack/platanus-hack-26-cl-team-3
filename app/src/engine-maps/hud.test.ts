// npx tsx --test src/engine-maps/hud.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { engineMaps, type PartId } from './catalog';
import { hudPart } from './hud';

test('cada pieza de cada mapa llega a la vista nativa con nombre, color e ícono', () => {
  for (const [vehicle, map] of Object.entries(engineMaps)) {
    for (const { part } of map.volumes) {
      const [label, tone, icon, pin] = hudPart(part);
      assert.match(pin, /^[01]$/, `${vehicle}/${part}: punto`);
      assert.ok(label.length > 0, `${vehicle}/${part}: nombre`);
      assert.match(tone, /^#[0-9A-F]{6}$/, `${vehicle}/${part}: color`);
      // Solo comandos absolutos que Android (PathParser) y el banco entienden, con números separados.
      assert.match(icon, /^M[\dMLHVCSAZ ,.-]+Z?$/, `${vehicle}/${part}: ícono`);
    }
  }
});

test('las piezas de mantención tienen estilo propio y nombre que cabe en dos líneas', () => {
  // Las nueve piezas que revisa un conductor; las demás del modelo 3D usan el estilo por defecto.
  const maintenance: PartId[] = ['fuses', 'washer', 'dipstick', 'coolant', 'air_filter', 'oil_cap', 'brake_fluid', 'battery', 'positive'];
  const tones = new Set<string>();
  for (const part of maintenance) {
    const [label, tone, , pin] = hudPart(part);
    tones.add(tone);
    assert.equal(pin, '1', `${part} lleva punto`);
    assert.notEqual(tone, '#49D3FF', `${part} usa el color por defecto`);
    assert.ok(label.length <= 18, `${part}: «${label}» es largo para una etiqueta`);
  }
  assert.ok(tones.size >= 7, 'los colores distinguen familias de piezas');
  assert.equal(hudPart('engine_cover')[3], '0', 'las piezas que no son de mantención no llevan punto');
});
