import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cargarAjustes, ESFUERZOS, guardarAjustes, MAX_INSTRUCCIONES, MODELOS, VOCES, type Ajustes } from '../ajustes';
import { fijarServidor, normalizarServidor, SERVIDOR_POR_DEFECTO, servidor } from '../servidor';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Icono } from '../ui';

function Opcion({ nombre, nota, activa, onPress }: { nombre: string; nota?: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      style={[styles.opcion, activa && styles.opcionActiva]}
    >
      <View style={styles.flex}>
        <Text style={styles.opcionNombre}>{nombre}</Text>
        {nota && <Text style={tipo.nota}>{nota}</Text>}
      </View>
      <Icono nombre={activa ? 'radiobox-marked' : 'radiobox-blank'} tono={activa ? color.acento : color.textoTenue} />
    </Pressable>
  );
}

const hostPorDefecto = SERVIDOR_POR_DEFECTO.replace(/^https?:\/\//, '');

export default function PantallaAjustes() {
  const insets = useSafeAreaInsets();
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [direccion, setDireccion] = useState('');
  const [estado, setEstado] = useState<string | null>(null);

  useEffect(() => {
    void cargarAjustes().then(setAjustes);
    void servidor().then(setDireccion);
  }, []);

  const guardarServidor = () => {
    const url = normalizarServidor(direccion);
    if (!url) {
      setEstado('Tiene que ser una dirección https://');
      return;
    }
    setDireccion(url);
    void fijarServidor(url).then(() => setEstado('Guardado'));
  };

  const usarPredeterminado = () => {
    setDireccion(SERVIDOR_POR_DEFECTO);
    void fijarServidor(null).then(() => setEstado('Guardado'));
  };

  const probarConexion = async () => {
    const url = normalizarServidor(direccion);
    if (!url) {
      setEstado('Tiene que ser una dirección https://');
      return;
    }
    setEstado('Probando...');
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), 5000);
    try {
      const res = await fetch(`${url}/api/health`, { signal: timer.signal });
      setEstado(res.ok ? 'Conectado' : 'No responde');
    } catch {
      setEstado('No responde');
    } finally {
      clearTimeout(timeout);
    }
  };

  const cambiar = (parcial: Partial<Ajustes>) => {
    if (!ajustes) return;
    const siguiente = { ...ajustes, ...parcial };
    setAjustes(siguiente);
    void guardarAjustes(siguiente);
  };

  return (
    <View style={styles.raiz}>
      <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.titulo}>Ajustes del asistente</Text>
      </View>
      {ajustes && (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + espacio.xl }]}>
          <Text style={tipo.seccion}>Modelo</Text>
          {MODELOS.map((m) => (
            <Opcion key={m.id} nombre={m.nombre} nota={m.nota} activa={ajustes.modelo === m.id} onPress={() => cambiar({ modelo: m.id })} />
          ))}

          <Text style={[tipo.seccion, styles.separado]}>Esfuerzo</Text>
          <Opcion nombre="Según el modelo" activa={ajustes.esfuerzo === null} onPress={() => cambiar({ esfuerzo: null })} />
          {ESFUERZOS.map((e) => (
            <Opcion key={e.id} nombre={e.nombre} activa={ajustes.esfuerzo === e.id} onPress={() => cambiar({ esfuerzo: e.id })} />
          ))}
          <Text style={tipo.nota}>Más esfuerzo piensa más antes de responder: respuestas más cuidadas, pero más lentas y caras.</Text>

          <Text style={[tipo.seccion, styles.separado]}>Anclaje con el modelo</Text>
          <View style={styles.opcion}>
            <Text style={[tipo.nota, styles.flex]}>
              Al fijar el mapa, Sonnet 5.5 ubica las piezas en la foto del vano. Al servidor va solo el recorte del vano.
            </Text>
            <Switch
              value={ajustes.anclajeConModelo}
              onValueChange={(v) => cambiar({ anclajeConModelo: v })}
              accessibilityLabel="Anclaje con el modelo"
              trackColor={{ true: color.acento, false: color.borde }}
            />
          </View>

          <Text style={[tipo.seccion, styles.separado]}>Voz del asistente</Text>
          <View style={styles.opcion}>
            <Text style={[tipo.nota, styles.flex]}>Leer respuestas en el modo vivo (experimental)</Text>
            <Switch
              value={ajustes.vozVivo}
              onValueChange={(v) => cambiar({ vozVivo: v })}
              accessibilityLabel="Leer respuestas en el modo vivo"
              trackColor={{ true: color.acento, false: color.borde }}
            />
          </View>
          <View style={styles.opcion}>
            <Text style={[tipo.nota, styles.flex]}>Leer respuestas en el chat (experimental)</Text>
            <Switch
              value={ajustes.vozChat}
              onValueChange={(v) => cambiar({ vozChat: v })}
              accessibilityLabel="Leer respuestas en el chat"
              trackColor={{ true: color.acento, false: color.borde }}
            />
          </View>
          <Text style={tipo.nota}>Voz</Text>
          {VOCES.map((v) => (
            <Opcion key={v.id} nombre={v.nombre} nota={v.nota} activa={ajustes.voz === v.id} onPress={() => cambiar({ voz: v.id })} />
          ))}

          <Text style={[tipo.seccion, styles.separado]}>Instrucciones del asistente</Text>
          <TextInput
            style={[styles.opcion, styles.instrucciones]}
            value={ajustes.instrucciones}
            onChangeText={(t) => cambiar({ instrucciones: t })}
            maxLength={MAX_INSTRUCCIONES}
            multiline
            placeholder="Sin instrucciones extra"
            placeholderTextColor={color.textoTenue}
            textAlignVertical="top"
            accessibilityLabel="Instrucciones del asistente"
          />
          <Text style={tipo.nota}>Se suman a las reglas del asistente en el chat y el modo vivo. Déjalo vacío para no agregar nada.</Text>

          <Text style={[tipo.seccion, styles.separado]}>Servidor</Text>
          <Text style={tipo.nota}>
            La app usa este servidor para el chat, el dictado, el historial y las patentes. Cámbialo solo si el equipo te lo pide.
          </Text>
          <TextInput
            value={direccion}
            onChangeText={(v) => {
              setDireccion(v);
              setEstado(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Dirección del servidor"
            placeholderTextColor={color.textoTenue}
            style={styles.campo}
          />
          {estado && <Text style={tipo.nota}>{estado}</Text>}
          <Pressable onPress={guardarServidor} accessibilityRole="button" style={styles.opcion}>
            <Text style={styles.opcionNombre}>Guardar</Text>
          </Pressable>
          <Pressable onPress={usarPredeterminado} accessibilityRole="button" style={styles.opcion}>
            <Text style={styles.opcionNombre}>Usar el predeterminado ({hostPorDefecto})</Text>
          </Pressable>
          <Pressable onPress={() => void probarConexion()} accessibilityRole="button" style={styles.opcion}>
            <Text style={styles.opcionNombre}>Probar conexión</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: color.fondo },
  flex: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.m,
    borderBottomWidth: 1,
    borderBottomColor: color.borde,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: color.texto },
  contenido: { padding: espacio.l, gap: espacio.s },
  separado: { marginTop: espacio.l },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    padding: espacio.m,
    borderRadius: radio.m,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
  },
  opcionActiva: { borderColor: color.acento, backgroundColor: color.acentoSuave },
  campo: {
    padding: espacio.m,
    borderRadius: radio.m,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
    fontSize: 16,
    color: color.texto,
  },
  instrucciones: { minHeight: 120, fontSize: 15, color: color.texto },
  opcionNombre: { fontSize: 16, fontWeight: '600', color: color.texto },
});
