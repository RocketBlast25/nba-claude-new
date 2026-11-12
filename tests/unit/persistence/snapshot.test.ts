import { describe, expect, it } from 'vitest';
import { buildSave, parseSave, serializeSave, SAVE_VERSION, type CareerPayload } from '../../../src/persistence/snapshot';
import { readSlot, writeSlot, deleteSlot, type SlotStorage } from '../../../src/persistence/slots';

const emptyPayload: CareerPayload = {
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

function memoryStorage(opts: { failWrites?: boolean } = {}): SlotStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failWrites) throw new Error('QuotaExceededError');
      mem.set(k, v);
    },
    removeItem: (k) => void mem.delete(k),
  };
}

describe('save snapshot format', () => {
  it('round-trips a payload through JSON unchanged', () => {
    const save = buildSave(emptyPayload, new Date('2026-11-12T00:00:00Z'));
    const parsed = parseSave(serializeSave(save));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.version).toBe(SAVE_VERSION);
      expect(parsed.save.payload).toEqual(emptyPayload);
    }
  });

  it('rejects text that is not JSON', () => {
    const parsed = parseSave('{not json');
    expect(parsed.ok).toBe(false);
  });

  it('rejects an unknown save version', () => {
    const text = JSON.stringify({ ...buildSave(emptyPayload), version: 99 });
    const parsed = parseSave(text);
    expect(parsed).toMatchObject({ ok: false });
  });

  it('rejects an unknown phase', () => {
    const text = JSON.stringify({ ...buildSave(emptyPayload), payload: { ...emptyPayload, phase: 'bogus' } });
    expect(parseSave(text).ok).toBe(false);
  });

  it('rejects a malformed career', () => {
    const text = JSON.stringify({ ...buildSave(emptyPayload), payload: { ...emptyPayload, career: { season: 'x' } } });
    expect(parseSave(text).ok).toBe(false);
  });
});

describe('save slots', () => {
  it('writes, reads and deletes a slot', () => {
    const storage = memoryStorage();
    const save = buildSave(emptyPayload);
    expect(writeSlot(storage, 'slot1', save)).toEqual({ ok: true });
    expect(readSlot(storage, 'slot1')?.payload).toEqual(emptyPayload);
    deleteSlot(storage, 'slot1');
    expect(readSlot(storage, 'slot1')).toBeNull();
  });

  it('returns null for a corrupt slot instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem('nba-career:save:slot2', '{"version":1');
    expect(readSlot(storage, 'slot2')).toBeNull();
  });

  it('reports a quota failure without throwing', () => {
    const result = writeSlot(memoryStorage({ failWrites: true }), 'autosave', buildSave(emptyPayload));
    expect(result.ok).toBe(false);
  });
});
