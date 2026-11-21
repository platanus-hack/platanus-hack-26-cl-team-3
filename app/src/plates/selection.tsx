import { createContext, useContext, useState, type ReactNode } from 'react';
import { vehicles } from '../vehicles';

export type SelectedVehicle = { id: string; name: string; year: number | null; engine: string };

const Selection = createContext<{ vehicle: SelectedVehicle; setVehicle: (vehicle: SelectedVehicle) => void } | null>(null);

export function VehicleSelection({ children }: { children: ReactNode }) {
  const [vehicle, setVehicle] = useState<SelectedVehicle>(vehicles[0]);
  return <Selection.Provider value={{ vehicle, setVehicle }}>{children}</Selection.Provider>;
}

export function useVehicleSelection() {
  const selection = useContext(Selection);
  if (!selection) throw new Error('Missing vehicle selection provider');
  return selection;
}
