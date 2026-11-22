import { withChatTurn } from '../chat/turn-queue';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FuseLinks } from '../chat/FuseLinks';
import { runTurn } from '../chat/client';
import { conversationVehicle, load, save, toView, selectConversationVehicle, type ViewFuse, type ViewCard, type ViewCitation } from '../chat/history';
import { DONE_REPLY, LOST_REPLY, sendTurn, THINKING, type TurnOptions } from '../chat/turn';
import { parts, type PartId } from '../engine-maps/catalog';
import { inspectionSeconds, type InspectionAction } from '../engine-maps/inspection';
import { color, video } from '../theme';
import { LiveCaptions } from './LiveCaptions';
import { useVivo } from './vivo/ModoVivo';
import { TarjetaVivo } from './vivo/TarjetaVivo';

type Caption = { text: string; citations: ViewCitation[]; pensando: boolean };

export function useCameraGuide(initialSteps: ViewCard[], initialStep: number, onStep: (card: ViewCard) => void, vehicleId?: string) {
  const [guide, setGuide] = useState({ steps: initialSteps, index: initialStep, key: 0 });
  const [caption, setCaption] = useState<Caption>({ text: initialSteps[initialStep]?.instruction ?? '', citations: [], pensando: false });
  const [fuses, setFuses] = useState<ViewFuse[]>([]);
  useEffect(() => {
    if (vehicleId !== 'outback') return;
    let active = true;
    void withChatTurn(async () => {
      if (((await conversationVehicle()) ?? 'outback') !== vehicleId) return;
      const previous = toView(await load()).reverse().find(bubble => bubble.fuses.length)?.fuses;
      if (active && previous) setFuses(current => current.length ? current : previous);
    }).catch(() => {});
    return () => { active = false; };
  }, [vehicleId]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<InspectionAction | null>(null);
  const [focus, setFocus] = useState<PartId | null>(null);
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const play = useCallback((action: InspectionAction, loop = false) => {
    clearTimeout(timer.current);
    setPlaying(action);
    if (!loop) timer.current = setTimeout(() => setPlaying(null), inspectionSeconds[action] * 1000);
  }, []);
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    setPlaying(null);
  }, []);

  const turn = useRef(0);
  const resetCaption = () => {
    turn.current++;
    setBusy(false);
    setCaption({ text: guide.steps[guide.index]?.instruction ?? '', citations: [], pensando: false });
  };

  const ask = async (text: string, keepGuide = false, opts?: TurnOptions) => {
    const id = ++turn.current;
    setBusy(true);
    setCaption({ text: THINKING, citations: [], pensando: true });
    let turnFuses: ViewFuse[] = [];
    let spoke = false;
    let replaced: ViewCard[] = [];
    const result = await withChatTurn(async () => {
      if (opts?.signal?.aborted) return { aborted: true } as const;
      if (opts?.vehicleId) await selectConversationVehicle(opts.vehicleId);
      const result = await sendTurn(await load(), text, runTurn, (progress) => {
        if (turn.current !== id || opts?.signal?.aborted) return;
        turnFuses = progress.fuses;
        const said = progress.parts.map((p) => p.text).join('\n');
        spoke ||= said.trim() !== '';
        setCaption({ text: spoke ? said : (progress.status ?? THINKING), citations: progress.parts.flatMap((p) => p.citations), pensando: !spoke });
        if (keepGuide || progress.cards.length === 0) return;
        if (replaced.length === 0) {
          setFocus(null);
          onStep(progress.cards[0]);
        }
        setGuide((g) => ({ steps: progress.cards, index: replaced.length ? g.index : 0, key: replaced.length ? g.key : g.key + 1 }));
        replaced = progress.cards;
      }, opts);
      if ('messages' in result) await save(result.messages);
      return result;
    }).catch(() => ({ error: 'No pude abrir la conversación. Inténtalo de nuevo.' }));
    if (turn.current !== id) return false;
    if ('aborted' in result || opts?.signal?.aborted) {
      resetCaption();
      return false;
    }
    if ('error' in result) setCaption({ text: result.error, citations: [], pensando: false });
    else {
      if (turnFuses.length) setFuses(turnFuses);
      if (!spoke && replaced[0]) setCaption({ text: replaced[0].instruction, citations: [], pensando: false });
    }
    setBusy(false);
    return !('error' in result) && replaced.length === 0;
  };

  const current = guide.steps[guide.index];
  const refilling = !finished && current?.part === 'washer' && guide.steps.slice(0, guide.index + 1).some((s) => s.action === 'refill');
  const done = () => {
    setFocus(null);
    const next = guide.steps[guide.index + 1];
    if (!next) return void ask(DONE_REPLY).then(setFinished);
    setGuide({ ...guide, index: guide.index + 1, key: guide.key + 1 });
    setCaption({ text: next.instruction, citations: [], pensando: false });
    onStep(next);
  };
  const lost = () => {
    if (current) {
      onStep(current);
      setFocus(current.part);
    }
    void ask(current ? `${LOST_REPLY}: ${parts[current.part][0]}` : LOST_REPLY, true);
  };
  const clearFocus = useCallback(() => setFocus(null), []);
  const toggleFocus = useCallback((part: PartId) => setFocus((f) => (f === part ? null : part)), []);

  return {
    steps: guide.steps, index: guide.index, current, stepKey: guide.key, fuses, caption, busy, playing, focus, finished, refilling,
    resetCaption, play, stop, done, lost, clearFocus, toggleFocus, ask,
  };
}

