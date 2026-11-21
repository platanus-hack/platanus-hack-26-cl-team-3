import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cameraRoute } from '../chat/camera';
import { runTurn } from '../chat/client';
import type { AnthropicMessage } from '../chat/contract';
import { clear, load, save, toCard, toView, type Bubble, type ViewCard, type ViewCitation, type ViewPart } from '../chat/history';
import { parts as catalogParts } from '../engine-maps/catalog';
import { color, espacio, radio, tipo } from '../theme';
import { BotonIcono, Boton, Icono, Tarjeta } from '../ui';

const TOOL_STATUS: Record<string, string> = {
  lookup_fuses: 'Revisando la tabla de fusibles…',
  lookup_parts: 'Buscando la pieza…',
  show_in_camera: 'Preparando la cámara…',
};
const DEFAULT_TOOL_STATUS = 'Consultando el manual…';
const QUICK_REPLIES = ['Listo, ¿qué sigue?', 'No lo encuentro'];

export default function Ask() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const [messages, setMessages] = useState<AnthropicMessage[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [live, setLive] = useState<ViewPart[]>([]);
  const [liveCards, setLiveCards] = useState<ViewCard[]>([]);
  const [replies, setReplies] = useState(false);
  const openedCamera = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [citation, setCitation] = useState<ViewCitation | null>(null);

  useEffect(() => {
    load().then((stored) => {
      setMessages((current) => current.length === 0 ? stored : current);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (openedCamera.current) {
        openedCamera.current = false;
        setReplies(true);
      }
    }, []),
  );

  const openCamera = useCallback((card: ViewCard) => {
    openedCamera.current = true;
    router.push(cameraRoute(card));
  }, []);

  const bubbles = useMemo(() => {
    const b: Bubble[] = toView(messages);
    if (question !== null) b.push({ role: 'user', parts: [{ text: question, citations: [] }], cards: [] });
    if (live.length > 0 || liveCards.length > 0) b.push({ role: 'assistant', parts: live, cards: liveCards });
    return b;
  }, [messages, question, live, liveCards]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busyRef.current || !loaded) return;
    busyRef.current = true;
    const userMessage: AnthropicMessage = { role: 'user', content: text };
    const previous = messages;
    const parts: ViewPart[] = [];
    const cards: ViewCard[] = [];
    let breakNext = false;

    setInput('');
    setReplies(false);
    setNote(null);
    setError(null);
    setQuestion(text);
    setLive([]);
    setLiveCards([]);
    setStatus('Pensando…');
    setBusy(true);

    try {
      for await (const ev of runTurn({ messages: [...previous, userMessage] })) {
        if (ev.type === 'tool') {
          setStatus(TOOL_STATUS[ev.name] ?? DEFAULT_TOOL_STATUS);
          breakNext = true;
        } else if (ev.type === 'ar') {
          const card = toCard(ev.part, ev.instruction, ev.action);
          if (card) {
            cards.push(card);
            setLiveCards([...cards]);
          }
        } else if (ev.type === 'text') {
          setStatus(null);
          if (!parts[ev.block]) {
            const first = parts.some(Boolean);
            parts[ev.block] = { text: '', citations: [], ...(breakNext && first ? { breakBefore: true } : {}) };
            breakNext = false;
          }
          parts[ev.block] = { ...parts[ev.block], text: parts[ev.block].text + ev.text };
          setLive(parts.filter(Boolean));
        } else if (ev.type === 'citation') {
          parts[ev.block] ??= { text: '', citations: [] };
          const { title, source, cited_text } = ev;
          parts[ev.block] = { ...parts[ev.block], citations: [...parts[ev.block].citations, { title, source, cited_text }] };
          setLive(parts.filter(Boolean));
        } else if (ev.type === 'done') {
          const updated = [...previous, userMessage, ...ev.messages];
          setMessages(updated);
          void save(updated);
          if (ev.truncated) setNote('La respuesta se cortó.');
          setQuestion(null);
          setLive([]);
          setLiveCards([]);
        } else {
          setError(ev.message);
          setInput(text);
          setQuestion(null);
          setLive([]);
          setLiveCards([]);
        }
      }
    } catch {
      setError('Error inesperado.');
      setInput(text);
      setQuestion(null);
      setLive([]);
      setLiveCards([]);
    } finally {
      setStatus(null);
      busyRef.current = false;
      setBusy(false);
    }
  }, [input, loaded, messages]);

  const reset = useCallback(() => {
    setMessages([]);
    void clear();
    setError(null);
    setNote(null);
    setReplies(false);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.bar, { paddingTop: insets.top + espacio.s }]}>
        <BotonIcono icono="arrow-left" etiqueta="Volver" onPress={() => router.back()} />
        <Text style={styles.title}>Manual del Subaru Outback 2016 · 3.6R</Text>
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
            <Text style={tipo.nota}>Cuéntame qué le pasa al Outback. Por ejemplo: «no sale agua del limpiaparabrisas».</Text>
          </Tarjeta>
        )}
        {bubbles.map((b, i) => (
          <BubbleView
            key={i} bubble={b} streaming={(live.length > 0 || liveCards.length > 0) && i === bubbles.length - 1}
            onCitation={setCitation}
            onCamera={openCamera}
          />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + espacio.s }]}>
        {error && <Text style={styles.error}>{error}</Text>}
        {status && <Text style={styles.status}>{status}</Text>}
        {note && !status && <Text style={styles.status}>{note}</Text>}
        {replies && (
          <View style={styles.replies}>
            {QUICK_REPLIES.map((reply) => (
              <Pressable
                key={reply}
                onPress={() => void send(reply)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={[styles.reply, busy && { opacity: 0.4 }]}
              >
                <Text style={styles.replyText}>{reply}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, (busy || !loaded) && { opacity: 0.5 }]}
            value={input}
            onChangeText={setInput}
            editable={!busy && loaded}
            placeholder="Escribe tu pregunta"
            placeholderTextColor={color.textoTenue}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
          <Pressable
            onPress={() => void send()}
            disabled={busy || !loaded || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={[styles.send, (busy || !loaded || !input.trim()) && { opacity: 0.4 }]}
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

function BubbleView({
  bubble,
  streaming,
  onCitation,
  onCamera,
}: {
  bubble: Bubble;
  streaming: boolean;
  onCitation: (c: ViewCitation) => void;
  onCamera: (card: ViewCard) => void;
}) {
  const mine = bubble.role === 'user';
  const uncited =
    !mine && !streaming && bubble.parts.some((p) => p.text.trim()) && bubble.parts.every((p) => p.citations.length === 0);
  let n = 0;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAssistant]}>
      <Text style={[tipo.cuerpo, mine && { color: color.acentoTexto }]}>
        {bubble.parts.map((p, i) => (
          <Text key={i}>
            {p.breakBefore && i > 0 ? `\n\n${p.text}` : p.text}
            {p.citations.map((c, j) => (
              <Text key={j} style={styles.chip} onPress={() => onCitation(c)} accessibilityRole="button">
                {` [${++n}]`}
              </Text>
            ))}
          </Text>
        ))}
      </Text>
      {uncited && <Text style={styles.uncited}>Sin cita del manual</Text>}
      {bubble.cards.map((card, i) => (
        <View key={i} style={styles.card}>
          <Boton
            texto={`Abrir cámara: ${catalogParts[card.part][0]}`}
            icono="camera"
            onPress={() => onCamera(card)}
            estilo={{ paddingHorizontal: espacio.m }}
          />
          <Text style={styles.cardNote}>{card.instruction}</Text>
        </View>
      ))}
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
  uncited: { fontSize: 12, color: color.textoTenue, marginTop: espacio.xs },
  card: { marginTop: espacio.m, gap: espacio.s },
  cardNote: { fontSize: 12, color: color.textoSuave, lineHeight: 17 },
  replies: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s },
  reply: {
    paddingVertical: espacio.s,
    paddingHorizontal: espacio.m,
    borderRadius: radio.l,
    backgroundColor: color.superficieAlta,
    borderWidth: 1,
    borderColor: color.borde,
  },
  replyText: { fontSize: 13, fontWeight: '600', color: color.texto },
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
