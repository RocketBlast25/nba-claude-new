/**
 * Pure selectors for the MyCareer dashboard. Derivation lives here so the React
 * components only render what these return (ADR-001). No React or DOM imports.
 */
import type { Attributes, Badge, Player, Team } from '../sim/core/models';
import type { PlayerId, TeamId } from '../sim/core/types';
import type { PlayerRole, PlayerCareerMode, Trophy, TrophyKind } from '../sim/career/playerMode';
import type { SeasonObjective } from '../sim/career/keyMomentTriggers';
import type { CareerState } from '../sim/career/types';
import type { SeasonResult } from '../sim/league/season';

export type AttributeGroupName = 'Offense / Shooting' | 'Playmaking' | 'Defense / Rebounding' | 'Athleticism / IQ';

export interface AttributeRow {
  key: keyof Attributes;
  label: string;
  value: number;
  /** Change from the prior season snapshot. 0 when there is no prior snapshot (Season 1). */
  delta: number;
}

export interface AttributeGroup {
  name: AttributeGroupName;
  rows: AttributeRow[];
}

const GROUP_LAYOUT: { name: AttributeGroupName; keys: [keyof Attributes, string][] }[] = [
  {
    name: 'Offense / Shooting',
    keys: [
      ['finishing', 'Finishing'],
      ['closeShot', 'Close shot'],
      ['midRange', 'Mid-range'],
      ['threePoint', 'Three-point'],
      ['freeThrow', 'Free throw'],
    ],
  },
  {
    name: 'Playmaking',
    keys: [
      ['ballHandling', 'Ball handling'],
      ['passing', 'Passing'],
    ],
  },
  {
    name: 'Defense / Rebounding',
    keys: [
      ['perimeterDefense', 'Perimeter defense'],
      ['interiorDefense', 'Interior defense'],
      ['rebounding', 'Rebounding'],
    ],
  },
  {
    name: 'Athleticism / IQ',
    keys: [
      ['basketballIQ', 'Basketball IQ'],
      ['speed', 'Speed'],
      ['strength', 'Strength'],
      ['stamina', 'Stamina'],
    ],
  },
];

/**
 * Groups the 14 attributes by category. Each row shows its change from the
 * previous season snapshot, or 0 when no snapshot exists.
 */
export function selectAttributeGroups(
  attributes: Attributes,
  previous: Attributes | null,
): AttributeGroup[] {
  return GROUP_LAYOUT.map((group) => ({
    name: group.name,
    rows: group.keys.map(([key, label]) => ({
      key,
      label,
      value: attributes[key],
      delta: previous ? attributes[key] - previous[key] : 0,
    })),
  }));
}

/** Signed label for a delta: "+2", "-1" or "0". */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export interface BadgeView {
  id: string;
  name: string;
  tier: Badge['tier'];
  description: string;
}

/** Resolves a player's badge ids into badge definitions, skipping unknown ids. */
export function selectBadges(player: Player, catalog: Badge[]): BadgeView[] {
  const byId = new Map(catalog.map((b) => [b.id, b]));
  return player.badges
    .map((id) => byId.get(id))
    .filter((b): b is Badge => b !== undefined)
    .map((b) => ({ id: b.id, name: b.name, tier: b.tier, description: b.description }));
}

export interface ObjectiveStatus {
  id: SeasonObjective['id'];
  label: string;
  target: number;
  /** Actual season value, or null when not measurable yet. */
  actual: number | null;
  status: 'in_progress' | 'met' | 'missed';
}

/**
 * Coach objectives for the current season with progress. An objective is met once
 * its actual value reaches the target; it is in progress while the season is open.
 * Callers supply the completion result from evaluateSeasonObjectives.
 */
export function selectObjectiveStatuses(
  objectives: SeasonObjective[],
  actuals: Record<SeasonObjective['id'], number | null>,
  seasonComplete: boolean,
): ObjectiveStatus[] {
  return objectives.map((o) => {
    const actual = actuals[o.id] ?? null;
    const reached = actual !== null && actual >= o.target;
    let status: ObjectiveStatus['status'] = 'in_progress';
    if (reached) status = 'met';
    else if (seasonComplete) status = 'missed';
    return { id: o.id, label: o.label, target: o.target, actual, status };
  });
}

export interface ContractSummary {
  salary: number;
  yearsLeft: number;
  totalValue: number;
  /** Salary summed over the seasons of the current contract only. */
  currentContractEarnings: number;
  expiring: boolean;
}

