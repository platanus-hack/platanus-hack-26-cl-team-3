import { uuid } from 'expo';

import { runTurn } from './client';
import { commit, current, snapshot } from './history';
import { sendTurn, type TurnOptions, type TurnProgress, type TurnResult } from './turn';

let active: { signal?: AbortSignal; finished: Promise<void> } | null = null;

export async function activeTurn(text: string, selectedVehicle: string, progress: (event: TurnProgress) => void,
  options?: TurnOptions): Promise<TurnResult> {
  while (active?.signal?.aborted) await active.finished;
  if (options?.signal?.aborted) return { aborted: true };
  if (active) return { error: 'Hay una respuesta en curso.' };
  let release!: () => void;
  active = { signal: options?.signal, finished: new Promise(resolve => { release = resolve; }) };
  try {
    const base = await snapshot();
    if (!current(base) || options?.signal?.aborted) return { aborted: true };
    const vehicle = base.vehicle ?? (base.messages.length ? 'outback' : selectedVehicle);
    const requestId = uuid.v5(JSON.stringify([base.messages.length, text, vehicle, options?.mode]), base.seed);
    let id = base.id;
    const result = await sendTurn(base.messages, text, async function* (args) {
      for await (const event of runTurn({ ...args, conversationId: base.id, vehicleId: vehicle, requestId })) {
        if (event.type === 'done' && event.conversationId) id = event.conversationId;
        yield event;
      }
    }, event => { if (current(base)) progress(event); }, options);
    if (!current(base)) return { aborted: true };
    if ('messages' in result && !await commit(base, result.messages, vehicle, id)) return { aborted: true };
    return result;
  } catch {
    return { error: 'No se pudo leer o guardar la conversación. Inténtalo de nuevo.' };
  } finally {
    active = null;
    release();
  }
}
