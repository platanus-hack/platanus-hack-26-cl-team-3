import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CitationModal } from '../chat/CitationModal';
import type { ViewCitation } from '../chat/history';
import { parts, type PartId } from '../engine-maps/catalog';
import { video } from '../theme';
import { captionChunks, readingMs, sourceLabel } from './captions';

export function LiveCaptions({ part, text, citations = [], children }: {
  part?: PartId;
  text: string;
  citations?: ViewCitation[];
  children?: ReactNode;
}) {
  const chunks = useMemo(() => captionChunks(text), [text]);
  const [track, setTrack] = useState({ text, shown: 0, round: 0 });
  const [open, setOpen] = useState(false);
  const shownAt = useRef(0);
  if (track.text !== text) {
    setTrack(text.startsWith(track.text) ? { ...track, text } : { text, shown: 0, round: track.round + 1 });
  }
  const shown = Math.min(track.shown, Math.max(chunks.length - 1, 0));
  const current = chunks[shown] ?? '';
  const pending = shown < chunks.length - 1;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [shown, track.round]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(
      () => setTrack((t) => ({ ...t, shown: shown + 1 })),
      Math.max(0, shownAt.current + readingMs(current) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending, shown, current, track.round]);

  const citation = citations.at(-1) ?? null;
  const label = citation ? sourceLabel(citation.title) || citation.source : '';
  return (
    <View style={styles.box}>
      {(part || citation) && (
        <View style={styles.head}>
          {part && <Text style={styles.part} numberOfLines={1}>{parts[part][0]}</Text>}
          {citation && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver cita: ${label}`} onPress={() => setOpen(true)} style={styles.source} hitSlop={8}>
              <Text style={styles.sourceText} numberOfLines={1}>{label}</Text>
            </Pressable>
          )}
        </View>
      )}
      <Text style={styles.text} numberOfLines={2} accessibilityLiveRegion="polite">{current}</Text>
      {children}
      <CitationModal citation={open ? citation : null} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: video.panel,
    borderColor: video.borde,
    borderWidth: 1,
    borderRadius: video.radio,
    padding: video.espacio,
    gap: video.espacio,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: video.espacio },
  part: { flex: 1, color: video.paso, fontSize: 13, fontWeight: '700' },
  source: {
    marginLeft: 'auto',
    maxWidth: '60%',
    borderColor: video.borde,
    borderWidth: 1,
    borderRadius: video.radio,
    paddingHorizontal: video.espacio,
    paddingVertical: 2,
  },
  sourceText: { color: video.textoSuave, fontSize: 12, fontWeight: '600' },
  text: { color: video.texto, fontSize: 17, lineHeight: 23, minHeight: 46, fontWeight: '600' },
});
