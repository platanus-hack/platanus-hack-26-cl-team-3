import { engineFusePhoto } from '../engine-maps/outback-fuse-photo';
import { findOutbackFuses, outbackFuseBoxes, outbackFuseManualUrl, outbackFuses } from '../engine-maps/outback-fuses';
import type { FuseGuide } from './types';

export const outbackFuseGuide: FuseGuide = {
  vehicleId: 'outback',
  subtitle: 'Outback 2016 · 3.6R · Norteamérica',
  sourceUri: 'fusibles://outback-2016-3.6r',
  manualUrl: outbackFuseManualUrl,
  boxes: [
    {
      id: 'cabina', name: 'Habitáculo', width: outbackFuseBoxes.cabina.width, height: outbackFuseBoxes.cabina.height,
      get image() { return require('../../assets/engine-maps/outback-cabin-fuses.png'); },
      page: outbackFuseBoxes.cabina.page, pages: outbackFuseBoxes.cabina.pages,
    },
    {
      id: 'motor', name: 'Motor', width: outbackFuseBoxes.motor.width, height: outbackFuseBoxes.motor.height,
      get image() { return require('../../assets/engine-maps/outback-engine-fuses.png'); },
      page: outbackFuseBoxes.motor.page, pages: outbackFuseBoxes.motor.pages,
    },
  ],
  slots: [...outbackFuses],
  photo: engineFusePhoto,
  search: findOutbackFuses,
};
