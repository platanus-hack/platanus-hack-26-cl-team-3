import layout from '../../modules/capo-ar/android/src/main/assets/engine-models/outback-fuse-tray.json';

type Bounds = { x: number; y: number; width: number; height: number };

// Centers measured on the test vehicle's open tray. Slot numbers follow the Subaru
// engine-compartment diagram C00292. Unnumbered relay and spare positions are omitted.
const bounds: Record<number, Bounds> = {};
layout.slots.forEach(({ x, y }, index) => {
  bounds[index + 1] = { x: (x - 9.5) / layout.referenceWidth, y: (y - 16) / layout.referenceHeight, width: 19 / layout.referenceWidth, height: 32 / layout.referenceHeight };
});

export const engineFusePhoto = {
  image: require('../../assets/fuses/outback-engine-tray.jpg'),
  width: 1200,
  height: 963,
  emptySlots: layout.slots.flatMap((slot, index) => slot.finish === null ? [index + 1] : []),
  bounds,
};
