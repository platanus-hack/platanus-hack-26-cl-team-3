import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { cargarAjustes } from '../../ajustes';
import { crearCortador } from './frases';
import { juntarPregunta } from './pregunta';
import { useEscuchaViva } from './useEscuchaViva';
import { useVoz } from './useVoz';

type Caption = { text: string; pensando: boolean };

export type ModoVivoEstado = ReturnType<typeof useModoVivo>;

const VivoContext = createContext<ModoVivoEstado | null>(null);

export const useVivo = () => useContext(VivoContext);

export function ProveedorVivo({
  activo,
  enabled,
  capturarVano,
  preguntar,
  caption,
  busy,
  children,
}: {
  activo: boolean;
  enabled: boolean;
  caption?: Caption;
  busy?: boolean;
  capturarVano: () => Promise<string | null>;
  preguntar: (texto: string, imagen: string | null, signal: AbortSignal) => Promise<unknown>;
  children: ReactNode;
}) {
  const vivo = useModoVivo({ activo, enabled, capturarVano, preguntar, caption, busy });
  return <VivoContext.Provider value={activo ? vivo : null}>{children}</VivoContext.Provider>;
}

export function useModoVivo({
  activo,
  enabled,
  capturarVano,
  preguntar,
  caption,
  busy,
}: {
  activo: boolean;
  enabled: boolean;
  caption?: Caption;
  busy?: boolean;
  capturarVano: () => Promise<string | null>;
  preguntar: (texto: string, imagen: string | null, signal: AbortSignal) => Promise<unknown>;
}) {
  const [silenciado, setSilenciado] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [error, setError] = useState('');
  const pendiente = useRef('');
  const controlador = useRef<AbortController | null>(null);
  const vivo = useRef(true);
  const { hablando, decir, callar } = useVoz();
  const cortador = useRef(crearCortador());
  const estabaOcupado = useRef(busy);
  const [ajusteVoz, setVozVivo] = useState(false);
  const vozVivo = ajusteVoz && caption !== undefined;
  const textoCaption = caption?.text;
  const pensandoCaption = caption?.pensando ?? true;

  useEffect(() => {
    let cancelado = false;
    void cargarAjustes().then((a) => {
      if (!cancelado) setVozVivo(a.vozVivo);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!activo || !vozVivo) {
      callar();
      cortador.current.terminar();
      return;
    }
    if (textoCaption !== undefined && !pensandoCaption) decir(cortador.current.push(textoCaption));
  }, [activo, vozVivo, textoCaption, pensandoCaption, decir, callar]);

  useEffect(() => {
    if (activo && vozVivo && estabaOcupado.current && !busy) decir(cortador.current.terminar());
    if (activo && vozVivo && !estabaOcupado.current && busy) callar();
    estabaOcupado.current = busy;
  }, [activo, vozVivo, busy, decir, callar]);

  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) {
      setPregunta('');
      setError('');
      setSilenciado(false);
    }
  }

  useEffect(() => {
    vivo.current = activo;
    return () => {
      pendiente.current = '';
      vivo.current = false;
      controlador.current?.abort();
    };
  }, [activo]);

  const onInicio = useCallback(() => {
    setError('');
    controlador.current?.abort();
  }, []);

  const onFrase = useCallback(
    async (nueva: string) => {
      if (!vivo.current) return;
      const texto = juntarPregunta(pendiente.current, nueva);
      controlador.current?.abort();
      pendiente.current = texto;
      setPregunta(texto);
      const turno = new AbortController();
      controlador.current = turno;
      try {
        const imagen = await capturarVano().catch(() => null);
        if (turno.signal.aborted) return;
        await preguntar(texto, imagen, turno.signal);
      } catch {
        if (!turno.signal.aborted) setError('No pude enviar la pregunta. Inténtalo de nuevo.');
      } finally {
        if (!turno.signal.aborted) {
          pendiente.current = '';
          if (vivo.current) setPregunta('');
        }
      }
    },
    [capturarVano, preguntar],
  );

  const { estado, nivel, cerrando, parcial } = useEscuchaViva({
    silenciado: silenciado || !activo,
    pausado: hablando,
    onInicio,
    onFrase: (t) => void onFrase(t),
    onError: setError,
  });

  return {
    estado,
    nivel,
    cerrando,
    parcial,
    hablando,
    callar,
    pregunta,
    error,
    silenciado: silenciado && activo,
    alternarSilencio: () => setSilenciado((s) => !s),
  };
}
