import type { FusePhoto } from '../fusibles/types';
import layout from '../../modules/capo-ar/android/src/main/assets/engine-models/outback-fuse-tray.json';

// Centers measured on the test vehicle's open tray. Slot numbers follow the Subaru
// engine-compartment diagram C00292. Unnumbered relay and spare positions are omitted.
const bounds: FusePhoto['bounds'] = {};
layout.slots.forEach(({ x, y }, index) => {
  bounds[index + 1] = { x: (x - 9.5) / layout.referenceWidth, y: (y - 16) / layout.referenceHeight, width: 19 / layout.referenceWidth, height: 32 / layout.referenceHeight };
});

export const engineFusePhoto: FusePhoto = {
  box: 'motor',
  get image() { return require('../../assets/fuses/outback-engine-tray.jpg'); },
  width: 1200,
  height: 963,
  emptySlots: layout.slots.flatMap((slot, index) => slot.finish === null ? [index + 1] : []),
  bounds,
};
