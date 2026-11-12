import { describe, expect, it, beforeEach } from 'vitest';
import { buildLeague, careerFrom } from './leagueFixture';
import { useGameStore, type GameStore } from '../../../src/store/gameStore';
import type { PlayerOffer } from '../../../src/sim/career/freeAgency';
import type { CareerState } from '../../../src/sim/career/types';
import type { Player, Team } from '../../../src/sim/core/models';
import type { TeamId } from '../../../src/sim/core/types';
import type { UserDecision } from '../../../src/sim/season/resumableSeason';

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
