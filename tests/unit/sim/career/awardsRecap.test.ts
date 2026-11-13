import { describe, expect, it } from 'vitest';
import { buildAwardsRecap, buildFinalsMvpBallot } from '../../../../src/sim/career/awardsRecap';
import { selectSeasonAwards } from '../../../../src/sim/career/playerMode';
import type { PlayerSeasonLine } from '../../../../src/sim/league/playerSeason';
import type { StandingRow } from '../../../../src/sim/league/standings';
import type { PlayerId, TeamId } from '../../../../src/sim/core/types';

const pid = (s: string) => s as PlayerId;
const tid = (s: string) => s as TeamId;

function line(id: string, games: number, ppg: number, rpg: number, apg: number, spg: number, bpg: number): PlayerSeasonLine {
  const averages: PlayerSeasonLine['averages'] = {
    minutes: 30,
    points: ppg,
    rebounds: rpg,
    assists: apg,
    steals: spg,
    blocks: bpg,
    turnovers: 0,
    fouls: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    ftm: 0,
    fta: 0,
  };
  return { playerId: pid(id), gamesPlayed: games, totals: { ...averages }, averages };
}

const standings: StandingRow[] = [
  { teamId: tid('A'), wins: 60, losses: 22 } as unknown as StandingRow,
  { teamId: tid('B'), wins: 40, losses: 42 } as unknown as StandingRow,
];
const teamByPlayer = new Map<PlayerId, TeamId>([
  [pid('p1'), tid('A')],
  [pid('p2'), tid('A')],
  [pid('p3'), tid('B')],
  [pid('p4'), tid('B')],
  [pid('p5'), tid('B')],
  [pid('p6'), tid('A')],
]);
const playerSeasons = [
  line('p1', 70, 30, 6, 8, 1, 1),
  line('p2', 70, 22, 9, 3, 2, 2.5),
  line('p3', 68, 18, 5, 4, 1.2, 0.5),
  line('p4', 65, 14, 4, 2, 0.8, 0.4),
  line('p5', 60, 12, 3, 1.5, 0.6, 0.3),
  line('p6', 55, 10, 2, 1, 0.5, 0.2),
];

function recapFor(userId: string) {
  const awards = selectSeasonAwards(playerSeasons, teamByPlayer, standings);
  return buildAwardsRecap({
    season: 2026,
    playerSeasons,
    teamByPlayer,
    standings,
    userPlayerId: pid(userId),
    awards,
  });
}

describe('buildAwardsRecap', () => {
  it('names the same MVP, DPOY and All-NBA winners as selectSeasonAwards', () => {
    const awards = selectSeasonAwards(playerSeasons, teamByPlayer, standings);
    const recap = recapFor('p1');
    const byKind = Object.fromEntries(recap.entries.map((e) => [e.kind, e]));
    expect(byKind.mvp?.winnerId).toBe(awards.mvp);
    expect(byKind.dpoy?.winnerId).toBe(awards.dpoy);
  });

  it('keeps the top five with shares that sum to 1 on every ballot', () => {
    const recap = recapFor('p6');
    for (const entry of recap.entries) {
      expect(entry.top).toHaveLength(5);
      const total = entry.top.reduce((sum, c) => sum + c.share, 0);
      expect(total).toBeCloseTo(1, 10);
      expect(entry.top.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('reports the controlled player rank on each ballot', () => {
    const recap = recapFor('p1');
    const mvp = recap.entries.find((e) => e.kind === 'mvp');
    expect(mvp?.winnerId).toBe(pid('p1'));
    expect(mvp?.userRank).toBe(1);
  });

  it('lists the user awards from the real award selection', () => {
    const awards = selectSeasonAwards(playerSeasons, teamByPlayer, standings);
    const recap = recapFor('p1');
    expect(recap.userAwards.includes('mvp')).toBe(awards.mvp === pid('p1'));
  });

  it('returns a null userRank for a player outside the ballot pool', () => {
    const recap = recapFor('not-in-league');
    expect(recap.entries.every((e) => e.userRank === null)).toBe(true);
    expect(recap.userAwards).toEqual([]);
  });
});

describe('buildFinalsMvpBallot', () => {
  it('ranks the champion roster by playoff points', () => {
    const ballot = buildFinalsMvpBallot({
      championRosterIds: [pid('p1'), pid('p2'), pid('p6')],
      playoffPointsByPlayer: new Map([
        [pid('p1'), 120],
        [pid('p2'), 90],
        [pid('p6'), 10],
      ]),
      userPlayerId: pid('p2'),
    });
    expect(ballot?.winnerId).toBe(pid('p1'));
    expect(ballot?.userRank).toBe(2);
  });

  it('returns null when nobody scored in the playoffs', () => {
    const ballot = buildFinalsMvpBallot({
      championRosterIds: [pid('p1')],
      playoffPointsByPlayer: new Map(),
      userPlayerId: pid('p1'),
    });
    expect(ballot).toBeNull();
  });
});
