import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHAT_VEHICLE_ID, cameraRoute } from '../../chat/camera';
import { CitationModal } from '../../chat/CitationModal';
import { ChoiceButton, GuideChoice } from '../../chat/GuideChoice';
import { runTurn } from '../../chat/client';
import { Dictado } from '../../chat/Dictado';
import type { AnthropicMessage } from '../../chat/contract';
import { clear, load, save, toView, type Bubble, type ViewCard, type ViewCitation, type ViewPart } from '../../chat/history';
import { DONE_REPLY, LOST_REPLY, sendTurn, THINKING } from '../../chat/turn';
import { color, espacio, radio, tipo } from '../../theme';
import { BotonIcono, Icono, Tarjeta } from '../../ui';

const QUICK_REPLIES = [DONE_REPLY, LOST_REPLY];

export default function Ask() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const scroll = useRef<ScrollViewInstance>(null);
  const [messages, setMessages] = useState<AnthropicMessage[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [live, setLive] = useState<ViewPart[]>([]);
  const [liveCards, setLiveCards] = useState<ViewCard[]>([]);
  const [replies, setReplies] = useState(false);
  const openedCamera = useRef(false);
  const openedHistory = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);
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
        void load().then(setMessages);
      }
      if (openedHistory.current) {
        openedHistory.current = false;
        setReplies(false);
        void load().then(setMessages);
      }
    }, []),
  );

  const openCamera = useCallback((card: ViewCard, cards: ViewCard[]) => {
    openedCamera.current = true;
    router.push(cameraRoute(card, cards));
  }, []);

  const openHistory = useCallback(() => {
    openedHistory.current = true;
    router.push('/historial');
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
    const previous = messages;

    setInput('');
    setReplies(false);
    setNote(null);
    setError(null);
    setDictationError(null);
    setQuestion(text);
    setLive([]);
    setLiveCards([]);
    setStatus(THINKING);
    setBusy(true);

    const result = await sendTurn(previous, text, runTurn, (progress) => {
      setLive(progress.parts);
      setLiveCards(progress.cards);
      setStatus(progress.status);
    });
    if ('error' in result) {
      setError(result.error);
      setInput(text);
    } else if ('messages' in result) {
      setMessages(result.messages);
      void save(result.messages);
      if (result.truncated) setNote('La respuesta se cortó.');
    }
    setQuestion(null);
    setLive([]);
    setLiveCards([]);
    setStatus(null);
    busyRef.current = false;
    setBusy(false);
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
        <View style={styles.flex}>
          <Text style={styles.title}>Asistente</Text>
          <Text style={styles.subtitleBar}>Subaru Outback 2016, motor 3.6R</Text>
        </View>
        <BotonIcono icono="history" etiqueta="Conversaciones anteriores" onPress={openHistory} deshabilitado={busy} />
        <BotonIcono icono="square-edit-outline" etiqueta="Nueva conversación" onPress={reset} deshabilitado={busy} />
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
            <Text style={[tipo.nota, styles.flex]}>Cuéntame qué le pasa al Outback. Por ejemplo: «no sale agua del limpiaparabrisas».</Text>
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

      <View style={[styles.footer, { paddingBottom: espacio.s }]}>
        {error && <Text style={styles.error}>{error}</Text>}
        {dictationError && <Text style={styles.error}>{dictationError}</Text>}
        {status && <Text style={styles.status}>{status}</Text>}
        {note && !status && <Text style={styles.status}>{note}</Text>}
        {replies && (
          <View style={styles.replies}>
            {QUICK_REPLIES.map((reply) => (
              <ChoiceButton compacto key={reply} texto={reply} deshabilitado={busy} onPress={() => void send(reply)} />
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
          {focused && <Dictado
            deshabilitado={busy || !loaded}
            onTexto={(text) => setInput((prev) => (prev.trim() ? prev.trimEnd() + ' ' + text : text))}
            onError={(message) => setDictationError(message || null)}
          />}
          {input.trim() ? (
            <Pressable
              onPress={() => void send()}
              disabled={busy || !loaded}
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              style={[styles.send, (busy || !loaded) && { opacity: 0.4 }]}
            >
              <Icono nombre="send" tam={22} tono={color.acentoTexto} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push({ pathname: '/escanear', params: { vehicleId: CHAT_VEHICLE_ID, vivo: '1' } })}
              disabled={busy || !loaded}
              accessibilityRole="button"
              accessibilityLabel="Hablar con la cámara"
              style={[styles.send, styles.video, (busy || !loaded) && { opacity: 0.4 }]}
            >
              <Icono nombre="video" tam={22} tono={color.textoSuave} />
            </Pressable>
          )}
        </View>
      </View>

      <CitationModal citation={citation} onClose={() => setCitation(null)} />
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
  onCamera: (card: ViewCard, cards: ViewCard[]) => void;
}) {
  const mine = bubble.role === 'user';
  const uncited =
    !mine && !streaming && bubble.parts.some((p) => p.text.trim()) && bubble.parts.every((p) => p.citations.length === 0);
  let n = 0;
  const text = (
    <>
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
    </>
  );
  const guided = !mine && bubble.cards.length > 0;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAssistant, guided && styles.bubbleGuide]}>
      {guided ? (
        <GuideChoice cards={bubble.cards} disabled={streaming} onCamera={onCamera}>
          {text}
        </GuideChoice>
      ) : (
        text
      )}
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
  title: { fontSize: 17, fontWeight: '700', color: color.texto },
  subtitleBar: { fontSize: 12, color: color.textoSuave },
  list: { padding: espacio.l, gap: espacio.m },
  empty: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  bubble: { maxWidth: '88%', borderRadius: radio.l, paddingVertical: espacio.m, paddingHorizontal: espacio.l },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: color.acento },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: color.superficie, borderWidth: 1, borderColor: color.borde },
  uncited: { fontSize: 12, color: color.textoTenue, marginTop: espacio.xs },
  bubbleGuide: { alignSelf: 'stretch', maxWidth: '100%' },
  replies: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s },
  chip: { color: color.acento, fontWeight: '800' },
  footer: { paddingHorizontal: espacio.l, paddingTop: espacio.s, borderTopWidth: 1, borderTopColor: color.borde, backgroundColor: color.fondo },
  status: { fontSize: 13, color: color.textoSuave, marginBottom: espacio.s },
  error: { fontSize: 13, color: color.peligro, marginBottom: espacio.s },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 48,
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
    borderRadius: radio.m,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    fontSize: 15,
    color: color.texto,
  },
  send: { width: 40, height: 40, borderRadius: 20, margin: 4, backgroundColor: color.acento, alignItems: 'center', justifyContent: 'center' },
  video: { backgroundColor: 'transparent' },
});
