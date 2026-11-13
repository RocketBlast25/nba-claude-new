/**
 * Pure view model for the career shell: the HUD facts, the phase tracker and the one
 * next action the player can take. Everything here is derived from a store snapshot.
 * No React, no DOM, no store writes — components only render what this returns.
 */
import type { CareerState } from '../sim/career/types';
import type { PlayerId, TeamId } from '../sim/core/types';
import type { PlayoffResult } from '../sim/league/playoffs';
import type { SeasonResult } from '../sim/league/season';
import { GAMES_PER_TEAM } from '../sim/league/schedule';
import { computeStandings, sortStandings } from '../sim/league/standings';
import type { StandingRow } from '../sim/league/standings';
import type { PlayoffsRunState, ResumableSeasonState } from '../sim/season/resumableSeason';
import type { CareerPhase } from '../store/gameStore';
import { ROSTER_FLOOR } from '../sim/career/careerLoop';
import { LEAGUE_CONFIG } from '../sim/league/leagueConfig';

export type TabId = 'home' | 'mycareer' | 'league' | 'frontoffice' | 'saves';

/** The five career sections, in display order. */
export const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'mycareer', label: 'MyCareer' },
  { id: 'league', label: 'League & Playoffs' },
  { id: 'frontoffice', label: 'Front Office' },
  { id: 'saves', label: 'Saves' },
];

/** The store slice the shell needs. Built once per render by `snapshotOf`. */
export interface GameSnapshot {
  career: CareerState | null;
  phase: CareerPhase;
  season: SeasonResult | null;
  playoffs: PlayoffResult | null;
  seasonRun: ResumableSeasonState | null;
  playoffsRun: PlayoffsRunState | null;
  leagueReady: boolean;
}

/** Narrow view of the store state; the shell passes its selectors in. */
export interface SnapshotSource {
  career: CareerState | null;
  phase: CareerPhase;
  season: SeasonResult | null;
  playoffs: PlayoffResult | null;
  seasonRun: ResumableSeasonState | null;
  playoffsRun: PlayoffsRunState | null;
  leagueTeams: unknown[] | null;
}

export function snapshotOf(s: SnapshotSource): GameSnapshot {
  return {
    career: s.career,
    phase: s.phase,
    season: s.season,
    playoffs: s.playoffs,
    seasonRun: s.seasonRun,
    playoffsRun: s.playoffsRun,
    leagueReady: (s.leagueTeams?.length ?? 0) > 0,
  };
}

/** "Detroit Pistons" from the career's team data, or the raw id for legacy saves. */
export function teamLabel(career: CareerState | null, teamId: TeamId | string | null | undefined): string {
  if (teamId === null || teamId === undefined) return '—';
  const team = career?.teams?.find((t) => t.id === teamId);
  if (!team) return String(teamId);
  const name = [team.city, team.name].filter((part) => part.length > 0).join(' ');
  return name.length > 0 ? name : String(teamId);
}

/** The player's name, or the raw id when the player is not in this career. */
export function playerName(career: CareerState | null, playerId: PlayerId | string | null | undefined): string {
  if (playerId === null || playerId === undefined) return '—';
  return career?.players.find((p) => p.id === playerId)?.name ?? String(playerId);
}

/** The controlled player, when this career has one. */
export function controlledPlayer(career: CareerState | null) {
  const id = career?.playerMode?.playerId;
  return id ? (career?.players.find((p) => p.id === id) ?? null) : null;
}

/** This season's resumable run; runs from an earlier season are ignored as stale. */
export function currentSeasonRun(s: GameSnapshot): ResumableSeasonState | null {
  return s.seasonRun && s.career && s.seasonRun.season === s.career.season ? s.seasonRun : null;
}

/** This season's playoff run; a completed run from an earlier season is ignored. */
export function currentPlayoffsRun(s: GameSnapshot): PlayoffsRunState | null {
  return s.playoffsRun && s.career && s.playoffsRun.season === s.career.season ? s.playoffsRun : null;
}

/** Whether the resumable regular season has finished. */
export function seasonRunFinished(run: ResumableSeasonState): boolean {
  return run.standings !== null || run.nextGame >= run.schedule.length;
}

/**
 * Sorted standings for the current season: the committed result, the finished run, or
 * (mid-season) rows computed from the run's outcomes. Null during the offseason and
 * before the first game, when this season has no table yet.
 */
export function standingsOf(s: GameSnapshot): StandingRow[] | null {
  if (s.phase === 'offseason') return null;
  const run = currentSeasonRun(s);
  if (run) {
    if (run.standings) return sortStandings(run.standings, run.outcomes);
    if (s.career?.teams?.length) {
      const teams = s.career.teams.map((t) => ({ id: t.id, conference: t.conference }));
      const known = new Set(teams.map((t) => t.id));
      if (run.outcomes.every((o) => known.has(o.homeId) && known.has(o.awayId))) {
        return sortStandings(computeStandings(teams, run.outcomes), run.outcomes);
      }
    }
    return null;
  }
  if (s.season) return sortStandings(s.season.standings, s.season.outcomes);
  return null;
}

