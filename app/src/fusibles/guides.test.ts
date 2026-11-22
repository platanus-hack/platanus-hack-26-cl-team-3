import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fuseGuideFor, fuseGuides, searchFuses } from './guides';

const dir = new URL('../../../api/src/data/fuses/', import.meta.url);
type Row = { box: string; number: number; amps: number | null; circuit: string };
type Table = { boxes: Record<string, unknown>; source_uri: string; fuses: Row[] };
const table = (id: string): Table => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
const tableIds = readdirSync(dir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort();

test('every vehicle with a guide has an api table and the other way around', () => {
  assert.deepEqual(Object.keys(fuseGuides).sort(), tableIds);
});

for (const [id, guide] of Object.entries(fuseGuides)) {
  test(`${id}: the guide matches the api table`, () => {
    const { boxes, source_uri, fuses } = table(id);
    assert.equal(guide.vehicleId, id);
    assert.equal(guide.sourceUri, source_uri);
    assert.deepEqual(guide.boxes.map(box => box.id).sort(), Object.keys(boxes).sort());
    assert.equal(guide.slots.length, fuses.length);
    for (const row of fuses) {
      const slot = guide.slots.find(item => item.box === row.box && item.number === row.number);
      assert.ok(slot, `${row.box} ${row.number}`);
      assert.equal(slot.amps, row.amps);
      assert.equal(slot.label, row.circuit);
    }
  });

  test(`${id}: every slot is inside its box canvas and does not overlap another`, () => {
    for (const box of guide.boxes) {
      const slots = guide.slots.filter(item => item.box === box.id);
      assert.ok(slots.length > 0, box.id);
      slots.forEach((fuse, i) => {
        assert.ok(fuse.x >= 0 && fuse.y >= 0 && fuse.width > 0 && fuse.height > 0, `${box.id} ${fuse.number}`);
        assert.ok(fuse.x + fuse.width <= 1.0001 && fuse.y + fuse.height <= 1.0001, `${box.id} ${fuse.number}`);
        for (const other of slots.slice(i + 1)) {
          assert.ok(fuse.x + fuse.width <= other.x + 1e-9 || other.x + other.width <= fuse.x + 1e-9 ||
            fuse.y + fuse.height <= other.y + 1e-9 || other.y + other.height <= fuse.y + 1e-9, `${box.id} ${fuse.number}/${other.number}`);
        }
      });
    }
    if (guide.photo) assert.ok(guide.boxes.some(box => box.id === guide.photo!.box));
  });
}

test('fuseGuideFor only answers for vehicles with a guide', () => {
  assert.equal(fuseGuideFor('outback'), fuseGuides.outback);
  assert.equal(fuseGuideFor('ram700'), undefined);
  assert.equal(fuseGuideFor('toString'), undefined);
  assert.equal(fuseGuideFor(undefined), undefined);
});

test('searchFuses uses the guide search and falls back to accent-insensitive substrings', () => {
  assert.deepEqual(searchFuses(fuseGuides.outback, 'ventana del conductor').map(f => f.number), [11, 24]);
  const generic = { ...fuseGuides.outback, search: undefined };
  assert.deepEqual(searchFuses(generic, 'ILUMINACION').map(f => [f.box, f.number]), [['motor', 3]]);
  assert.deepEqual(searchFuses(generic, 'hazard').map(f => f.label), ['HAZARD']);
  assert.deepEqual(searchFuses(generic, 'xinventado'), []);
});
