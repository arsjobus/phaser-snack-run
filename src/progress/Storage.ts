/** The slice of `localStorage` the game uses, so tests (and private browsing) can swap it. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A store that lives only as long as the page: the fallback when `localStorage` is unavailable. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

// `defaultStore()` is called by several scenes. Keep one fallback instance so progress survives
// scene changes for the lifetime of the page when browser storage is unavailable.
const memoryStore = new MemoryStore();

/**
 * `localStorage` when it works (it can throw in private windows or when blocked), otherwise an
 * in-memory store: progress then lasts for the session instead of crashing the game.
 */
export function defaultStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__snack-run-probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // fall through to memory
  }
  return memoryStore;
}
