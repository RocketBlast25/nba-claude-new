import { describe, expect, it, beforeEach, vi } from 'vitest';
import { buildLeague, careerFrom } from './leagueFixture';
import { useGameStore } from '../../../src/store/gameStore';

function startedStore(seed = 42) {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  useGameStore.getState().startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  return career;
}

function installMemoryLocalStorage() {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return storage;
}

describe('gameStore persistence wiring', () => {
  beforeEach(() => {
    installMemoryLocalStorage().clear();
    useGameStore.getState().reset();
  });

  it('exports a started career and imports it back into an empty store', () => {
    const career = startedStore();
    const text = useGameStore.getState().exportSave();
    expect(text).not.toBeNull();

    useGameStore.getState().reset();
    const result = useGameStore.getState().importSave(text!);
    expect(result).toEqual({ ok: true });
    expect(useGameStore.getState().career?.userTeamId).toBe(career.userTeamId);
    expect(useGameStore.getState().phase).toBe('regular_season');
  });

  it('returns null from exportSave when no career exists', () => {
    expect(useGameStore.getState().exportSave()).toBeNull();
  });

  it('leaves state unchanged when an import is invalid', () => {
    const career = startedStore();
    const result = useGameStore.getState().importSave('{"version":99}');
    expect(result.ok).toBe(false);
    expect(useGameStore.getState().career?.userTeamId).toBe(career.userTeamId);
  });

  it('saves to a slot and loads it back after a reset', async () => {
    const career = startedStore();
    expect(await useGameStore.getState().saveToSlot('slot1')).toEqual({ ok: true });

    useGameStore.getState().reset();
    expect(useGameStore.getState().career).toBeNull();
    expect(await useGameStore.getState().loadFromSlot('slot1')).toBe(true);
    expect(useGameStore.getState().career?.userTeamId).toBe(career.userTeamId);
  });

  it('autosaves on a phase transition', async () => {
    startedStore();
    useGameStore.getState().setPhase('draft');
    // The autosave write is asynchronous; wait for the phase-transition save to settle.
    await vi.waitFor(() => {
      expect(useGameStore.getState().autosavedAt).not.toBeNull();
    });
    useGameStore.getState().reset();
    expect(await useGameStore.getState().loadFromSlot('autosave')).toBe(true);
    expect(useGameStore.getState().phase).toBe('draft');
  });

  it('returns false when loading an empty slot', async () => {
    expect(await useGameStore.getState().loadFromSlot('slot3')).toBe(false);
  });
});
