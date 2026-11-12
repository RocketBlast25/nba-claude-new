import type { Attributes, GameBoxScore, Player } from '../core/models';
import type { SeededRng } from '../core/random';
import type { GameId, PlayerId, TeamId } from '../core/types';
import { SIM_CONFIG } from './config';

/** A rostered player in a game, with the ratings the sim reads. */
export interface SimPlayer {
  id: PlayerId;
  attributes: Attributes;
  stamina: number;
  /** Relative share of shots and usage; higher means more shots. */
  usage: number;
}

export interface SimTeam {
  id: TeamId;
  pace: number;
  offRating: number;
  defRating: number;
  /** Ordered: starters first. */
  players: SimPlayer[];
}

export interface TeamGameResult {
  teamId: TeamId;
  points: number;
  possessions: number;
  fgm: number;
  fga: number;
  boxScores: GameBoxScore[];
}

export interface GameResult {
  gameId: GameId;
  home: TeamGameResult;
  away: TeamGameResult;
  overtimes: number;
}

/** Possessions for one team over a span of minutes (TR-background-sim-001). */
export function teamPossessions(team: SimTeam, opponent: SimTeam, minutes: number): number {
  const base = (team.pace * minutes) / SIM_CONFIG.regulationMinutes;
  // Better offense than the opponent's defense yields slightly more possessions.
  const ratingAdjust = 1 + (team.offRating - opponent.defRating) / (2 * SIM_CONFIG.leagueOffRating);
  return Math.max(0, Math.round(base * ratingAdjust));
}

/** Minutes for one player, reduced for low stamina and foul trouble (TR-background-sim-004). */
export function playerMinutes(player: SimPlayer, fouls: number, baseMinutes: number): number {
  let minutes = baseMinutes;
  if (player.stamina < SIM_CONFIG.staminaThreshold) minutes *= SIM_CONFIG.lowStaminaMinutesFactor;
  if (fouls >= SIM_CONFIG.foulTroubleFouls) minutes *= SIM_CONFIG.foulTroubleMinutesFactor;
  return Math.max(0, Math.round(minutes));
}

/** Splits total team minutes across players in proportion to usage (weights sum to 240 per game slot). */
function allocateMinutes(players: SimPlayer[], totalMinutes: number): number[] {
  const usageSum = players.reduce((s, p) => s + p.usage, 0) || 1;
  return players.map((p) => Math.round((p.usage / usageSum) * totalMinutes));
}

/** Simulates one team's side of a game. Shots go to players by usage (TR-background-sim-002). */
function simulateTeam(
  team: SimTeam,
  opponent: SimTeam,
  minutes: number,
  gameId: GameId,
  rng: SeededRng,
): TeamGameResult {
  const possessions = teamPossessions(team, opponent, minutes);
  const playerMins = allocateMinutes(team.players, minutes * 5);
  const stats = team.players.map((p, i) => {
    const mins = playerMinutes(p, 0, (playerMins[i] ?? 0) / 5);
    return { player: p, minutes: mins };
  });

  const boxScores: GameBoxScore[] = stats.map(({ player, minutes: mins }) => ({
    gameId,
    playerId: player.id,
    minutes: mins,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    ftm: 0,
    fta: 0,
  }));

  const shotsTaken = Math.round(possessions * SIM_CONFIG.shotPossessionRate);
  const weights = stats.map(({ player, minutes: mins }) => player.usage * mins);
  let fgm = 0;
  let fga = 0;
  let points = 0;
  let assistsPool = 0;

  for (let s = 0; s < shotsTaken; s++) {
    const idx = rng.weighted(
      stats.map((_, i) => i),
      weights,
    );
    const picked = stats[idx];
    if (!picked) continue;
    const { player } = picked;
    const shotChance = Math.min(0.75, Math.max(0.3, SIM_CONFIG.baseFgPct + (player.attributes.finishing - 60) * 0.003));
    const made = rng.chance(shotChance);
    const box = boxScores[idx];
    if (!box) continue;
    fga++;
    box.fga++;
    if (made) {
      const shotValue = rng.chance(SIM_CONFIG.threePointShare) ? 3 : 2;
      fgm++;
      box.fgm++;
      box.points += shotValue;
      points += shotValue;
      if (rng.chance(SIM_CONFIG.assistedFgmRate)) assistsPool++;
    }
  }

  // Assists credited to teammates of the scorer, capped by the assisted-FGM rate (TR-background-sim-003).
  for (let a = 0; a < assistsPool; a++) {
    const idx = rng.weighted(
      stats.map((_, i) => i),
      stats.map(({ player }) => player.attributes.passing),
    );
    const box = boxScores[idx];
    if (box) box.assists++;
  }

  return {
    teamId: team.id,
    points,
    possessions,
    fgm,
    fga,
    boxScores,
  };
}

/**
 * Simulates one full game including overtime. The home and away sides take
 * the same overtime count. Deterministic for a given RNG state.
 */
export function simulateGame(
  gameId: GameId,
  home: SimTeam,
  away: SimTeam,
  rng: SeededRng,
): GameResult {
  let overtimes = 0;
  let homeRes = simulateTeam(home, away, SIM_CONFIG.regulationMinutes, gameId, rng);
  let awayRes = simulateTeam(away, home, SIM_CONFIG.regulationMinutes, gameId, rng);

  // Break ties with overtime periods until one side leads.
  while (homeRes.points === awayRes.points) {
    overtimes++;
    homeRes = mergeOvertime(homeRes, simulateTeam(home, away, SIM_CONFIG.overtimeMinutes, gameId, rng));
    awayRes = mergeOvertime(awayRes, simulateTeam(away, home, SIM_CONFIG.overtimeMinutes, gameId, rng));
  }

  return { gameId, home: homeRes, away: awayRes, overtimes };
}

function mergeOvertime(a: TeamGameResult, b: TeamGameResult): TeamGameResult {
  const boxScores = a.boxScores.map((bs, i) => {
    const ot = b.boxScores[i];
    if (!ot) return bs;
    return {
      ...bs,
      minutes: bs.minutes + ot.minutes,
      points: bs.points + ot.points,
      assists: bs.assists + ot.assists,
      fgm: bs.fgm + ot.fgm,
      fga: bs.fga + ot.fga,
    };
  });
  return {
    teamId: a.teamId,
    points: a.points + b.points,
    possessions: a.possessions + b.possessions,
    fgm: a.fgm + b.fgm,
    fga: a.fga + b.fga,
    boxScores,
  };
}

/** Converts a rostered Player into the sim's view of it. */
export function toSimPlayer(player: Player): SimPlayer {
  return {
    id: player.id,
    attributes: player.attributes,
    stamina: player.stamina,
    usage: player.overall / 100,
  };
}
