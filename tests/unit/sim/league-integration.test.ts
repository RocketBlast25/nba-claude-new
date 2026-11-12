import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import type { Player } from '../../../src/sim/core/models';
import { generateRoster } from '../../../src/sim/league/roster';
import { simulateSeason } from '../../../src/sim/league/season';
import { simulateGame, toSimPlayer, type SimTeam } from '../../../src/sim/background/gameSim';
import { runPlayoffs, type GameRunner } from '../../../src/sim/league/playoffs';
import { buildDraftOrder } from '../../../src/sim/league/draft';
import { generateProspectClass } from '../../../src/sim/league/prospects';
import { rookieSalary, payrollOf } from '../../../src/sim/league/economy';
import { advanceTeamOffseason, signFreeAgents, tickContracts } from '../../../src/sim/league/offseason';
import { LEAGUE_CONFIG } from '../../../src/sim/league/leagueConfig';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';

const TEAM_COUNT = 30;
const ROSTER_SIZE = 14;

/** Builds 30 teams split 15/15 by conference, each with a seeded roster. */
function buildLeague(rng: SeededRng) {
  const teams: (ScheduleTeam & { sim: SimTeam; roster: Player[] })[] = [];
  for (let i = 0; i < TEAM_COUNT; i++) {
    const id = makeId<'team'>(`T${String(i).padStart(2, '0')}`) as TeamId;
    const roster = generateRoster(id, ROSTER_SIZE, rng.fork());
    const sim: SimTeam = {
      id,
      pace: 100,
      offRating: 110,
      defRating: 110,
      players: roster.map(toSimPlayer),
    };
    teams.push({
      id,
      conference: i < 15 ? 'East' : 'West',
      division: i < 15 ? (i < 5 ? 'Atlantic' : i < 10 ? 'Central' : 'Southeast') : i < 20 ? 'Northwest' : 'Pacific',
      sim,
      roster,
    });
  }
  return teams;
}

describe('end-to-end Milestone 5 cycle (real gameSim)', () => {
  it('runs season -> playoffs -> draft -> offseason deterministically', () => {
    const run = () => {
      const rng = new SeededRng(2026);
      const league = buildLeague(rng.fork());

      // 1. Regular season with the real game engine.
      const season = simulateSeason(league, rng.fork());
      expect(season.gamesPlayed).toBe(1230);
      expect(season.standings).toHaveLength(TEAM_COUNT);

      // 2. Playoffs using the real game engine for every game.
      const simById = new Map(league.map((t) => [t.id, t.sim]));
      const playGame: GameRunner = (home, away, gameRng) => {
        const h = simById.get(home);
        const a = simById.get(away);
        if (!h || !a) throw new Error('playoffs: unknown team');
        const result = simulateGame(makeId<'game'>('playoff') as never, h, a, gameRng);
        return result.home.points > result.away.points;
      };
      const playoffs = runPlayoffs(season.standings, playGame, rng.fork());
      expect(playoffs.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
      expect(playoffs.exitOrder).toHaveLength(16);
      expect(playoffs.exitOrder[15]).toBe(playoffs.champion);
      expect(playoffs.exitOrder[14]).toBe(playoffs.runnerUp);

      // 3. Draft: 30 unique picks, playoff teams picking after the lottery teams.
      const playoffTeams = new Set(playoffs.exitOrder);
      const draft = buildDraftOrder(season.standings, [...playoffTeams], playoffs.exitOrder, rng.fork());
      expect(draft).toHaveLength(LEAGUE_CONFIG.draftRounds);
      expect(new Set(draft.map((p) => p.teamId)).size).toBe(TEAM_COUNT);
      const prospects = generateProspectClass('2027', 30, rng.fork());
      const rookies = draft.map((p, i) => ({
        ...prospects[i]!,
        contract: { salary: rookieSalary(p.pick), yearsLeft: 4, type: 'rookie' as const },
        teamId: p.teamId,
      }));

      // 4. Offseason: expirations, re-signings, and free agency per team.
      const offseasonRng = rng.fork();
      const freeAgents: Player[] = [];
      const rosters = new Map<TeamId, Player[]>();
      for (const team of league) {
        const { roster, freeAgents: fa } = advanceTeamOffseason(team.roster, 60, offseasonRng.fork());
        rosters.set(team.id, roster);
        freeAgents.push(...fa);
      }
      // Each team takes its rookies, then signs free agents within the roster cap and cap space.
      for (const rookie of rookies) {
        const roster = rosters.get(rookie.teamId as TeamId) ?? [];
        roster.push(rookie as Player);
      }
      const signings = new Map<TeamId, number>();
      for (const team of league) {
        const roster = rosters.get(team.id) ?? [];
        const payroll = payrollOf(roster.map((p) => p.contract.salary));
        const result = signFreeAgents(payroll, roster.length, freeAgents, 2);
        roster.push(...result.signed);
        signings.set(team.id, result.signed.length);
      }
      return {
        champion: playoffs.champion,
        draftIds: draft.map((p) => `${p.pick}:${p.teamId}`),
        rosterSizes: league.map((t) => rosters.get(t.id)?.length ?? 0),
        signings: [...signings.values()],
        expiring: tickContracts(league[0]!.roster).expiring.length,
      };
    };

    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.draftIds).toHaveLength(30);
    for (const size of first.rosterSizes) {
      expect(size).toBeLessThanOrEqual(LEAGUE_CONFIG.maxRosterSize);
    }
  }, 60_000);
});