export interface RecordView {
  wins: number;
  losses: number;
  conference: 'East' | 'West' | null;
  /** 1-based conference rank, or null while no table exists. */
  rank: number | null;
  /** "14–6" */
  label: string;
}

/** The user team's record and conference seed, from the current season's table. */
export function recordOf(s: GameSnapshot): RecordView | null {
  const rows = standingsOf(s);
  if (!rows || !s.career) return null;
  const row = rows.find((r) => r.teamId === s.career!.userTeamId);
  if (!row) return null;
  const rank =
    rows.filter((r) => r.conference === row.conference).findIndex((r) => r.teamId === row.teamId) + 1;
  return {
    wins: row.wins,
    losses: row.losses,
    conference: row.conference,
    rank: rank > 0 ? rank : null,
    label: `${row.wins}–${row.losses}`,
  };
}

/** "3rd East" for the HUD, or an empty string before the first game. */
export function seedLabel(record: RecordView | null): string {
  if (!record || record.rank === null || !record.conference) return '';
  return `${ordinal(record.rank)} ${record.conference}`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function phaseLabel(phase: CareerPhase): string {
  if (phase === 'playoffs') return 'Playoffs';
  if (phase === 'offseason') return 'Offseason';
  if (phase === 'draft') return 'Draft';
  return 'Regular season';
}

export type PhaseStepStatus = 'done' | 'current' | 'upcoming';

export interface PhaseStep {
  id: 'regular' | 'playoffs' | 'offseason' | 'next';
  label: string;
  status: PhaseStepStatus;
}

/** The four-step season tracker shown under the HUD. */
export function phaseSteps(s: GameSnapshot): PhaseStep[] {
  const seasonNumber = s.career?.season ?? 1;
  const regular: PhaseStep = { id: 'regular', label: `Season ${seasonNumber}`, status: 'current' };
  const playoffs: PhaseStep = { id: 'playoffs', label: 'Playoffs', status: 'upcoming' };
  const offseason: PhaseStep = { id: 'offseason', label: 'Offseason', status: 'upcoming' };
  const next: PhaseStep = { id: 'next', label: `Season ${seasonNumber + 1}`, status: 'upcoming' };

  const playoffRun = currentPlayoffsRun(s);
  if (s.phase === 'offseason') {
    return [
      { ...regular, status: 'done' },
      { ...playoffs, status: 'done' },
      { ...offseason, status: 'current' },
      next,
    ];
  }
  if (playoffRun) {
    return [
      { ...regular, status: 'done' },
      { ...playoffs, status: playoffRun.result ? 'done' : 'current' },
      { ...offseason, status: playoffRun.result ? 'current' : 'upcoming' },
      next,
    ];
  }
  const run = currentSeasonRun(s);
  if (run && seasonRunFinished(run)) {
    return [{ ...regular, status: 'done' }, playoffs, offseason, next];
  }
  return [regular, playoffs, offseason, next];
}

export type NextActionKind =
  | 'new-career'
  | 'pick-player'
  | 'key-moment'
  | 'start-season'
  | 'advance-season'
  | 'start-playoffs'
  | 'advance-playoffs'
  | 'enter-offseason'
  | 'review-offers';

export interface NextAction {
  kind: NextActionKind;
  /** The HUD's single primary button label. */
  label: string;
  /** One short line explaining what it does or why it is disabled. */
  detail: string;
  /** Where the action's results appear, used by secondary links and empty states. */
  tab: TabId;
  enabled: boolean;
}

/**
 * The one thing the player should do next. This is the heart of the shell: the HUD
 * button, the Home card and every locked-panel hint read from it, so no screen can
 * offer a different "next step" and no phase can end without an action.
 */
export function nextAction(s: GameSnapshot): NextAction {
  const career = s.career;
  if (!career) {
    return {
      kind: 'new-career',
      label: 'Start a new career',
      detail: 'Create a player and pick a team.',
      tab: 'saves',
      enabled: true,
    };
  }
  if (!career.playerMode) {
    return {
      kind: 'pick-player',
      label: 'Pick your player',
      detail: 'Choose who you control for this career.',
      tab: 'mycareer',
      enabled: true,
    };
  }

  const seasonRun = currentSeasonRun(s);
  const playoffRun = currentPlayoffsRun(s);
  const moment = seasonRun?.pending ?? playoffRun?.pending ?? null;
  if (moment) {
    return {
      kind: 'key-moment',
      label: 'Play Key Moment',
      detail: `${teamLabel(career, moment.homeId)} vs ${teamLabel(career, moment.awayId)}`,
      tab: playoffRun?.pending ? 'league' : 'home',
      enabled: true,
    };
  }

  if (playoffRun) {
    if (playoffRun.result) {
      return {
        kind: 'enter-offseason',
        label: 'Enter Offseason',
        detail: `Champion: ${teamLabel(career, playoffRun.result.champion)}. Run retirements, the draft and free agency.`,
        tab: 'league',
        enabled: true,
      };
    }
    const series = playoffRun.series[playoffRun.seriesIndex];
    return {
      kind: 'advance-playoffs',
      label: 'Advance Playoffs',
      detail: series
        ? `${teamLabel(career, series.higherSeed)} ${series.higherWins}–${series.lowerWins} ${teamLabel(career, series.lowerSeed)}`
        : 'Play the next playoff game.',
      tab: 'league',
      enabled: s.leagueReady,
    };
  }

  if (s.phase === 'offseason') {
    const offers = career.playerMode.pendingOffers.length;
    if (offers > 0) {
      return {
        kind: 'review-offers',
        label: `Review ${offers} Offer${offers === 1 ? '' : 's'}`,
        detail: 'Your contract is up: sign with a team or decline.',
        tab: 'frontoffice',
        enabled: true,
      };
    }
    return {
      kind: 'start-season',
      label: `Start Season ${career.season}`,
      detail: 'Free agency is settled. Tip off the new season.',
      tab: 'home',
      enabled: s.leagueReady,
    };
  }

  if (seasonRun && !seasonRunFinished(seasonRun)) {
    const game = seasonRun.schedule[seasonRun.nextGame];
    return {
      kind: 'advance-season',
      label: 'Advance Season',
      detail: game
        ? `Game ${seasonRun.nextGame + 1} of ${GAMES_PER_TEAM} · ${teamLabel(career, game.awayId)} at ${teamLabel(career, game.homeId)}`
        : `Game ${seasonRun.nextGame + 1} of ${GAMES_PER_TEAM}`,
      tab: 'home',
      enabled: s.leagueReady,
    };
  }

  if (seasonRun && seasonRunFinished(seasonRun)) {
    return {
      kind: 'start-playoffs',
      label: 'Start Playoffs',
      detail: 'The regular season is complete: play in and seed the bracket.',
      tab: 'league',
      enabled: s.leagueReady && seasonRun.standings !== null,
    };
  }

  return {
    kind: 'start-season',
    label: `Start Season ${career.season}`,
    detail: 'No games have been played this season yet.',
    tab: 'home',
    enabled: s.leagueReady,
  };
}

/** The user's most recent results, newest first, for the Home panel. */
export interface RecentResult {
  opponentId: TeamId;
  won: boolean;
  home: boolean;
}

export function recentResults(s: GameSnapshot, limit = 5): RecentResult[] {
  const run = currentSeasonRun(s);
  const outcomes = run?.outcomes ?? (s.phase === 'offseason' ? [] : s.season?.outcomes ?? []);
  const userTeamId = s.career?.userTeamId;
  if (!userTeamId) return [];
  const out: RecentResult[] = [];
  for (let i = outcomes.length - 1; i >= 0 && out.length < limit; i--) {
    const g = outcomes[i]!;
    if (g.homeId !== userTeamId && g.awayId !== userTeamId) continue;
    const home = g.homeId === userTeamId;
    const won = home ? g.homeWon : !g.homeWon;
    out.push({ opponentId: home ? g.awayId : g.homeId, won, home });
  }
  return out;
}

/** The user's next scheduled game in this season's run, if any. */
export function nextGameOf(s: GameSnapshot): { homeId: TeamId; awayId: TeamId; number: number } | null {
  const run = currentSeasonRun(s);
  if (!run) return null;
  const game = run.schedule[run.nextGame];
  if (!game) return null;
  return { ...game, number: run.nextGame + 1 };
}

/** A short offseason summary for the Home panel. */
export interface OffseasonView {
  season: number;
  retired: number;
  rosterCount: number;
  rosterFloor: number;
  rosterCap: number;
  averageMood: number;
}

export function offseasonView(s: GameSnapshot): OffseasonView | null {
  if (s.phase !== 'offseason' || !s.career) return null;
  const career = s.career;
  const userRoster = career.rosters[career.userTeamId] ?? [];
  const moodById = new Map(career.careers.map((c) => [c.playerId, c.mood]));
  const averageMood = userRoster.length
    ? Math.round(userRoster.reduce((sum, id) => sum + (moodById.get(id) ?? 0), 0) / userRoster.length)
    : 0;
  return {
    season: career.season,
    retired: career.careers.filter((c) => c.retired && c.retiredSeason === career.season - 1).length,
    rosterCount: userRoster.length,
    rosterFloor: ROSTER_FLOOR,
    rosterCap: LEAGUE_CONFIG.maxRosterSize,
    averageMood,
  };
}

/** Tiers and score from the GOAT engine, for the MyCareer legacy section. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}
