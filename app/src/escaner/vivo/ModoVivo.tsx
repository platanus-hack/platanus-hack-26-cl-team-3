import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, espacio, radio } from '../../theme';
import { Icono } from '../../ui';
import { juntarPregunta } from './pregunta';
import { useEscuchaViva, type EstadoEscucha } from './useEscuchaViva';

const ETIQUETA: Record<EstadoEscucha, string> = {
  escuchando: 'Te escucho',
  oyendo: '…',
  transcribiendo: 'Transcribiendo…',
  silenciado: 'Micrófono silenciado',
};

export function ModoVivo({
  capturarVano,
  preguntar,
}: {
  capturarVano: () => Promise<string | null>;
  preguntar: (texto: string, imagen: string | null, signal: AbortSignal) => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const [silenciado, setSilenciado] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState('');
  const pendiente = useRef('');
  const controlador = useRef<AbortController | null>(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      controlador.current?.abort();
    };
  }, []);

  const onInicio = useCallback(() => {
    setError('');
    controlador.current?.abort();
  }, []);

  const onFrase = useCallback(
    async (nueva: string) => {
      const texto = juntarPregunta(pendiente.current, nueva);
      controlador.current?.abort();
      pendiente.current = texto;
      const turno = new AbortController();
      controlador.current = turno;
      setPensando(true);
      try {
        const imagen = await capturarVano().catch(() => null);
        if (turno.signal.aborted) return;
        await preguntar(texto, imagen, turno.signal);
      } finally {
        if (!turno.signal.aborted) pendiente.current = '';
        if (vivo.current && controlador.current === turno) setPensando(false);
      }
    },
    [capturarVano, preguntar],
  );

  const estado = useEscuchaViva({ silenciado, onInicio, onFrase: (t) => void onFrase(t), onError: setError });
  const etiqueta = estado === 'escuchando' && pensando ? 'Pensando…' : ETIQUETA[estado];

  return (
    <View pointerEvents="box-none" style={[styles.barra, { top: insets.top + espacio.s }]}>
      <View style={styles.pildora}>
        <Text style={styles.texto}>{error || etiqueta}</Text>
      </View>
      <Pressable
        onPress={() => setSilenciado((s) => !s)}
        accessibilityRole="button"
        accessibilityLabel={silenciado ? 'Reactivar micrófono' : 'Silenciar micrófono'}
        style={styles.boton}
      >
        <Icono nombre={silenciado ? 'microphone-off' : 'microphone'} tam={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { position: 'absolute', left: espacio.m, right: espacio.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espacio.s },
  pildora: { paddingHorizontal: espacio.m, paddingVertical: espacio.s, borderRadius: radio.xl, backgroundColor: color.velo },
  texto: { color: color.texto, fontSize: 14, fontWeight: '700' },
  boton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.velo },
});
