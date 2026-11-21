import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runTurn } from '../chat/client';
import type { AnthropicMessage } from '../chat/contract';
import { clear, load, save, toView, type Bubble, type ViewCitation, type ViewPart } from '../chat/history';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Boton, Icono, Tarjeta } from '../ui';

export default function Ask() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const messages = useRef<AnthropicMessage[]>([]);
  const [version, setVersion] = useState(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [live, setLive] = useState<ViewPart[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [citation, setCitation] = useState<ViewCitation | null>(null);

  useEffect(() => {
    load().then((loaded) => {
      if (messages.current.length === 0) {
        messages.current = loaded;
        setVersion((v) => v + 1);
      }
    });
  }, []);

  const bubbles = useMemo(() => {
    const b: Bubble[] = toView(messages.current);
    if (question !== null) b.push({ role: 'user', parts: [{ text: question, citations: [] }] });
    if (live.length > 0) b.push({ role: 'assistant', parts: live });
    return b;
  }, [version, question, live]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMessage: AnthropicMessage = { role: 'user', content: text };
    const previous = messages.current;
    const parts: ViewPart[] = [];

    setInput('');
    setError(null);
    setQuestion(text);
    setLive([]);
    setStatus('Pensando…');
    setBusy(true);

    try {
      for await (const ev of runTurn({ messages: [...previous, userMessage] })) {
        if (ev.type === 'tool') {
          setStatus('Revisando la tabla de fusibles…');
        } else if (ev.type === 'text') {
          setStatus(null);
          parts[ev.block] ??= { text: '', citations: [] };
          parts[ev.block] = { ...parts[ev.block], text: parts[ev.block].text + ev.text };
          setLive(parts.filter(Boolean));
        } else if (ev.type === 'citation') {
          parts[ev.block] ??= { text: '', citations: [] };
          const { title, source, cited_text } = ev;
          parts[ev.block] = { ...parts[ev.block], citations: [...parts[ev.block].citations, { title, source, cited_text }] };
          setLive(parts.filter(Boolean));
        } else if (ev.type === 'done') {
          messages.current = [...previous, userMessage, ...ev.messages];
          void save(messages.current);
          setVersion((v) => v + 1);
          setQuestion(null);
          setLive([]);
        } else {
          setError(ev.message);
          setInput(text);
          setQuestion(null);
          setLive([]);
        }
      }
    } catch {
      setError('Error inesperado.');
      setInput(text);
      setQuestion(null);
      setLive([]);
    } finally {
      setStatus(null);
      setBusy(false);
    }
  }, [input, busy]);

  const reset = useCallback(() => {
    messages.current = [];
    void clear();
    setError(null);
    setVersion((v) => v + 1);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.bar, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.title}>Preguntar al manual</Text>
        <Pressable
          onPress={reset}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={[styles.newChat, busy && { opacity: 0.4 }]}
        >
          <Icono nombre="square-edit-outline" tam={18} tono={color.textoSuave} />
          <Text style={styles.newText}>Nueva conversación</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {bubbles.length === 0 && (
          <Tarjeta estilo={styles.empty}>
            <Icono nombre="book-open-variant" tam={26} tono={color.textoSuave} />
            <Text style={tipo.nota}>Cuéntame qué le pasa al auto. Por ejemplo: «se me quedó abajo la ventana del conductor».</Text>
          </Tarjeta>
        )}
        {bubbles.map((b, i) => (
          <BubbleView key={i} bubble={b} onCitation={setCitation} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + espacio.s }]}>
        {error && <Text style={styles.error}>{error}</Text>}
        {status && <Text style={styles.status}>{status}</Text>}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, busy && { opacity: 0.5 }]}
            value={input}
            onChangeText={setInput}
            editable={!busy}
            placeholder="Escribe tu question"
            placeholderTextColor={color.textoTenue}
            multiline
            onSubmitEditing={() => void send()}
          />
          <Pressable
            onPress={() => void send()}
            disabled={busy || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={[styles.send, (busy || !input.trim()) && { opacity: 0.4 }]}
          >
            <Icono nombre="send" tam={22} tono={color.acentoTexto} />
          </Pressable>
        </View>
      </View>

      <Modal visible={citation !== null} transparent animationType="fade" onRequestClose={() => setCitation(null)}>
        <View style={styles.overlay}>
          <Tarjeta estilo={styles.modal}>
            <Text style={styles.modalTitle}>{citation?.title}</Text>
            <Text style={[tipo.cuerpo, { marginTop: espacio.m }]}>{citation?.cited_text}</Text>
            <Boton texto="Cerrar" variante="secundario" onPress={() => setCitation(null)} estilo={{ marginTop: espacio.l }} />
          </Tarjeta>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function BubbleView({ bubble, onCitation }: { bubble: Bubble; onCitation: (c: ViewCitation) => void }) {
  const mine = bubble.role === 'user';
  let n = 0;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAssistant]}>
      <Text style={[tipo.cuerpo, mine && { color: color.acentoTexto }]}>
        {bubble.parts.map((p, i) => (
          <Text key={i}>
            {p.text}
            {p.citations.map((c, j) => (
              <Text key={j} style={styles.chip} onPress={() => onCitation(c)} accessibilityRole="button">
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
  root: { flex: 1, backgroundColor: color.fondo },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.m,
    borderBottomWidth: 1,
    borderBottomColor: color.borde,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: color.texto },
  newChat: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  newText: { fontSize: 12, color: color.textoSuave, fontWeight: '600' },
  list: { padding: espacio.l, gap: espacio.m },
  empty: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  bubble: { maxWidth: '88%', borderRadius: radio.l, paddingVertical: espacio.m, paddingHorizontal: espacio.l },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: color.acento },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: color.superficie, borderWidth: 1, borderColor: color.borde },
  chip: { color: color.acento, fontWeight: '800' },
  footer: { paddingHorizontal: espacio.l, paddingTop: espacio.s, borderTopWidth: 1, borderTopColor: color.borde, backgroundColor: color.fondo },
  status: { fontSize: 13, color: color.textoSuave, marginBottom: espacio.s },
  error: { fontSize: 13, color: color.peligro, marginBottom: espacio.s },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s },
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
  send: { width: 48, height: 48, borderRadius: radio.m, backgroundColor: color.acento, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: color.velo, justifyContent: 'center', padding: espacio.xl },
  modal: { backgroundColor: color.superficieAlta },
  modalTitle: { fontSize: 15, fontWeight: '700', color: color.texto },
});
