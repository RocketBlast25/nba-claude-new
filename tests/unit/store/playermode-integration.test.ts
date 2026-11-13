import { describe, expect, it, beforeEach } from 'vitest';
import { buildLeague, careerFrom } from './leagueFixture';
import { useGameStore, type GameStore } from '../../../src/store/gameStore';
import type { PlayerOffer } from '../../../src/sim/career/freeAgency';
import type { CareerState } from '../../../src/sim/career/types';
import type { Player, Team } from '../../../src/sim/core/models';
import type { TeamId } from '../../../src/sim/core/types';
import type { UserDecision } from '../../../src/sim/season/resumableSeason';
import { NEW_CAREER_TEAMS } from '../../../src/sim/career/newCareer';

/**
 * Expires the controlled player's contract and drops him below the re-sign threshold,
 * so the offseason releases him to free agency and generates offers.
 */
function expireControlledPlayer(playerId: Player['id']): void {
  useGameStore.setState((s) => ({
    career: s.career && {
      ...s.career,
      players: s.career.players.map((p) =>
        p.id === playerId ? { ...p, overall: 40, contract: { ...p.contract, yearsLeft: 1 } } : p,
      ),
    },
  }));
}

/** A contract offer from a team; the shape matches the free-agency PlayerOffer. */
function makeOffer(teamId: TeamId, salary: number): PlayerOffer {
  return { teamId, salary, years: 2, teamOverall: 60, marketSize: 50, projectedRole: 'starter' };
}

/**
 * Sets the controlled player's pending offers. Pass `teams` to turn on cap validation,
 * which the store only does when team metadata is present.
 */
function setPendingOffers(offers: PlayerOffer[], teams?: Team[]): void {
  useGameStore.setState((s: GameStore): Partial<GameStore> => {
    const career = s.career;
    if (!career || !career.playerMode) return {};
    return {
      career: {
        ...career,
        ...(teams ? { teams } : {}),
        playerMode: { ...career.playerMode, pendingOffers: offers },
      },
    };
  });
}

/** Starts a career for the user's team and picks its best player as the controlled player. */
function startedPlayerCareer(seed = 42): { league: ReturnType<typeof buildLeague>; career: CareerState; player: Player } {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  useGameStore.getState().startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id)!)
    .sort((a, b) => b.overall - a.overall);
  const player = roster[0]!;
  const result = useGameStore.getState().startPlayerCareer(player.id);
  expect(result).toEqual({ ok: true });
  return { league, career, player };
}

/** Steps the resumable regular season to the end, resolving every Key Moment it pauses on. */
function playSeasonRun(): void {
  const league = useGameStore.getState().leagueTeams!;
  let result = useGameStore.getState().startSeasonRun(league);
  for (let i = 0; i < 500 && result.status !== 'finished'; i++) {
    result = result.status === 'pending'
      ? useGameStore.getState().resolveSeasonMoment({ success: true, reward: 0 })!
      : useGameStore.getState().advanceSeasonRun()!;
  }
  expect(result.status).toBe('finished');
}

/** Steps the playoff run to the Finals, resolving every Key Moment it pauses on. */
function playPlayoffsRun(): void {
  const league = useGameStore.getState().leagueTeams!;
  let result = useGameStore.getState().startPlayoffsRun(league);
  for (let i = 0; i < 500 && result.status !== 'finished'; i++) {
    result = result.status === 'pending'
      ? useGameStore.getState().resolvePlayoffMoment({ success: true, reward: 0 })!
      : useGameStore.getState().advancePlayoffsRun()!;
  }
  expect(result.status).toBe('finished');
}

