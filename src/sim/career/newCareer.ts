import type { Player, Position, Team } from '../core/models';
import { makeId, type PlayerId, type TeamId } from '../core/types';
import { SeededRng } from '../core/random';
import { generateRoster } from '../league/roster';
import { toSimPlayer, type SimTeam } from '../background/gameSim';
import type { ScheduleTeam } from '../league/schedule';
import { LEAGUE_CONFIG } from '../league/leagueConfig';
import { capSpace, payrollOf } from '../league/economy';
import { createPlayerCareerMode, deriveRole } from './playerMode';
import { assignSeasonObjectives } from './keyMomentTriggers';
import { createCustomPlayer, type ArchetypeId } from './customPlayer';
import type { CareerState, PlayerCareer, PlayerModeState } from './types';

/** One of the 30 franchises a fresh career can use. */
export interface NewCareerTeam {
  id: TeamId;
  city: string;
  name: string;
  conference: 'East' | 'West';
  division: string;
  /** 0 to 100. Larger markets offer a small free-agency premium. */
  marketSize: number;
}

const team = (
  id: string,
  city: string,
  name: string,
  conference: 'East' | 'West',
  division: string,
  marketSize: number,
): NewCareerTeam => ({ id: makeId<'team'>(id), city, name, conference, division, marketSize });

/** The league a fresh career starts in: 30 teams, in a fixed order. */
export const NEW_CAREER_TEAMS: NewCareerTeam[] = [
  team('BOS', 'Boston', 'Celtics', 'East', 'Atlantic', 80),
  team('BKN', 'Brooklyn', 'Nets', 'East', 'Atlantic', 85),
  team('NYK', 'New York', 'Knicks', 'East', 'Atlantic', 95),
  team('PHI', 'Philadelphia', '76ers', 'East', 'Atlantic', 75),
  team('TOR', 'Toronto', 'Raptors', 'East', 'Atlantic', 60),
  team('CHI', 'Chicago', 'Bulls', 'East', 'Central', 80),
  team('CLE', 'Cleveland', 'Cavaliers', 'East', 'Central', 55),
  team('DET', 'Detroit', 'Pistons', 'East', 'Central', 50),
  team('IND', 'Indiana', 'Pacers', 'East', 'Central', 45),
  team('MIL', 'Milwaukee', 'Bucks', 'East', 'Central', 45),
  team('ATL', 'Atlanta', 'Hawks', 'East', 'Southeast', 60),
  team('CHA', 'Charlotte', 'Hornets', 'East', 'Southeast', 40),
  team('MIA', 'Miami', 'Heat', 'East', 'Southeast', 70),
  team('ORL', 'Orlando', 'Magic', 'East', 'Southeast', 45),
  team('WAS', 'Washington', 'Wizards', 'East', 'Southeast', 50),
  team('DEN', 'Denver', 'Nuggets', 'West', 'Northwest', 55),
  team('MIN', 'Minnesota', 'Timberwolves', 'West', 'Northwest', 50),
  team('OKC', 'Oklahoma City', 'Thunder', 'West', 'Northwest', 40),
  team('POR', 'Portland', 'Trail Blazers', 'West', 'Northwest', 45),
  team('UTA', 'Utah', 'Jazz', 'West', 'Northwest', 40),
  team('GSW', 'Golden State', 'Warriors', 'West', 'Pacific', 85),
  team('LAC', 'Los Angeles', 'Clippers', 'West', 'Pacific', 80),
  team('LAL', 'Los Angeles', 'Lakers', 'West', 'Pacific', 95),
  team('PHX', 'Phoenix', 'Suns', 'West', 'Pacific', 60),
  team('SAC', 'Sacramento', 'Kings', 'West', 'Pacific', 45),
  team('DAL', 'Dallas', 'Mavericks', 'West', 'Southwest', 60),
  team('HOU', 'Houston', 'Rockets', 'West', 'Southwest', 55),
  team('MEM', 'Memphis', 'Grizzlies', 'West', 'Southwest', 40),
  team('NOP', 'New Orleans', 'Pelicans', 'West', 'Southwest', 40),
  team('SAS', 'San Antonio', 'Spurs', 'West', 'Southwest', 50),
];

/** Players generated per team. One roster spot is left open for the user's rookie. */
export const NEW_CAREER_ROSTER_SIZE = 13;

export interface NewCareerOptions {
  seed: number;
  /** Team the user controls. Defaults to the first team in NEW_CAREER_TEAMS. */
  userTeamId?: TeamId;
  playerName: string;
  position: Position;
  archetype: ArchetypeId;
}

export interface NewCareer {
  career: CareerState;
  /** Schedule metadata plus sim ratings, in the shape the season and playoff runs take. */
  leagueTeams: (ScheduleTeam & { sim: SimTeam })[];
  userTeamId: TeamId;
  playerId: PlayerId;
  seed: number;
}

