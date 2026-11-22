import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { runTurn } from '../chat/client';
import { load, save, type ViewCard, type ViewCitation } from '../chat/history';
import { DONE_REPLY, LOST_REPLY, sendTurn, THINKING } from '../chat/turn';
import { parts, type PartId } from '../engine-maps/catalog';
import { inspectionSeconds, type InspectionAction } from '../engine-maps/inspection';
import { color, video } from '../theme';
import { LiveCaptions } from './LiveCaptions';

type Caption = { text: string; citations: ViewCitation[] };

export function useCameraGuide(initialSteps: ViewCard[], initialStep: number, onStep: (card: ViewCard) => void) {
  const [guide, setGuide] = useState({ steps: initialSteps, index: initialStep, key: 0 });
  const [caption, setCaption] = useState<Caption>({ text: initialSteps[initialStep]?.instruction ?? '', citations: [] });
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

  const ask = async (text: string, keepGuide = false) => {
    setBusy(true);
    setCaption({ text: THINKING, citations: [] });
    let spoke = false;
    let replaced: ViewCard[] = [];
    const result = await sendTurn(await load(), text, runTurn, (progress) => {
      const said = progress.parts.map((p) => p.text).join('\n');
      spoke ||= said.trim() !== '';
      setCaption({ text: spoke ? said : (progress.status ?? THINKING), citations: progress.parts.flatMap((p) => p.citations) });
      if (keepGuide || progress.cards.length === 0) return;
      if (replaced.length === 0) {
        setFocus(null);
        onStep(progress.cards[0]);
      }
      setGuide((g) => ({ steps: progress.cards, index: replaced.length ? g.index : 0, key: replaced.length ? g.key : g.key + 1 }));
      replaced = progress.cards;
    });
    if ('error' in result) setCaption({ text: result.error, citations: [] });
    else {
      if (!spoke && replaced[0]) setCaption({ text: replaced[0].instruction, citations: [] });
      await save(result.messages);
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
    setCaption({ text: next.instruction, citations: [] });
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

  return {
    steps: guide.steps, index: guide.index, current, stepKey: guide.key, caption, busy, playing, focus, finished, refilling,
    play, stop, done, lost, clearFocus,
  };
}

export function GuideCaptions({ guide }: { guide: ReturnType<typeof useCameraGuide> }) {
  const { current, caption, busy, playing, focus, finished, done, lost, clearFocus } = guide;
  if (!current) return null;
  return (
    <LiveCaptions part={current.part} text={caption.text} citations={caption.citations}>
      {playing === 'refill' && <Text style={styles.caveat}>Ilustración: no muestra el nivel real del depósito.</Text>}
      {finished ? (
        <View style={styles.row}>
          <GuideButton label="Ir al chat" primary disabled={false} onPress={() => router.back()} />
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
    </LiveCaptions>
  );
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
