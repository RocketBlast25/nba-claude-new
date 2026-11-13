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

  it('autosaves mid-season progress and restores the exact games played and record', async () => {
    const league = buildLeague(42);
    const career = careerFrom(league);
    useGameStore.getState().startCareer({ career, userTeamId: career.userTeamId, seed: 42, leagueTeams: league });
    useGameStore.getState().startSeasonRun(league);
    // Advance a few steps only, so the save lands mid-season rather than at the end.
    let step = useGameStore.getState().advanceSeasonRun();
    for (let i = 0; i < 3 && step?.status === 'pending'; i++) {
      step = useGameStore.getState().resolveSeasonMoment({ success: true, reward: 0 });
    }
    const run = useGameStore.getState().seasonRun;
    expect(run).not.toBeNull();
    const gamesBefore = run!.outcomes.length;
    expect(gamesBefore).toBeGreaterThan(0);
    // A user win is a game the user's team played at home and won, or played away and lost-at-home.
    const winsOf = (outcomes: { homeId: string; awayId: string; homeWon: boolean }[]) =>
      outcomes.filter((o) =>
        o.homeId === career.userTeamId ? o.homeWon : o.awayId === career.userTeamId && !o.homeWon,
      ).length;
    const wins = winsOf(run!.outcomes);

    // The autosave is debounced; wait for the mid-season write to land, then reload it cold.
    await vi.waitFor(() => {
      expect(useGameStore.getState().autosavedAt).not.toBeNull();
    });
    useGameStore.getState().reset();
    expect(await useGameStore.getState().loadFromSlot('autosave')).toBe(true);
    const restored = useGameStore.getState().seasonRun;
    expect(restored?.outcomes.length).toBe(gamesBefore);
    expect(winsOf(restored!.outcomes)).toBe(wins);
  });

  it('returns false when loading an empty slot', async () => {
    expect(await useGameStore.getState().loadFromSlot('slot3')).toBe(false);
  });
});
