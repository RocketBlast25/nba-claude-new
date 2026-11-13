import { describe, expect, it } from 'vitest';
import { buildSave, type CareerPayload } from '../../../src/persistence/snapshot';
import {
  indexedDbSlotStorage,
  memorySlotStorage,
  readSlotAsync,
  writeSlotAsync,
} from '../../../src/persistence/idbSlots';

const basePayload: CareerPayload = {
  career: null,
  phase: 'regular_season',
  userTeamId: null,
  seed: 7,
  season: null,
  playoffs: null,
  draftOrder: [],
  leagueTeams: null,
  pendingMoments: [],
  resolvedMoments: [],
};

/** A payload whose serialized save is well over the 5 MB localStorage limit. */
function oversizedPayload(): CareerPayload {
  const chunk = 'x'.repeat(10_000);
  const moments = Array.from({ length: 700 }, (_, i) => ({ id: `m${i}`, note: chunk }));
  return { ...basePayload, resolvedMoments: moments as unknown as CareerPayload['resolvedMoments'] };
}

/** Minimal in-memory IDBFactory covering the open/get/put/delete calls the adapter uses. */
function fakeIndexedDb(): IDBFactory {
  const data = new Map<string, unknown>();
  const request = <T>(run: () => T, after?: () => void) => {
    const req = {} as IDBRequest<T>;
    queueMicrotask(() => {
      Object.assign(req, { result: run() });
      req.onsuccess?.(new Event('success'));
      after?.();
    });
    return req;
  };
  const store = {
    get: (key: string) => request(() => data.get(key)),
    put: (value: unknown, key: string) => request(() => void data.set(key, value)),
    delete: (key: string) => request(() => void data.delete(key)),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
  };
  return {
    open: () => {
      const req = { result: db } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => req.onsuccess?.(new Event('success')));
      return req;
    },
  } as unknown as IDBFactory;
}

describe('async slot storage', () => {
  it('round-trips a save larger than 5 MB through the IndexedDB adapter', async () => {
    const storage = indexedDbSlotStorage(fakeIndexedDb());
    const save = buildSave(oversizedPayload(), new Date('2026-11-13T00:00:00Z'));

    const written = await writeSlotAsync(storage, 'autosave', save);
    expect(written).toEqual({ ok: true });

    const raw = await storage.get('autosave');
    expect(raw!.length).toBeGreaterThan(5 * 1024 * 1024);

    const loaded = await readSlotAsync(storage, 'autosave');
    expect(loaded?.payload).toEqual(save.payload);
  });

  it('round-trips a large save through the in-memory fallback', async () => {
    const storage = memorySlotStorage();
    const save = buildSave(oversizedPayload());
    expect(await writeSlotAsync(storage, 'slot1', save)).toEqual({ ok: true });
    expect((await readSlotAsync(storage, 'slot1'))?.payload).toEqual(save.payload);
  });

  it('reports a failed write instead of throwing', async () => {
    const storage = memorySlotStorage();
    storage.put = async () => {
      throw new Error('QuotaExceededError');
    };
    const result = await writeSlotAsync(storage, 'autosave', buildSave(basePayload));
    expect(result.ok).toBe(false);
  });

  it('returns null for an empty slot', async () => {
    expect(await readSlotAsync(memorySlotStorage(), 'slot2')).toBeNull();
  });
});
