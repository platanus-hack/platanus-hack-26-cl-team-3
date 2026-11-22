import type { ImageSourcePropType } from 'react-native';

export type FuseSlot = {
  box: string;
  number: number;
  amps: number | null;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FuseBoxGuide = {
  id: string;
  name: string;
  width: number;
  height: number;
  image?: ImageSourcePropType;
  page?: number;
  pages: string;
};

export type FusePhoto = {
  box: string;
  image: ImageSourcePropType;
  width: number;
  height: number;
  bounds: Record<number, { x: number; y: number; width: number; height: number }>;
  emptySlots: number[];
};

export type FuseGuide = {
  vehicleId: string;
  subtitle: string;
  sourceUri: string;
  manualUrl?: string;
  boxes: FuseBoxGuide[];
  slots: FuseSlot[];
  photo?: FusePhoto;
  search?: (query: string) => FuseSlot[];
};
