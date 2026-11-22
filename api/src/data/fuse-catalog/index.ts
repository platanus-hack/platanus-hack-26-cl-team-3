import { findOutbackFuses, outbackFuseGuide, type FuseBox } from './outback';

export type FuseSlot = {
  box: FuseBox;
  number: number | string;
  amps: number | null;
  label: string;
  description: string;
};

export type FuseCatalog = {
  edition: string;
  title: string;
  pages: Record<FuseBox, string>;
  search(query: string, box?: FuseBox): readonly FuseSlot[];
};

const outback: FuseCatalog = {
  edition: 'outback-2016-3.6r',
  title: 'Subaru Outback 2016 · Norteamérica · MSA5M1603C',
  pages: { cabin: outbackFuseGuide.cabin.pages, engine: outbackFuseGuide.engine.pages },
  search: findOutbackFuses,
};

// Register only editions verified for the vehicle profile.
const catalogs = new Map([['outback', outback]]);
export const catalogForVehicle = (vehicle: string) => catalogs.get(vehicle);

export const fuseSource = (catalog: FuseCatalog, slot: FuseSlot) =>
  `fusibles://${catalog.edition}/${slot.box}/${slot.number}`;


export function resolveFuseSource(source: string) {
  for (const [vehicle, catalog] of catalogs) {
    const prefix = `fusibles://${catalog.edition}/`;
    if (!source.startsWith(prefix)) continue;
    const [box, position, extra] = source.slice(prefix.length).split('/');
    if ((box !== 'engine' && box !== 'cabin') || !position || extra !== undefined) return null;
    const slot = catalog.search(position, box).find(row => String(row.number) === position);
    return slot ? { vehicle, slot } : null;
  }
  return null;
}
