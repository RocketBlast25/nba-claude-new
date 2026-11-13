/**
 * Async save-slot storage backed by IndexedDB (Milestone 7, persistence v2).
 *
 * localStorage caps out near 5 MB, which a multi-season career with full box scores
 * exceeds. IndexedDB holds the full save. When `indexedDB` is unavailable (Node/jsdom
 * unit tests), slots fall back to an in-memory map so the same API still works.
 * Validation and the save format stay in `snapshot.ts`; this module is I/O only.
 */
import { parseSave, serializeSave, type CareerSave } from './snapshot';
import type { SlotId } from './slots';

const DB_NAME = 'nba-career';
const STORE = 'saves';
const DB_VERSION = 1;

export type SlotWriteResult = { ok: true } | { ok: false; error: string };

export interface AsyncSlotStorage {
  get(slot: SlotId): Promise<string | null>;
  put(slot: SlotId, value: string): Promise<void>;
  remove(slot: SlotId): Promise<void>;
}

/** In-memory fallback for environments without IndexedDB. */
export function memorySlotStorage(): AsyncSlotStorage {
  const mem = new Map<SlotId, string>();
  return {
    get: async (slot) => mem.get(slot) ?? null,
    put: async (slot, value) => void mem.set(slot, value),
    remove: async (slot) => void mem.delete(slot),
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

/** IndexedDB-backed slot storage. Opens the database lazily on first use. */
export function indexedDbSlotStorage(factory: IDBFactory): AsyncSlotStorage {
  const tx = async (mode: IDBTransactionMode) => (await openDb(factory)).transaction(STORE, mode).objectStore(STORE);
  return {
    get: async (slot) => {
      const value = await requestToPromise((await tx('readonly')).get(slot) as IDBRequest<string | undefined>);
      return value ?? null;
    },
    put: async (slot, value) => {
      await requestToPromise((await tx('readwrite')).put(value, slot));
    },
    remove: async (slot) => {
      await requestToPromise((await tx('readwrite')).delete(slot));
    },
  };
}

/** Picks IndexedDB when the browser provides it, otherwise the in-memory fallback. */
export function defaultSlotStorage(): AsyncSlotStorage {
  if (typeof indexedDB !== 'undefined') return indexedDbSlotStorage(indexedDB);
  return memorySlotStorage();
}

/** Returns the stored save for a slot, or null when the slot is empty or unreadable. */
export async function readSlotAsync(storage: AsyncSlotStorage, slot: SlotId): Promise<CareerSave | null> {
  const raw = await storage.get(slot);
  if (raw === null) return null;
  const parsed = parseSave(raw);
  return parsed.ok ? parsed.save : null;
}

/** Writes a serialized save. Reports storage failures instead of throwing. */
export async function writeSlotAsync(
  storage: AsyncSlotStorage,
  slot: SlotId,
  save: CareerSave,
): Promise<SlotWriteResult> {
  try {
    await storage.put(slot, serializeSave(save));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown storage error';
    return { ok: false, error: `Could not write ${slot}: ${message}` };
  }
}