/** Roster ids sorted by overall, highest first, then id for a stable order. */
function byOverallDesc(ids: PlayerId[], byId: Map<PlayerId, Player>): PlayerId[] {
  return [...ids].sort((a, b) => {
    const diff = (byId.get(b)?.overall ?? 0) - (byId.get(a)?.overall ?? 0);
    if (diff !== 0) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Builds a complete new career from scratch: a deterministic 30-team league with
 * generated rosters, team metadata and rotations, the user's custom rookie on their
 * chosen team, player-mode state with Season 1 objectives, and the sim teams the
 * schedule and playoff runs need. The same options always produce the same league.
 *
 * Pure: no store, no React, no DOM. Throws on an unknown team or an empty name.
 */
export function createNewCareer(options: NewCareerOptions): NewCareer {
  const seed = Math.max(0, Math.trunc(options.seed));
  const userTeamId = options.userTeamId ?? NEW_CAREER_TEAMS[0]!.id;
  if (!NEW_CAREER_TEAMS.some((t) => t.id === userTeamId)) {
    throw new Error(`createNewCareer: unknown team ${userTeamId}`);
  }
  if (options.playerName.trim().length === 0) {
    throw new Error('createNewCareer: player name is required');
  }

  const rng = new SeededRng(seed);
  const players: Player[] = [];
  const rosters: Record<TeamId, PlayerId[]> = {};
  const rotations: Record<TeamId, PlayerId[]> = {};
  const teams: Team[] = [];

  for (const t of NEW_CAREER_TEAMS) {
    const roster = generateRoster(t.id, NEW_CAREER_ROSTER_SIZE, rng.fork());
    players.push(...roster);
    const ids = byOverallDesc(
      roster.map((p) => p.id),
      new Map(roster.map((p) => [p.id, p])),
    );
    rosters[t.id] = ids;
    rotations[t.id] = ids.slice(0, LEAGUE_CONFIG.rotation.maxPlayed);
    const payroll = payrollOf(roster.map((p) => p.contract.salary));
    teams.push({
      id: t.id,
      city: t.city,
      name: t.name,
      conference: t.conference,
      division: t.division,
      marketSize: t.marketSize,
      rosterIds: ids,
      starterIds: rotations[t.id]!.slice(0, LEAGUE_CONFIG.rotation.starters),
      chemistry: 50,
      coachTrust: 50,
      fanPopularity: 50,
      payroll,
      capSpace: capSpace(payroll),
      luxuryTaxPaid: 0,
    });
  }

  const playerId = makeId<'player'>(`user-rookie-${seed}`);
  const rookie = createCustomPlayer({
    id: playerId,
    name: options.playerName,
    position: options.position,
    archetype: options.archetype,
  });
  players.push(rookie);

  const byId = new Map(players.map((p) => [p.id, p]));
  rosters[userTeamId] = byOverallDesc([...(rosters[userTeamId] ?? []), playerId], byId);
  rotations[userTeamId] = rosters[userTeamId]!.slice(0, LEAGUE_CONFIG.rotation.maxPlayed);

  const userTeam = teams.find((t) => t.id === userTeamId)!;
  const userPayroll = payrollOf(rosters[userTeamId]!.map((id) => byId.get(id)!.contract.salary));
  userTeam.rosterIds = rosters[userTeamId]!;
  userTeam.starterIds = rotations[userTeamId]!.slice(0, LEAGUE_CONFIG.rotation.starters);
  userTeam.payroll = userPayroll;
  userTeam.capSpace = capSpace(userPayroll);

  const careers: PlayerCareer[] = players.map((p) => ({
    playerId: p.id,
    yearsPro: 0,
    mood: 50,
    chemistry: 50,
    unsignedOffseasons: 0,
    retired: false,
    retiredSeason: null,
  }));

  const rosterRank = rosters[userTeamId]!.indexOf(playerId) + 1;
  const role = deriveRole({
    rosterRank,
    overall: rookie.overall,
    isStarter: rosterRank <= LEAGUE_CONFIG.rotation.starters,
  });
  const playerMode: PlayerModeState = {
    ...createPlayerCareerMode(rookie),
    lifetimeEarnings: 0,
    activeObjectives: assignSeasonObjectives(rookie.overall, role, rng.fork()),
    pendingOffers: [],
    unhappySeasons: 0,
  };

  const career: CareerState = {
    season: 1,
    userTeamId,
    players,
    rosters,
    careers,
    events: [],
    rotations,
    teams,
    playerMode,
  };

  const leagueTeams = teams.map((t) => ({
    id: t.id,
    conference: t.conference,
    division: t.division,
    sim: simTeamOf(t.id, rotations[t.id]!, byId),
  }));

  return { career, leagueTeams, userTeamId, playerId, seed };
}

/** Sim view of one team: its rotation in order, so starters lead the shot distribution. */
function simTeamOf(
  id: TeamId,
  rotation: PlayerId[],
  byId: Map<PlayerId, Player>,
): SimTeam {
  return {
    id,
    pace: 100,
    offRating: 110,
    defRating: 110,
    players: rotation
      .map((pid) => byId.get(pid))
      .filter((p): p is Player => p !== undefined)
      .map(toSimPlayer),
  };
}
