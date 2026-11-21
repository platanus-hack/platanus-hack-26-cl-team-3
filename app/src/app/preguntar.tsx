import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MensajeAnthropic } from '../chat/contrato';
import { aVista, borrar, cargar, guardar, type Burbuja, type CitaVista, type ParteVista } from '../chat/historial';
import { turno } from '../chat/api';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Boton, Icono, Tarjeta } from '../ui';

export default function Preguntar() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const mensajes = useRef<MensajeAnthropic[]>([]);
  const [version, setVersion] = useState(0);
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [vivo, setVivo] = useState<ParteVista[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [entrada, setEntrada] = useState('');
  const [enTurno, setEnTurno] = useState(false);
  const [cita, setCita] = useState<CitaVista | null>(null);

  useEffect(() => {
    cargar().then((m) => {
      if (mensajes.current.length === 0) {
        mensajes.current = m;
        setVersion((v) => v + 1);
      }
    });
  }, []);

  const burbujas = useMemo(() => {
    const b: Burbuja[] = aVista(mensajes.current);
    if (pregunta !== null) b.push({ rol: 'user', partes: [{ texto: pregunta, citas: [] }] });
    if (vivo.length > 0) b.push({ rol: 'assistant', partes: vivo });
    return b;
  }, [version, pregunta, vivo]);

  const enviar = useCallback(async () => {
    const texto = entrada.trim();
    if (!texto || enTurno) return;
    const usuario: MensajeAnthropic = { role: 'user', content: texto };
    const previos = mensajes.current;
    const partes: ParteVista[] = [];

    setEntrada('');
    setFallo(null);
    setPregunta(texto);
    setVivo([]);
    setEstado('Pensando…');
    setEnTurno(true);

    try {
      for await (const ev of turno({ mensajes: [...previos, usuario] })) {
        if (ev.tipo === 'herramienta') {
          setEstado('Revisando la tabla de fusibles…');
        } else if (ev.tipo === 'texto') {
          setEstado(null);
          partes[ev.bloque] ??= { texto: '', citas: [] };
          partes[ev.bloque] = { ...partes[ev.bloque], texto: partes[ev.bloque].texto + ev.texto };
          setVivo(partes.filter(Boolean));
        } else if (ev.tipo === 'cita') {
          partes[ev.bloque] ??= { texto: '', citas: [] };
          const { titulo, fuente, texto_citado } = ev;
          partes[ev.bloque] = { ...partes[ev.bloque], citas: [...partes[ev.bloque].citas, { titulo, fuente, texto_citado }] };
          setVivo(partes.filter(Boolean));
        } else if (ev.tipo === 'fin') {
          mensajes.current = [...previos, usuario, ...ev.mensajes];
          void guardar(mensajes.current);
          setVersion((v) => v + 1);
          setPregunta(null);
          setVivo([]);
        } else {
          setFallo(ev.mensaje);
          setEntrada(texto);
          setPregunta(null);
          setVivo([]);
        }
      }
    } catch {
      setFallo('Error inesperado.');
      setEntrada(texto);
      setPregunta(null);
      setVivo([]);
    } finally {
      setEstado(null);
      setEnTurno(false);
    }
  }, [entrada, enTurno]);

  const nueva = useCallback(() => {
    mensajes.current = [];
    void borrar();
    setFallo(null);
    setVersion((v) => v + 1);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior="padding">
      <View style={[styles.barra, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.titulo}>Preguntar al manual</Text>
        <Pressable
          onPress={nueva}
          disabled={enTurno}
          accessibilityRole="button"
          accessibilityState={{ disabled: enTurno }}
          style={[styles.nueva, enTurno && { opacity: 0.4 }]}
        >
          <Icono nombre="square-edit-outline" tam={18} tono={color.textoSuave} />
          <Text style={styles.nuevaTexto}>Nueva conversación</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.lista}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {burbujas.length === 0 && (
          <Tarjeta estilo={styles.vacio}>
            <Icono nombre="book-open-variant" tam={26} tono={color.textoSuave} />
            <Text style={tipo.nota}>Cuéntame qué le pasa al auto. Por ejemplo: «se me quedó abajo la ventana del conductor».</Text>
          </Tarjeta>
        )}
        {burbujas.map((b, i) => (
          <BurbujaVista key={i} burbuja={b} onCita={setCita} />
        ))}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + espacio.s }]}>
        {fallo && <Text style={styles.fallo}>{fallo}</Text>}
        {estado && <Text style={styles.estado}>{estado}</Text>}
        <View style={styles.fila}>
          <TextInput
            style={[styles.input, enTurno && { opacity: 0.5 }]}
            value={entrada}
            onChangeText={setEntrada}
            editable={!enTurno}
            placeholder="Escribe tu pregunta"
            placeholderTextColor={color.textoTenue}
            multiline
            onSubmitEditing={() => void enviar()}
          />
          <Pressable
            onPress={() => void enviar()}
            disabled={enTurno || !entrada.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={[styles.enviar, (enTurno || !entrada.trim()) && { opacity: 0.4 }]}
          >
            <Icono nombre="send" tam={22} tono={color.acentoTexto} />
          </Pressable>
        </View>
      </View>

      <Modal visible={cita !== null} transparent animationType="fade" onRequestClose={() => setCita(null)}>
        <View style={styles.velo}>
          <Tarjeta estilo={styles.modal}>
            <Text style={styles.modalTitulo}>{cita?.titulo}</Text>
            <Text style={[tipo.cuerpo, { marginTop: espacio.m }]}>{cita?.texto_citado}</Text>
            <Boton texto="Cerrar" variante="secundario" onPress={() => setCita(null)} estilo={{ marginTop: espacio.l }} />
          </Tarjeta>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function BurbujaVista({ burbuja, onCita }: { burbuja: Burbuja; onCita: (c: CitaVista) => void }) {
  const mia = burbuja.rol === 'user';
  let n = 0;
  return (
    <View style={[styles.burbuja, mia ? styles.burbujaMia : styles.burbujaAsistente]}>
      <Text style={[tipo.cuerpo, mia && { color: color.acentoTexto }]}>
        {burbuja.partes.map((p, i) => (
          <Text key={i}>
            {p.texto}
            {p.citas.map((c, j) => (
              <Text key={j} style={styles.chip} onPress={() => onCita(c)} accessibilityRole="button">
                {` [${++n}]`}
              </Text>
            ))}
          </Text>
        ))}
      </Text>
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
  titulo: { flex: 1, fontSize: 17, fontWeight: '700', color: color.texto },
  nueva: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  nuevaTexto: { fontSize: 12, color: color.textoSuave, fontWeight: '600' },
  lista: { padding: espacio.l, gap: espacio.m },
  vacio: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  burbuja: { maxWidth: '88%', borderRadius: radio.l, paddingVertical: espacio.m, paddingHorizontal: espacio.l },
  burbujaMia: { alignSelf: 'flex-end', backgroundColor: color.acento },
  burbujaAsistente: { alignSelf: 'flex-start', backgroundColor: color.superficie, borderWidth: 1, borderColor: color.borde },
  chip: { color: color.acento, fontWeight: '800' },
  pie: { paddingHorizontal: espacio.l, paddingTop: espacio.s, borderTopWidth: 1, borderTopColor: color.borde, backgroundColor: color.fondo },
  estado: { fontSize: 13, color: color.textoSuave, marginBottom: espacio.s },
  fallo: { fontSize: 13, color: color.peligro, marginBottom: espacio.s },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
    borderRadius: radio.m,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    fontSize: 15,
    color: color.texto,
  },
  enviar: { width: 48, height: 48, borderRadius: radio.m, backgroundColor: color.acento, alignItems: 'center', justifyContent: 'center' },
  velo: { flex: 1, backgroundColor: color.velo, justifyContent: 'center', padding: espacio.xl },
  modal: { backgroundColor: color.superficieAlta },
  modalTitulo: { fontSize: 15, fontWeight: '700', color: color.texto },
});