describe('player mode integration', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts a player career with live mode state and objectives', () => {
    const { player } = startedPlayerCareer();
    const mode = useGameStore.getState().career?.playerMode;
    expect(mode?.playerId).toBe(player.id);
    expect(mode?.coachTrust).toBeGreaterThanOrEqual(0);
    expect(mode?.lifetimeEarnings).toBe(0);
    expect(mode?.activeObjectives.length).toBeGreaterThan(0);
    expect(mode?.pendingOffers).toEqual([]);
  });

  it('rejects starting a player career for an unknown player', () => {
    startedPlayerCareer();
    const result = useGameStore.getState().startPlayerCareer('nobody' as Player['id']);
    expect(result.ok).toBe(false);
  });

  it('plays a season, assigns objectives for the next season and keeps mode state', () => {
    const { league } = startedPlayerCareer();
    useGameStore.getState().playSeason(league);
    const afterSeason = useGameStore.getState().career?.playerMode;
    expect(afterSeason).toBeDefined();
    // Objectives are scored and cleared at season end; a new set arrives in the offseason.
    useGameStore.getState().runOffseason();
    const next = useGameStore.getState().career?.playerMode;
    expect(next?.activeObjectives.length).toBeGreaterThan(0);
  });

  it('signs a pending offer and clears the pending list', () => {
    const { league } = startedPlayerCareer();
    useGameStore.getState().playSeason(league);
    // Offer generation is covered by the free-agency unit tests; here the store's signing path is exercised.
    const offer = makeOffer(useGameStore.getState().career!.userTeamId, 1000);
    setPendingOffers([offer]);
    const signed = useGameStore.getState().signPlayerOffer(offer);
    expect(signed.ok).toBe(true);
    expect(useGameStore.getState().career?.playerMode?.pendingOffers).toEqual([]);
  });

  it('rejects an offer whose salary exceeds the team cap space', () => {
    const { league } = startedPlayerCareer();
    useGameStore.getState().playSeason(league);
    const offer = makeOffer(useGameStore.getState().career!.userTeamId, Number.MAX_SAFE_INTEGER);
    setPendingOffers([offer], []);
    const result = useGameStore.getState().signPlayerOffer(offer);
    expect(result.ok).toBe(false);
  });

  it('declines all offers and leaves no pending offers', () => {
    const { league, player } = startedPlayerCareer();
    expireControlledPlayer(player.id);
    useGameStore.getState().playSeason(league);
    useGameStore.getState().runOffseason();
    useGameStore.getState().declineAllOffers();
    expect(useGameStore.getState().career?.playerMode?.pendingOffers).toEqual([]);
  });

  it('rejects a trade request before the player is unhappy enough', () => {
    startedPlayerCareer();
    const result = useGameStore.getState().requestPlayerTrade();
    expect(result.ok).toBe(false);
  });

  it('trades the player to a valid AI roster and resets unhappySeasons', () => {
    const { career, player } = startedPlayerCareer();
    // Trade eligibility needs both the mode counter and an unsigned-offseason count on the career.
    useGameStore.setState((s) => ({
      career: s.career && {
        ...s.career,
        playerMode: { ...s.career.playerMode!, unhappySeasons: 2 },
        careers: s.career.careers.map((c) => ({ ...c, unsignedOffseasons: 2 })),
      },
    }));

    const result = useGameStore.getState().requestPlayerTrade();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = useGameStore.getState().career!;
    expect(after.playerMode?.unhappySeasons).toBe(0);
    expect(after.rosters[result.otherTeamId]).toContain(player.id);
    expect(after.rosters[career.userTeamId]).not.toContain(player.id);
    expect(result.otherTeamId).not.toBe(career.userTeamId);
  });

  it('round-trips player mode and season state through export and import', () => {
    const { league, player } = startedPlayerCareer();
    useGameStore.getState().playSeason(league);
    const before = useGameStore.getState().career?.playerMode;
    const text = useGameStore.getState().exportSave();
    expect(text).not.toBeNull();

    useGameStore.getState().reset();
    const imported = useGameStore.getState().importSave(text!);
    expect(imported).toEqual({ ok: true });

    const after = useGameStore.getState().career?.playerMode;
    expect(after?.playerId).toBe(player.id);
    expect(after).toEqual(before);
  });

  it('pauses on a user playoff game with a pending moment, survives a save/load, and resumes to a champion', () => {
    const { league } = startedPlayerCareer();
    const store = useGameStore.getState();
    // Run the regular season to completion, which produces the standings the playoffs seed from.
    store.startSeasonRun(league);
    let step = useGameStore.getState().advanceSeasonRun();
    for (let i = 0; i < 5000 && step && step.status !== 'finished'; i++) {
      step = step.status === 'pending'
        ? useGameStore.getState().resolveSeasonMoment({ success: true, reward: 0 })
        : useGameStore.getState().advanceSeasonRun();
    }
    expect(step?.status).toBe('finished');

    const paused = useGameStore.getState().startPlayoffsRun(league);
    expect(paused.status).toBe('pending');
    if (paused.status !== 'pending') return;
    expect(paused.moment.trigger).toBe('playoff_game');
    expect(paused.moment.userControlled).toBe(true);
    const userTeamId = useGameStore.getState().career!.userTeamId;
    expect([paused.moment.homeId, paused.moment.awayId]).toContain(userTeamId);

    // Save mid-playoffs, reset, and reload: the pending moment and bracket must survive.
    const text = useGameStore.getState().exportSave();
    expect(text).not.toBeNull();
    useGameStore.getState().reset();
    expect(useGameStore.getState().importSave(text!)).toEqual({ ok: true });
    expect(useGameStore.getState().playoffsRun?.pending).toEqual(paused.moment);

    // Resume with a decision and play on until the Finals finish.
    const decision: UserDecision = { success: true, reward: 0 };
    let next = useGameStore.getState().resolvePlayoffMoment(decision);
    expect(next).not.toBeNull();
    // Bounded: a stepper that stops progressing must fail the test, not hang the run.
    for (let i = 0; i < 500 && next && next.status === 'pending'; i++) {
      next = useGameStore.getState().resolvePlayoffMoment(decision);
    }
    expect(next?.status).toBe('finished');
    if (next?.status !== 'finished') return;
    expect(next.result.champion).toBeDefined();
    expect(next.result.runnerUp).toBeDefined();
  });

  it('round-trips player mode through a save slot', () => {
    const { player } = startedPlayerCareer();
    const saved = useGameStore.getState().saveToSlot('slot1');
    expect(saved).toEqual({ ok: true });

    const before = useGameStore.getState().career?.playerMode;
    useGameStore.getState().reset();
    expect(useGameStore.getState().loadFromSlot('slot1')).toBe(true);
    expect(useGameStore.getState().career?.playerMode?.playerId).toBe(player.id);
    expect(useGameStore.getState().career?.playerMode).toEqual(before);
  });
});