export function GuideCaptions({ guide }: { guide: ReturnType<typeof useCameraGuide> }) {
  const vivo = useVivo();
  const { current, caption, busy, playing, focus, finished, done, lost, clearFocus } = guide;
  const links = <FuseLinks fuses={guide.fuses} disabled={busy} />;
  if (!current && vivo) return <TarjetaVivo vivo={vivo} caption={caption}>{links}</TarjetaVivo>;
  if (!current) return caption.text || guide.fuses.length ? <LiveCaptions text={caption.text} citations={caption.citations}>{links}</LiveCaptions> : null;
  const botones = (
    <>
      {links}
      {playing === 'refill' && <Text style={styles.caveat}>Ilustración: no muestra el nivel real del depósito.</Text>}
      {finished ? (
        <View style={styles.row}>
          <GuideButton label="Ir al chat" primary disabled={false} onPress={() => router.navigate('/ask')} />
        </View>
      ) : (!playing || playing === 'refill') && (
        <View style={styles.row}>
          <GuideButton label="Listo" primary disabled={busy} onPress={done} />
          {focus ? (
            <GuideButton label="Quitar foco" disabled={false} onPress={clearFocus} />
          ) : (
            <GuideButton label="No lo encuentro" disabled={busy} onPress={lost} />
          )}
        </View>
      )}
    </>
  );
  if (vivo) return <TarjetaVivo vivo={vivo} caption={caption} part={current.part}>{botones}</TarjetaVivo>;
  return <LiveCaptions part={current.part} text={caption.text} citations={caption.citations}>{botones}</LiveCaptions>;
}

function GuideButton({ label, primary, disabled, onPress }: { label: string; primary?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed, disabled && styles.off]}
    >
      <Text style={[styles.label, primary && styles.primaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caveat: { color: video.textoSuave, fontSize: 12 },
  row: { flexDirection: 'row', gap: video.espacio },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: video.espacio,
    borderRadius: video.radio,
    borderWidth: 1,
    borderColor: video.borde,
    backgroundColor: video.control,
  },
  primary: { backgroundColor: video.paso, borderColor: video.paso },
  pressed: { backgroundColor: video.presionado, borderColor: video.presionado },
  off: { opacity: 0.5 },
  label: { color: video.texto, fontSize: 16, fontWeight: '700' },
  primaryLabel: { color: color.acentoTexto },
});
