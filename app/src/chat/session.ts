import type { AnthropicMessage } from './contract';
import type AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'capo-ar:chat-v1';
const ID_KEY = 'capo-ar:chat-id:v1';
const VEHICLE_KEY = 'capo-ar:chat-vehicle:v1';

const FILE_KEY = 'capo-ar:chat-file:v1';
// Keep large native transcripts outside Android SQLite's per-row CursorWindow.
const INLINE_CHARACTERS = 256 * 1024;
type HistoryFiles = { read: (slot: string) => Promise<string>; write: (slot: string, raw: string) => Promise<void> };

const SEED_KEY = 'capo-ar:chat-request-seed:v1';
export type Snapshot = { messages: AnthropicMessage[]; vehicle: string | null; id: string | null; seed: string; generation: number };

export function createHistory(
  storage: () => Promise<Pick<typeof AsyncStorage, 'multiGet' | 'multiSet' | 'multiRemove' | 'setItem' | 'getItem'>>,
  makeSeed: () => Promise<string>,
  fetchConversation: typeof import('./remote-history').fetchConversation,
  files?: HistoryFiles,
) {
  let generation = 0;
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();

  function serialized<T>(operation: () => Promise<T>) {
    const result = queue.then(operation);
    queue = result.then(() => {}, () => {});
    return result;
  }

  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  };
  const notify = () => listeners.forEach(callback => callback());
  const current = (snapshot: Snapshot) => snapshot.generation === generation;

  function snapshot(): Promise<Snapshot> {
    const at = generation;
    return serialized(async () => {
      const store = await storage();
      const values = Object.fromEntries(await store.multiGet([KEY, ID_KEY, VEHICLE_KEY, SEED_KEY, FILE_KEY]));
      const slot = values[FILE_KEY];
      const raw = files && slot ? await files.read(slot) : values[KEY];
      const messages = JSON.parse(raw || '[]');
      if (!Array.isArray(messages)) throw new Error('Invalid chat history');
      let seed = values[SEED_KEY] || values[ID_KEY];
      if (!seed) {
        seed = await makeSeed();
        await store.setItem(SEED_KEY, seed);
      }
      return { messages, vehicle: values[VEHICLE_KEY] || null, id: values[ID_KEY] || null, seed, generation: at };
    });
  }

  async function write(messages: AnthropicMessage[], metadata: [string, string][]) {
    const raw = JSON.stringify(messages);
    const store = await storage();
    if (files && raw.length > INLINE_CHARACTERS) {
      const slot = (await store.getItem(FILE_KEY)) === '1' ? '2' : '1';
      await files.write(slot, raw);
      await store.multiSet([[KEY, ''], [FILE_KEY, slot], ...metadata]);
    } else {
      await store.multiSet([[KEY, raw], [FILE_KEY, ''], ...metadata]);
    }
  }

  function commit(base: Snapshot, messages: AnthropicMessage[], vehicle: string, id: string | null) {
    return serialized(async () => {
      if (!current(base)) return false;
      await write(messages, [[VEHICLE_KEY, vehicle], [ID_KEY, id ?? '']]);
      if (!current(base)) return false;
      generation++;
      notify();
      return true;
    });
  }

  function clear() {
    generation++;
    return serialized(async () => {
      await (await storage()).multiRemove([KEY, ID_KEY, VEHICLE_KEY, SEED_KEY, FILE_KEY]);
      notify();
    });
  }

  async function open(id: string): Promise<AnthropicMessage[] | null> {
    const at = ++generation;
    return serialized(async () => {
      if (at !== generation) return null;
      const conversation = await fetchConversation(id);
      if (!conversation || at !== generation) return null;
      const { messages, vehicle_id } = conversation;
      await write(messages, [[ID_KEY, id], [VEHICLE_KEY, vehicle_id ?? ''], [SEED_KEY, id]]);
      notify();
      return messages;
    });
  }

  return { subscribe, current, snapshot, commit, clear, open };
}
