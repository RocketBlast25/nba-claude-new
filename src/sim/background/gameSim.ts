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
  // Largest-remainder rounding keeps the whole-minute total exactly equal to totalMinutes.
  const exact = players.map((p) => (p.usage / usageSum) * totalMinutes);
  const out = exact.map((x) => Math.floor(x));
  let left = totalMinutes - out.reduce((s, x) => s + x, 0);
  const order = exact.map((_, i) => i).sort((a, b) => (exact[b]! - out[b]!) - (exact[a]! - out[a]!));
  for (const i of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left--;
  }
  return out;
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
    fouls: 0,
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
    const box = boxScores[idx];
    if (!box) continue;

    // Shot selection: three-point attempts follow the 3PT rating.
    const threeAttempt = rng.chance(SIM_CONFIG.threePointShare);
    const shotChance = Math.min(0.75, Math.max(0.3, SIM_CONFIG.baseFgPct + (player.attributes.finishing - 60) * 0.003));
    const made = rng.chance(threeAttempt ? threeChance(player.attributes.threePoint) : shotChance);
    fga++;
    box.fga++;
    if (threeAttempt) box.threePa++;
    if (made) {
      fgm++;
      box.fgm++;
      if (threeAttempt) box.threePm++;
      const shotValue = threeAttempt ? 3 : 2;
      box.points += shotValue;
      points += shotValue;
      if (rng.chance(SIM_CONFIG.assistedFgmRate)) assistsPool++;
    } else {
      // Missed shots can draw a shooting foul and go to the line.
      const defender = pickDefender(stats, rng, idx);
      if (defender !== undefined && rng.chance(shootingFoulRate(stats[defender]?.player))) {
        const fouler = boxScores[defender];
        if (fouler) fouler.fouls++;
        const shots = threeAttempt ? 3 : 2;
        for (let f = 0; f < shots; f++) {
          box.fta++;
          if (rng.chance(freeThrowChance(player.attributes.freeThrow))) {
            box.ftm++;
            box.points += 1;
            points += 1;
          }
        }
      }
    }

    // A missed shot can be blocked by a defender.
    if (!made && rng.chance(SIM_CONFIG.blockBaseRate)) {
      const defender = pickDefender(stats, rng, idx);
      const blocker = defender !== undefined ? boxScores[defender] : undefined;
      if (blocker) blocker.blocks++;
    }
  }

  // Rebounds: each missed shot is rebounded by a player weighted by rebounding.
  const missed = fga - fgm;
  for (let r = 0; r < missed; r++) {
    const idx = rng.weighted(
      stats.map((_, i) => i),
      stats.map(({ player }) => player.attributes.rebounding),
    );
    const box = boxScores[idx];
    if (box) box.rebounds++;
  }

  // Possessions that do not end in a shot are turnovers; a defender may steal.
  // Every possession carries a non-shooting foul chance; the offense shoots two free throws.
  // Turnovers are then rolled on the same possession, scaled by the ball-handler's rating.
  for (let t = 0; t < possessions; t++) {
    const foulIdx = rng.weighted(
      stats.map((_, i) => i),
      weights,
    );
    const fouler = pickDefender(stats, rng, foulIdx);
    if (fouler !== undefined && rng.chance(nonShootingFoulRate(stats[fouler]?.player))) {
      const foulBox = boxScores[fouler];
      if (foulBox) foulBox.fouls++;
      const shooter = stats[foulIdx]?.player;
      const shooterBox = boxScores[foulIdx];
      // Only fouls past the bonus (or on a shooter) send the offense to the line.
      if (shooter && shooterBox && rng.chance(SIM_CONFIG.nonShootingFoulFtRate)) {
        for (let f = 0; f < 2; f++) {
          shooterBox.fta++;
          if (rng.chance(freeThrowChance(shooter.attributes.freeThrow))) {
            shooterBox.ftm++;
            shooterBox.points += 1;
            points += 1;
          }
        }
      }
    }
    const idx = rng.weighted(
      stats.map((_, i) => i),
      weights,
    );
    const handler = stats[idx]?.player;
    if (!handler || !rng.chance(turnoverChance(handler.attributes.ballHandling))) continue;
    const box = boxScores[idx];
    if (box) box.turnovers++;
    const thief = pickDefender(stats, rng, idx);
    if (thief !== undefined && rng.chance(stealChance(stats[thief]?.player))) {
      const stealer = boxScores[thief];
      if (stealer) stealer.steals++;
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

  // Stamina rounding can shift the team total by a minute; restore it to the game length exactly.
  const targetMinutes = minutes;
  const stamina = boxScores.map((b) => b.minutes);
  const staminaTotal = stamina.reduce((s, m) => s + m, 0);
  if (staminaTotal !== targetMinutes) {
    let diff = targetMinutes - staminaTotal;
    const order = stamina.map((_, i) => i).sort((a, b) => (diff > 0 ? (stamina[b] ?? 0) - (stamina[a] ?? 0) : (stamina[a] ?? 0) - (stamina[b] ?? 0)));
    for (const i of order) {
      if (diff === 0) break;
      const step = diff > 0 ? 1 : -1;
      boxScores[i]!.minutes += step;
      diff -= step;
    }
  }

  // Foul trouble reduces minutes; the lost minutes go to players still under the threshold.
  const adjusted = stats.map((_, i) => foulTroubleMinutes(boxScores[i]?.minutes ?? 0, boxScores[i]?.fouls ?? 0));
  const lost = stats.reduce((s, _, i) => s + ((boxScores[i]?.minutes ?? 0) - (adjusted[i] ?? 0)), 0);
  // Prefer players still under the threshold; if everyone is in foul trouble, spread the lost minutes
  // across all active players, so team minutes always sum to the full game length.
  const underThreshold = stats.map((_, i) => i).filter((i) => (boxScores[i]?.fouls ?? 0) < SIM_CONFIG.foulTroubleFouls);
  const receivers = underThreshold.length > 0 ? underThreshold : stats.map((_, i) => i);
  const receiverUsage = receivers.reduce((s, i) => s + (stats[i]?.player.usage ?? 0), 0);
  let given = 0;
  receivers.forEach((i, k) => {
    const share = k === receivers.length - 1 ? lost - given : Math.round((lost * (stats[i]?.player.usage ?? 0)) / (receiverUsage || 1));
    given += share;
    adjusted[i] = (adjusted[i] ?? 0) + share;
  });
  boxScores.forEach((box, i) => {
    box.minutes = adjusted[i] ?? 0;
  });
  // Redistribution must conserve the team's minutes exactly.
  const finalMinutes = boxScores.reduce((s, b) => s + b.minutes, 0);
  if (finalMinutes !== targetMinutes) throw new Error(`minutes not conserved: ${finalMinutes} != ${targetMinutes}`);

  return {
    teamId: team.id,
    points,
    possessions,
    fgm,
    fga,
    boxScores,
  };
}

/** Chance a three-point attempt is made, scaled by the shooter's 3PT rating. */
function threeChance(threePoint: number): number {
  return Math.min(0.45, Math.max(0.25, SIM_CONFIG.baseThreePct + (threePoint - 60) * 0.002));
}

/** Chance a free throw is made, scaled by the shooter's free-throw rating. */
function freeThrowChance(freeThrow: number): number {
  return Math.min(0.95, Math.max(0.5, SIM_CONFIG.baseFtPct + (freeThrow - 60) * 0.004));
}

/** Average of perimeter and interior defense: the defender's foul and steal rating. */
function defenseOf(player: SimPlayer | undefined): number {
  if (!player) return 60;
  return (player.attributes.perimeterDefense + player.attributes.interiorDefense) / 2;
}

/** Non-shooting foul chance on a possession. Better defenders foul less often. */
function nonShootingFoulRate(defender: SimPlayer | undefined): number {
  return SIM_CONFIG.baseNonShootingFoulRate * Math.max(0.3, 1 + (60 - defenseOf(defender)) / 100);
}

/** Shooting-foul chance on a missed shot. Better defenders foul less often. */
function shootingFoulRate(defender: SimPlayer | undefined): number {
  return SIM_CONFIG.baseFoulRate * Math.max(0.3, 1 + (60 - defenseOf(defender)) / 100);
}

/** Turnover chance on a no-shot possession. Better ball-handlers turn it over less. */
function turnoverChance(ballHandling: number): number {
  return Math.min(0.2, Math.max(0.05, SIM_CONFIG.baseTurnoverRate * (1 - (ballHandling - 60) / 200)));
}

/** Steal chance on a turnover, scaled by the defender's defense and steal-related speed. */
function stealChance(defender: SimPlayer | undefined): number {
  if (!defender) return 0;
  return Math.min(0.6, SIM_CONFIG.baseStealRate * (defenseOf(defender) / 60) * (defender.attributes.speed / 60));
}

/** Picks a defender other than the offensive player at `offenseIdx`, weighted by defense. */
function pickDefender(stats: { player: SimPlayer }[], rng: SeededRng, offenseIdx: number): number | undefined {
  const indices = stats.map((_, i) => i).filter((i) => i !== offenseIdx);
  if (indices.length === 0) return undefined;
  return rng.weighted(
    indices,
    indices.map((i) => Math.max(1, defenseOf(stats[i]?.player))),
  );
}

/** Minutes after foul trouble (TR-background-sim-004). Reduces minutes at 4+ fouls. */
export function foulTroubleMinutes(minutes: number, fouls: number): number {
  if (fouls < SIM_CONFIG.foulTroubleFouls) return minutes;
  return Math.max(0, Math.round(minutes * SIM_CONFIG.foulTroubleMinutesFactor));
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
      rebounds: bs.rebounds + ot.rebounds,
      assists: bs.assists + ot.assists,
      steals: bs.steals + ot.steals,
      blocks: bs.blocks + ot.blocks,
      turnovers: bs.turnovers + ot.turnovers,
      fouls: bs.fouls + ot.fouls,
      fgm: bs.fgm + ot.fgm,
      fga: bs.fga + ot.fga,
      threePm: bs.threePm + ot.threePm,
      threePa: bs.threePa + ot.threePa,
      ftm: bs.ftm + ot.ftm,
      fta: bs.fta + ot.fta,
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
