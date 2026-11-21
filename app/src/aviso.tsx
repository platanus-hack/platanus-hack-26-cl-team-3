import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Texto validado con el equipo (README, sección 9, regla 1). No cambiar sin acordarlo.
export const AVISO =
  'Esta app es una guía informativa. No reemplaza el manual del propietario ni a un mecánico. ' +
  'Confirma siempre con el manual de tu vehículo antes de actuar.';

// Si cambia el texto del aviso, sube la versión para volver a pedir la aceptación.
const CLAVE = 'capo-ar:aviso-aceptado:v1';

type Estado = { cargado: boolean; aceptado: boolean; aceptar: () => void };
const Contexto = createContext<Estado>({ cargado: false, aceptado: false, aceptar: () => {} });

export function ProveedorAviso({ children }: { children: ReactNode }) {
  const [cargado, setCargado] = useState(false);
  const [aceptado, setAceptado] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((v) => setAceptado(v === '1'))
      .catch(() => setAceptado(false)) // si falla el almacenamiento, se vuelve a mostrar: mejor de más que de menos
      .finally(() => setCargado(true));
  }, []);

  const aceptar = useCallback(() => {
    setAceptado(true);
    AsyncStorage.setItem(CLAVE, '1').catch(() => {});
  }, []);

  return <Contexto.Provider value={{ cargado, aceptado, aceptar }}>{children}</Contexto.Provider>;
}

export const useAviso = () => useContext(Contexto);