/**
 * Current contract facts. totalValue is the sum of salary over the remaining years.
 * Career earnings beyond the current contract are not tracked yet, so
 * currentContractEarnings is the only cumulative figure this can report.
 */
export function selectContractSummary(player: Player): ContractSummary {
  const { salary, yearsLeft } = player.contract;
  return {
    salary,
    yearsLeft,
    totalValue: salary * yearsLeft,
    currentContractEarnings: salary * yearsLeft,
    expiring: yearsLeft <= 0,
  };
}

export interface TrophyGroup {
  kind: TrophyKind;
  label: string;
  seasons: number[];
}

const TROPHY_LABELS: Record<TrophyKind, string> = {
  championship: 'Championship',
  finals_mvp: 'Finals MVP',
  mvp: 'MVP',
  dpoy: 'Defensive Player of the Year',
  all_star: 'All-Star',
  all_league: 'All-League',
};

/** Groups trophies by award type, listing the seasons each was won, newest first. */
export function selectTrophyGroups(trophies: Trophy[]): TrophyGroup[] {
  const byKind = new Map<TrophyKind, number[]>();
  for (const t of trophies) {
    const list = byKind.get(t.kind) ?? [];
    list.push(t.season);
    byKind.set(t.kind, list);
  }
  return (Object.keys(TROPHY_LABELS) as TrophyKind[])
    .filter((kind) => byKind.has(kind))
    .map((kind) => ({
      kind,
      label: TROPHY_LABELS[kind],
      seasons: [...(byKind.get(kind) ?? [])].sort((a, b) => b - a),
    }));
}

export interface SuperstarRow {
  rank: number;
  playerId: PlayerId;
  name: string;
  teamId: TeamId;
  overall: number;
  ppg: number;
  rpg: number;
  apg: number;
  isUser: boolean;
}

/**
 * League-wide PPG leaderboard for the current season. Ranks players by points per
 * game, breaking ties by overall then name, and flags the user's player.
 */
export function selectSuperstarStandings(
  state: CareerState,
  season: SeasonResult,
  userPlayerId: PlayerId | null,
  limit = 15,
): SuperstarRow[] {
  const teamOf = new Map<PlayerId, TeamId>();
  for (const teamId of Object.keys(state.rosters) as TeamId[]) {
    for (const id of state.rosters[teamId] ?? []) teamOf.set(id, teamId);
  }
  const playerById = new Map(state.players.map((p) => [p.id, p]));

  const rows = season.playerSeasons
    .filter((line) => line.gamesPlayed > 0 && playerById.has(line.playerId))
    .map((line) => {
      const p = playerById.get(line.playerId)!;
      return {
        playerId: line.playerId,
        name: p.name,
        teamId: teamOf.get(line.playerId) ?? state.userTeamId,
        overall: p.overall,
        ppg: line.averages.points,
        rpg: line.averages.rebounds,
        apg: line.averages.assists,
      };
    })
    .sort((a, b) => b.ppg - a.ppg || b.overall - a.overall || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));

  return rows.map((r, i) => ({ ...r, rank: i + 1, isUser: r.playerId === userPlayerId }));
}

export interface HeaderView {
  name: string;
  position: Player['position'];
  age: number;
  overall: number;
  potential: number;
  role: PlayerRole | null;
  coachTrust: number | null;
  happiness: number | null;
  ambition: number | null;
}

/** Header facts for the controlled player. Mode-only fields are null until mode state exists. */
export function selectHeader(player: Player, mode: PlayerCareerMode | null, role: PlayerRole | null): HeaderView {
  return {
    name: player.name,
    position: player.position,
    age: player.age,
    overall: player.overall,
    potential: player.potential,
    role,
    coachTrust: mode?.coachTrust ?? null,
    happiness: mode?.happiness ?? null,
    ambition: mode?.ambition ?? null,
  };
}

/** Trade destinations with display names; falls back to the raw ID when team data is absent. */
export function selectTradeTargets(teamIds: TeamId[], teams: Team[] | undefined): { id: TeamId; name: string }[] {
  const byId = new Map((teams ?? []).map((t) => [t.id, t.name]));
  return teamIds.map((id) => ({ id, name: byId.get(id) ?? id }));
}

/** Turns a snake_case or slug badge id into readable words when no catalog name exists. */
export function formatBadgeId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const ROLE_LABELS: Record<PlayerRole, string> = {
  bench: 'Bench',
  sixth_man: '6th Man',
  starter: 'Starter',
  franchise: 'Franchise',
};