describe('new career lifecycle', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('generates a league, plays season and playoffs, signs in the offseason and starts Season 2', () => {
    expect(useGameStore.getState().career).toBeNull();

    const started = useGameStore.getState().startNewCareer({
      seed: 7,
      userTeamId: NEW_CAREER_TEAMS.find((t) => t.id === 'DET')!.id,
      playerName: 'Rip Hamilton',
      position: 'SG',
      archetype: 'sharpshooter',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const fresh = useGameStore.getState();
    expect(fresh.leagueTeams?.length).toBe(30);
    expect(Object.keys(fresh.career!.rosters).length).toBe(30);
    expect(fresh.career?.season).toBe(1);
    expect(fresh.career?.userTeamId).toBe(started.userTeamId);
    expect(fresh.career?.playerMode?.activeObjectives.length).toBeGreaterThan(0);
    expect(fresh.career!.rosters[started.userTeamId]).toContain(started.playerId);
    // Starting a career autosaves right away.
    expect(fresh.loadFromSlot('autosave')).toBe(true);

    playSeasonRun();
    const afterSeason = useGameStore.getState();
    expect(afterSeason.phase).toBe('playoffs');
    expect(afterSeason.season?.standings.length).toBe(30);
    expect(afterSeason.season?.gamesPlayed).toBeGreaterThan(0);
    // The season's objectives are scored and cleared when the run commits.
    expect(afterSeason.career?.playerMode?.activeObjectives).toEqual([]);
    expect(afterSeason.seasonRun?.standings?.length).toBe(30);

    playPlayoffsRun();
    const afterPlayoffs = useGameStore.getState();
    const champion = afterPlayoffs.playoffs!.champion;
    expect(champion).toBeDefined();
    expect(afterPlayoffs.playoffs!.runnerUp).not.toBe(champion);
    expect(afterPlayoffs.playoffsRun?.result?.champion).toBe(champion);
    // A title is recorded for the controlled player only when their team won it.
    const trophies = afterPlayoffs.career!.playerMode!.trophies;
    if (champion === afterPlayoffs.career!.userTeamId) {
      expect(trophies).toContainEqual({ kind: 'championship', season: 1, teamId: champion });
    } else {
      expect(trophies).toEqual([]);
    }

    // Expire the controlled player's deal and drop him below the re-sign threshold,
    // so the offseason releases him and generates free-agency offers.
    const playerId = afterPlayoffs.career!.playerMode!.playerId;
    useGameStore.setState((s) => ({
      career: s.career && {
        ...s.career,
        players: s.career.players.map((p) =>
          p.id === playerId ? { ...p, overall: 40, contract: { ...p.contract, yearsLeft: 1 } } : p,
        ),
      },
    }));
    useGameStore.getState().runOffseason();

    const offseason = useGameStore.getState();
    expect(offseason.career?.season).toBe(2);
    expect(offseason.phase).toBe('offseason');
    expect(offseason.career?.playerMode?.activeObjectives.length).toBeGreaterThan(0);
    const offers = offseason.career!.playerMode!.pendingOffers;
    expect(offers.length).toBeGreaterThan(0);

    const offer = offers[0]!;
    expect(useGameStore.getState().signPlayerOffer(offer)).toEqual({ ok: true });
    const signed = useGameStore.getState();
    expect(signed.career?.playerMode?.pendingOffers).toEqual([]);
    expect(signed.career!.rosters[offer.teamId]).toContain(playerId);
    expect(signed.phase).toBe('regular_season');

    // Season 2 is playable straight away, starting from a clean run.
    const nextRun = useGameStore.getState().startSeasonRun(useGameStore.getState().leagueTeams!);
    expect(nextRun.state.season).toBe(2);
    expect(useGameStore.getState().seasonRun?.season).toBe(2);
    expect(useGameStore.getState().season).toBeNull();
  });

  it('rejects a new career with no player name', () => {
    const result = useGameStore.getState().startNewCareer({
      seed: 1,
      playerName: '   ',
      position: 'PG',
      archetype: 'all_around',
    });
    expect(result).toEqual({ ok: false, reason: 'Enter a player name' });
    expect(useGameStore.getState().career).toBeNull();
  });
});
