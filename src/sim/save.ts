/**
 * SaveSystem: versioned JSON saves stored in IndexedDB (with localStorage and
 * in-memory fallbacks). See SAVE_SCHEMA.md before changing GameState.
 */
import { SAVE_VERSION } from './newGame';
import { dateString } from './time';
import type { GameState } from './types';

export const SAVE_FORMAT = 'tidepool-save';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];

export interface SaveSummary {
  slot: string;
  savedAt: number;
  shopName: string;
  playerName: string;
  dateLabel: string;
  money: number;
  version: number;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  summary: SaveSummary;
  state: GameState;
}

/**
 * Migrations upgrade a raw state from version N to N+1. Never edit an
 * existing migration; add a new one and bump SAVE_VERSION.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1: (s) => ({ ...s, newField: default }),
};

export function serialize(state: GameState, slot: string): SaveFile {
  const clone: GameState = JSON.parse(JSON.stringify(state));
  // Transient data is not persisted: customers inside the shop leave on reload.
  clone.customers = [];
  for (const f of Object.values(clone.fish)) f.reservedBy = null;
  for (const t of Object.values(clone.tanks)) t.viewActive = false;
  const savedAt = Date.now();
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt,
    summary: {
      slot,
      savedAt,
      shopName: state.shopName,
      playerName: state.playerName,
      dateLabel: dateString(state.minute),
      money: state.money,
      version: SAVE_VERSION,
    },
    state: clone,
  };
}

/** Validates and migrates a parsed save file to the current version. */
export function deserialize(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file.');
  const file = raw as Partial<SaveFile>;
  if (file.format !== SAVE_FORMAT || !file.state) throw new Error('Not a Tidepool Aquatics save.');
  let v = file.version ?? 1;
  if (v > SAVE_VERSION) throw new Error(`This save is from a newer version (${v}). Please update the game.`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = file.state;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from save version ${v}.`);
    s = m(s);
    v++;
  }
  s.version = SAVE_VERSION;
  const st = s as GameState;
  if (!st.tanks || !st.fish || !Array.isArray(st.tankOrder)) throw new Error('Save file is damaged.');
  st.customers = [];
  return st;
}

// ---------------------------------------------------------------------------
// Storage adapters

export interface SaveStorage {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStorage implements SaveStorage {
  readonly kind = 'memory';
  private m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}

export class LocalStorageStorage implements SaveStorage {
  readonly kind = 'localStorage';
  async get(k: string) {
    return localStorage.getItem(`tidepool:${k}`);
  }
  async set(k: string, v: string) {
    localStorage.setItem(`tidepool:${k}`, v);
  }
  async remove(k: string) {
    localStorage.removeItem(`tidepool:${k}`);
  }
}

export class IndexedDBStorage implements SaveStorage {
  readonly kind = 'indexedDB';
  private dbp: Promise<IDBDatabase>;
  constructor(private factory: IDBFactory = indexedDB) {
    this.dbp = new Promise((resolve, reject) => {
      const req = this.factory.open('tidepool-aquatics', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const t = db.transaction('saves', mode);
      const req = fn(t.objectStore('saves'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async get(k: string) {
    const v = await this.tx<string | undefined>('readonly', (s) => s.get(k) as IDBRequest<string | undefined>);
    return v ?? null;
  }
  async set(k: string, v: string) {
    await this.tx('readwrite', (s) => s.put(v, k));
  }
  async remove(k: string) {
    await this.tx('readwrite', (s) => s.delete(k));
  }
}

/** Picks the best available storage, verifying it actually works. */
export async function createStorage(): Promise<SaveStorage> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const s = new IndexedDBStorage();
      await s.set('__probe', '1');
      await s.get('__probe');
      return s;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const s = new LocalStorageStorage();
      await s.set('__probe', '1');
      return s;
    }
  } catch {
    /* fall through */
  }
  return new MemoryStorage();
}

export class SaveManager {
  constructor(public storage: SaveStorage) {}

  async save(slot: string, state: GameState): Promise<SaveSummary> {
    const file = serialize(state, slot);
    await this.storage.set(`save:${slot}`, JSON.stringify(file));
    return file.summary;
  }

  async load(slot: string): Promise<GameState | null> {
    const raw = await this.storage.get(`save:${slot}`);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  }

  async summary(slot: string): Promise<SaveSummary | null> {
    try {
      const raw = await this.storage.get(`save:${slot}`);
      if (!raw) return null;
      const file = JSON.parse(raw) as SaveFile;
      return file.summary ?? null;
    } catch {
      return null;
    }
  }

  async list(): Promise<SaveSummary[]> {
    const out: SaveSummary[] = [];
    for (const s of SLOTS) {
      const sum = await this.summary(s);
      if (sum) out.push(sum);
    }
    return out;
  }

  async latest(): Promise<SaveSummary | null> {
    const all = await this.list();
    return all.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  }

  async remove(slot: string): Promise<void> {
    await this.storage.remove(`save:${slot}`);
  }

  exportString(state: GameState): string {
    return JSON.stringify(serialize(state, 'export'));
  }

  importString(text: string): GameState {
    return deserialize(JSON.parse(text));
  }
}
