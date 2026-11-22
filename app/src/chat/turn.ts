import type { runTurn } from './client';
import type { AnthropicMessage } from './contract';
import { toCard, type ViewCard, type ViewPart } from './history';

const TOOL_STATUS: Record<string, string> = {
  lookup_fuses: 'Revisando la tabla de fusibles…',
  lookup_parts: 'Buscando la pieza…',
  show_in_camera: 'Preparando la cámara…',
};
const DEFAULT_TOOL_STATUS = 'Consultando el manual…';
export const THINKING = 'Pensando…';
export const DONE_REPLY = 'Listo, ¿qué sigue?';
export const LOST_REPLY = 'No lo encuentro';

export type TurnProgress = { parts: ViewPart[]; cards: ViewCard[]; status: string | null };
export type TurnResult = { messages: AnthropicMessage[]; truncated: boolean } | { error: string } | { aborted: true };
export type TurnOptions = { image?: string; mode?: 'vivo'; signal?: AbortSignal };

export async function sendTurn(
  history: AnthropicMessage[],
  text: string,
  run: typeof runTurn,
  onProgress: (progress: TurnProgress) => void,
  opts?: TurnOptions,
): Promise<TurnResult> {
  const userMessage: AnthropicMessage = { role: 'user', content: text };
  const requestMessage: AnthropicMessage = opts?.image
    ? {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: opts.image } },
          { type: 'text', text },
        ],
      }
    : userMessage;
  const aborted = () => opts?.signal?.aborted === true;
  const parts: ViewPart[] = [];
  const cards: ViewCard[] = [];
  let status: string | null = THINKING;
  let breakNext = false;
  try {
    const request = { messages: [...history, requestMessage], ...(opts?.mode ? { mode: opts.mode } : {}), ...(opts?.signal ? { signal: opts.signal } : {}) };
    for await (const ev of run(request)) {
      if (ev.type === 'done') return { messages: [...history, userMessage, ...ev.messages], truncated: ev.truncated === true };
      if (aborted()) return { aborted: true };
      if (ev.type === 'tool') {
        status = TOOL_STATUS[ev.name] ?? DEFAULT_TOOL_STATUS;
        breakNext = true;
      } else if (ev.type === 'ar') {
        const card = toCard(ev.part, ev.instruction, ev.action);
        if (!card) continue;
        cards.push(card);
      } else if (ev.type === 'text') {
        status = null;
        if (!parts[ev.block]) {
          const first = parts.some(Boolean);
          parts[ev.block] = { text: '', citations: [], ...(breakNext && first ? { breakBefore: true } : {}) };
          breakNext = false;
        }
        parts[ev.block] = { ...parts[ev.block], text: parts[ev.block].text + ev.text };
      } else if (ev.type === 'citation') {
        parts[ev.block] ??= { text: '', citations: [] };
        const { title, source, cited_text } = ev;
        parts[ev.block] = { ...parts[ev.block], citations: [...parts[ev.block].citations, { title, source, cited_text }] };
      } else {
        return { error: ev.message };
      }
      onProgress({ parts: parts.filter(Boolean), cards: [...cards], status });
    }
  } catch {}
  if (aborted()) return { aborted: true };
  return { error: 'Error inesperado.' };
}
