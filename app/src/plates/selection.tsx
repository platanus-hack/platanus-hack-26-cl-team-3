import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { vehicles } from '../vehicles';
import { parseSelectedVehicle, SELECTED_VEHICLE_KEY, type SelectedVehicle } from './selected-vehicle';

export type { SelectedVehicle } from './selected-vehicle';

const Selection = createContext<{ vehicle: SelectedVehicle; setVehicle: (vehicle: SelectedVehicle) => void } | null>(null);

export function VehicleSelection({ children }: { children: ReactNode }) {
  const [vehicle, setSelected] = useState<SelectedVehicle>(vehicles[0]);
  const chosen = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_VEHICLE_KEY)
      .then((raw) => {
        const saved = parseSelectedVehicle(raw);
        if (saved && !chosen.current) setSelected(saved);
      })
      .catch(() => {});
  }, []);

  const setVehicle = useCallback((next: SelectedVehicle) => {
    chosen.current = true;
    setSelected(next);
    AsyncStorage.setItem(SELECTED_VEHICLE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return <Selection.Provider value={{ vehicle, setVehicle }}>{children}</Selection.Provider>;
}

export function useVehicleSelection() {
  const selection = useContext(Selection);
  if (!selection) throw new Error('Missing vehicle selection provider');
  return selection;
}
