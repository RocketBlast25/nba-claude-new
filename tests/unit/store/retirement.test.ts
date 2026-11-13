import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore, setHallOfFameStorage } from '../../../src/store/gameStore';
import { memoryHallOfFameStorage, parseHallOfFame } from '../../../src/persistence/hallOfFameStore';
import type { Player } from '../../../src/sim/core/models';
import { buildLeague, careerFrom } from './leagueFixture';

function startedPlayerCareer(seed = 7) {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id)!)
    .sort((a, b) => b.overall - a.overall);
  const player = roster[0]!;
  const result = useGameStore.getState().startPlayerCareer(player.id);
  if (!result.ok) throw new Error(result.reason);
  return player;
}

describe('awards recap state', () => {
  beforeEach(() => {
    setHallOfFameStorage(memoryHallOfFameStorage());
    useGameStore.getState().reset();
  });

  it('builds a recap when a season is played and clears it on dismiss', () => {
    const league = buildLeague(5);
    const career = careerFrom(league);
    const store = useGameStore.getState();
    store.startCareer({ career, userTeamId: career.userTeamId, seed: 5, leagueTeams: league });
    const roster = (career.rosters[career.userTeamId] ?? [])
      .map((id) => career.players.find((p) => p.id === id)!)
      .sort((a, b) => b.overall - a.overall);
    useGameStore.getState().startPlayerCareer(roster[0]!.id);
    useGameStore.getState().playSeason(league);

    const recap = useGameStore.getState().awardsRecap;
    expect(recap).not.toBeNull();

    useGameStore.getState().dismissAwardsRecap();
    expect(useGameStore.getState().awardsRecap).toBeNull();
  });
});

describe('retirement and the Hall of Fame', () => {
  beforeEach(() => {
    setHallOfFameStorage(memoryHallOfFameStorage());
    useGameStore.getState().reset();
  });

  it('locks the player career and records a Hall of Fame entry', () => {
    const player: Player = startedPlayerCareer();
    const result = useGameStore.getState().retireAndEnterHallOfFame();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.playerId).toBe(player.id);

    const state = useGameStore.getState();
    const row = state.career!.careers.find((c) => c.playerId === player.id);
    expect(row?.retired).toBe(true);
    expect(row?.retiredSeason).toBe(state.career!.season);
    expect(state.hallOfFame.map((e) => e.playerId)).toEqual([player.id]);
  });

  it('rejects a second retirement for the same career', () => {
    startedPlayerCareer();
    expect(useGameStore.getState().retireAndEnterHallOfFame().ok).toBe(true);
    const again = useGameStore.getState().retireAndEnterHallOfFame();
    expect(again.ok).toBe(false);
    expect(useGameStore.getState().hallOfFame).toHaveLength(1);
  });

  it('rejects retirement when no player career is active', () => {
    const league = buildLeague(3);
    const career = careerFrom(league);
    useGameStore.getState().startCareer({ career, userTeamId: career.userTeamId, seed: 3, leagueTeams: league });
    const result = useGameStore.getState().retireAndEnterHallOfFame();
    expect(result.ok).toBe(false);
  });

  it('persists the trophy room through the storage backend', async () => {
    const storage = memoryHallOfFameStorage();
    setHallOfFameStorage(storage);
    startedPlayerCareer();
    useGameStore.getState().retireAndEnterHallOfFame();
    await Promise.resolve();

    const saved = await storage.load();
    expect(saved).toHaveLength(1);

    useGameStore.getState().reset();
    expect(useGameStore.getState().hallOfFame).toEqual([]);
    await useGameStore.getState().loadHallOfFame();
    expect(useGameStore.getState().hallOfFame.map((e) => e.playerId)).toEqual(saved.map((e) => e.playerId));
  });

  it('drops malformed entries when reading the trophy room', () => {
    expect(parseHallOfFame('not json')).toEqual([]);
    expect(parseHallOfFame(JSON.stringify([{ playerId: 1 }, 'x']))).toEqual([]);
  });
});
