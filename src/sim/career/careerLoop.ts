import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { applyEvent, rollOffCourtEvent } from './offCourt';
import { progressPlayer } from './progression';
import { retirementReason, type RetirementReason } from './retirement';
import { generateProspectClass } from '../league/prospects';
import { LEAGUE_CONFIG } from '../league/leagueConfig';
import { advanceTeamOffseason, signFreeAgents } from '../league/offseason';
import { buildDraftOrder } from '../league/draft';
import { payrollOf, rookieSalary } from '../league/economy';
import type { StandingRow } from '../league/standings';
import type { TeamId } from '../core/types';
import { moodSalaryModifier } from './offCourt';
import type { CareerState, OffCourtEvent, PlayerCareer } from './types';

export interface OffseasonStepResult {
  state: CareerState;
  retired: { playerId: Player['id']; reason: RetirementReason }[];
  events: OffCourtEvent[];
}

/**
 * Advances the career by one offseason. For each player, in roster order:
 * rolls an off-court event, applies its mood/chemistry effect, progresses the
 * player one year, then checks retirement. Retired players are removed from
 * `players` and marked retired in `careers`. The input state is not mutated.
 */
export function advanceCareerOffseason(state: CareerState, rng: SeededRng): OffseasonStepResult {
  const careerById = new Map(state.careers.map((c) => [c.playerId, c]));
  const players: Player[] = [];
  const careers: PlayerCareer[] = [];
  const events: OffCourtEvent[] = [];
  const retired: OffseasonStepResult['retired'] = [];

  for (const player of state.players) {
    const career = careerById.get(player.id);
    if (!career || career.retired) continue;

    let mood = career.mood;
    let chemistry = career.chemistry;
    const event = rollOffCourtEvent(player, state.season, rng);
    if (event) {
      events.push(event);
      ({ mood, chemistry } = applyEvent(mood, chemistry, event));
    }

    const progressed = progressPlayer(player, mood, rng);
    const reason = retirementReason(progressed, career.unsignedOffseasons, rng);
    if (reason) {
      retired.push({ playerId: player.id, reason });
      careers.push({ ...career, mood, chemistry, retired: true, retiredSeason: state.season });
      continue;
    }
    players.push(progressed);
    careers.push({ ...career, mood, chemistry, yearsPro: career.yearsPro + 1 });
  }

  const nextState: CareerState = {
    season: state.season + 1,
    userTeamId: state.userTeamId,
    players,
    rosters: pruneRosters(state.rosters, retired),
    careers,
    events: [...state.events, ...events],
  };
  return { state: nextState, retired, events };
}

function pruneRosters(
  rosters: CareerState['rosters'],
  retired: OffseasonStepResult['retired'],
): CareerState['rosters'] {
  const gone = new Set(retired.map((r) => r.playerId));
  const out: CareerState['rosters'] = {};
  for (const [teamId, ids] of Object.entries(rosters) as [TeamId, Player['id'][]][]) {
    out[teamId] = ids.filter((id) => !gone.has(id));
  }
  return out;
}

/** Minimum healthy roster size a team is topped up to by the replenishment safeguard. */
export const ROSTER_FLOOR = 13;
/** Overall rating a player must reach for his team to re-sign him. */
const RESIGN_OVERALL_THRESHOLD = 60;

/**
 * Roster replenishment safeguard. Any team below ROSTER_FLOOR is topped up with
 * generated walk-on prospects (unsigned-rookie fallback, rookie-scale salary),
 * never exceeding LEAGUE_CONFIG.maxRosterSize. Deterministic for a given RNG state.
 */
export function replenishRosters(state: CareerState, rng: SeededRng): CareerState {
  const players = [...state.players];
  const rosters: CareerState['rosters'] = { ...state.rosters };
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [teamId, ids] of Object.entries(rosters) as [TeamId, Player['id'][]][]) {
    let n = 0;
    while (ids.length < ROSTER_FLOOR && ids.length < LEAGUE_CONFIG.maxRosterSize) {
      const walkOn = generateProspectClass(`${teamId}-walk${++n}`, 1, rng)[0]!;
      players.push(walkOn);
      byId.set(walkOn.id, walkOn);
      ids.push(walkOn.id);
    }
    rosters[teamId] = ids;
  }
  return { ...state, players, rosters };
}

/**
 * Full offseason sequence for one league year, run after `advanceCareerOffseason`:
 *  1. tick contracts and re-sign or release each team's expiring players, with
 *     asks adjusted by player mood (moodSalaryModifier);
 *  2. build the draft order from standings and playoff exit order, then draft
 *     one class of prospects onto the picking teams' rosters;
 *  3. sign free agents to teams under the 15-player cap;
 *  4. top up any team still below ROSTER_FLOOR with walk-ons.
 * The input state is not mutated.
 */
export function runOffseasonEconomy(
  state: CareerState,
  standings: StandingRow[],
  playoffTeams: TeamId[],
  playoffExitOrder: TeamId[],
  rng: SeededRng,
): CareerState {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const moodById = new Map(state.careers.map((c) => [c.playerId, c.mood]));
  const rosters: CareerState['rosters'] = {};
  const freeAgents: Player[] = [];
  const teamIds = Object.keys(state.rosters) as TeamId[];

  // 1. Contracts: re-sign with mood-adjusted asks or release to free agency.
  for (const teamId of teamIds) {
    const roster = state.rosters[teamId]!.map((id) => byId.get(id)!).filter(Boolean);
    const result = advanceTeamOffseason(roster, RESIGN_OVERALL_THRESHOLD, rng);
    const adjusted = result.roster.map((p) => {
      const mood = moodById.get(p.id) ?? 50;
      return { ...p, contract: { ...p.contract, salary: Math.round(p.contract.salary * moodSalaryModifier(mood)) } };
    });
    rosters[teamId] = adjusted.map((p) => p.id);
    for (const p of adjusted) byId.set(p.id, p);
    freeAgents.push(...result.freeAgents);
  }

  // 2. Draft: one class sized to the draft order, picks assigned to teams.
  const order = buildDraftOrder(standings, playoffTeams, playoffExitOrder, rng);
  const draftClass = generateProspectClass(`S${state.season}`, order.length, rng);
  order.forEach((slot, i) => {
    const rookie = draftClass[i]!;
    const rookieWithContract = { ...rookie, contract: { ...rookie.contract, salary: rookieSalary(slot.pick) } };
    byId.set(rookieWithContract.id, rookieWithContract);
    rosters[slot.teamId] = [...(rosters[slot.teamId] ?? []), rookieWithContract.id];
  });

  // 3. Free agency: teams with cap space and open roster spots sign the best available.
  const pool = [...freeAgents];
  for (const teamId of teamIds) {
    const ids = rosters[teamId] ?? [];
    const payroll = payrollOf(ids.map((id) => byId.get(id)!.contract.salary));
    const { signed, remaining } = signFreeAgents(payroll, ids.length, pool, LEAGUE_CONFIG.maxRosterSize);
    for (const p of signed) {
      byId.set(p.id, p);
      ids.push(p.id);
    }
    rosters[teamId] = ids;
    pool.splice(0, pool.length, ...remaining);
  }
  // Unsigned free agents stay in the player pool so they remain on record.
  for (const p of pool) byId.set(p.id, p);

  // 4. Walk-on top-up for teams still under the floor.
  const withWalkOns = replenishRosters({ ...state, players: [...byId.values()], rosters }, rng);
  return { ...withWalkOns, season: state.season };
}

