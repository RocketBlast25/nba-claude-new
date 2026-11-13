/**
 * Persistent Hall of Fame / Retired Legends list (trophy room).
 *
 * Stored in the same IndexedDB database as the career saves, under its own key, so a
 * retired legacy outlives any single save slot or a reset. Falls back to memory when
 * IndexedDB is unavailable (Node/jsdom tests). The entries are validated on read so a
 * damaged record never breaks the trophy room.
 */
import type { HallOfFameEntry } from '../sim/career/hallOfFame';

const DB_NAME = 'nba-career';
const STORE = 'saves';
const DB_VERSION = 1;
const KEY = 'hall-of-fame';

export interface HallOfFameStorage {
  load(): Promise<HallOfFameEntry[]>;
  save(entries: HallOfFameEntry[]): Promise<void>;
}

/** In-memory fallback for environments without IndexedDB. */
export function memoryHallOfFameStorage(): HallOfFameStorage {
  let value: HallOfFameEntry[] = [];
  return {
    load: async () => value,
    save: async (entries) => {
      value = entries;
    },
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
  });
  return dbPromise;
}

function isEntry(value: unknown): value is HallOfFameEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<HallOfFameEntry>;
  return typeof v.playerId === 'string' && typeof v.name === 'string' && typeof v.goatRank === 'number';
}

/** Parses a stored value, dropping anything that is not a well-formed entry. */
export function parseHallOfFame(raw: unknown): HallOfFameEntry[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** IndexedDB-backed Hall of Fame storage. Opens the database lazily on first use. */
export function indexedDbHallOfFameStorage(factory: IDBFactory): HallOfFameStorage {
  const store = async (mode: IDBTransactionMode) => (await openDb(factory)).transaction(STORE, mode).objectStore(STORE);
  return {
    load: async () => parseHallOfFame(await requestToPromise((await store('readonly')).get(KEY))),
    save: async (entries) => {
      await requestToPromise((await store('readwrite')).put(JSON.stringify(entries), KEY));
    },
  };
}

/** Picks IndexedDB when the browser provides it, otherwise the in-memory fallback. */
export function defaultHallOfFameStorage(): HallOfFameStorage {
  if (typeof indexedDB !== 'undefined') return indexedDbHallOfFameStorage(indexedDB);
  return memoryHallOfFameStorage();
}
