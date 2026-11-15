/**
 * Builds the court for a live Key Moment and runs it once. The frames and the
 * outcome come from the same seeded run, so the shot, pass or turnover shown on
 * the court always matches the text result. Pure: no React, no DOM.
 */
import type { Attributes, Player } from '../sim/core/models';
import { SeededRng } from '../sim/core/random';
import type { PlayerId, TeamId } from '../sim/core/types';
import { STEP_MS } from './types';
import { SPRINT_SPEED, DEFENDER_SPEED, stepTactics, type TacticalPlayer, type TacticalState } from './tactics';
import { type ActionId, type DecisionOutcome } from './decision';
import { resolvePlay } from './outcome';
import { arcHeight } from './ballphysics';
import { createPossession } from './engine';
import { snapshotCourt, type CourtSnapshot } from './replay';
import type { PossessionState } from './types';
import type { CourtEntity } from './types';

/** Frames captured across the execution span, one every FRAME_MS. */
const FRAME_COUNT = 8;
const FRAME_MS = 500;

/** Hoop centres on the 940x500 court. The offense attacks the hoop on the far side. */
const HOOP_LEFT = { x: 52.5, y: 250 };
const HOOP_RIGHT = { x: 887.5, y: 250 };

/** Keyframe where the ball leaves the carrier; the last keyframes fly the arc. */
export const RELEASE_FRAME = FRAME_COUNT - 4;
/** Peak sideways offset of the ball path, in court units. */
const ARC_BULGE = 24;
/** Height of each dribble bounce, in court units. */
const DRIBBLE_BOUNCE = 6;
/** Apex height of a shot arc, in court units above the floor. */
const SHOT_APEX = 60;

/** Hoop the carrier attacks: the one on the opposite half from its starting x. */
export function attackingHoop(carrierX: number): { x: number; y: number } {
  return carrierX < 470 ? HOOP_RIGHT : HOOP_LEFT;
}

/**
 * Builds the keyframes with deterministic, role-based movement instead of random
 * drift. The carrier drives toward the attacking hoop and keeps the ball. Teammates
 * spread to the wings and corners. Each defender shadows the offensive player at
 * the same index. Frame 0 is the setup, frame N-1 the end of the play.
 */
function choreograph(
  state: PossessionState,
  actorId: PlayerId,
): { frames: CourtSnapshot[]; release: TacticalState } {
  const first = snapshotCourt(state);
  const carrier = first.players.find((p) => p.id === actorId) ?? { x: 470, y: 250 };
  const hoop = attackingHoop(carrier.x);
  const attackingRight = hoop.x > 470;
  const carrierTeam = state.entities.find((e) => e.id === actorId)?.teamId ?? null;

  // Seed the tactical stepper from the snapshot. Offense takes spacing roles in
  // order, the actor as the handler; defenders guard the offensive player at their index.
  const offense = first.players.filter((p) => p.teamId === carrierTeam);
  const defense = first.players.filter((p) => p.teamId !== null && p.teamId !== carrierTeam);
  const handlerId = actorId;
  const mates = offense.filter((p) => p.id !== actorId);
  const players: TacticalPlayer[] = [
    { id: actorId, side: 'offense', pos: { x: carrier.x, y: carrier.y }, vel: { x: 0, y: 0 }, role: 0, topSpeed: SPRINT_SPEED },
    ...mates.map((p, i) => ({
      id: p.id,
      side: 'offense' as const,
      pos: { x: p.x, y: p.y },
      vel: { x: 0, y: 0 },
      role: i + 1,
      topSpeed: SPRINT_SPEED,
    })),
    ...defense.map((p, i) => ({
      id: p.id,
      side: 'defense' as const,
      pos: { x: p.x, y: p.y },
      vel: { x: 0, y: 0 },
      role: 0,
      guards: (offense[i % offense.length] ?? offense[0])!.id,
      topSpeed: DEFENDER_SPEED,
    })),
  ];
  let tactical: TacticalState = { players, handlerId, spacing: 'five_out', timeMs: 0 };

  const frames: CourtSnapshot[] = [];
  let release: TacticalState = tactical;
  const ticksPerFrame = Math.round(FRAME_MS / STEP_MS);
  for (let f = 0; f < FRAME_COUNT; f++) {
    if (f > 0) {
      for (let i = 0; i < ticksPerFrame; i++) tactical = stepTactics(tactical, attackingRight);
    }
    if (f === RELEASE_FRAME) release = tactical;
    const byId = new Map(tactical.players.map((p) => [p.id, p]));
    const handler = byId.get(actorId)!;
    // Dribble bounce on the handler until release; the ball follows the handler's path.
    const dribbleLift = f <= RELEASE_FRAME ? Math.abs(Math.sin(f * Math.PI * 1.5)) * DRIBBLE_BOUNCE : 0;
    let ballAt: { x: number; y: number; z?: number } = { x: handler.pos.x, y: handler.pos.y - dribbleLift };
    if (dribbleLift > 0) ballAt.z = dribbleLift;
    if (f > RELEASE_FRAME) {
      // Shot arc: the ball leaves the release point and rises on a parabola toward the hoop.
      const u = (f - RELEASE_FRAME) / (FRAME_COUNT - 1 - RELEASE_FRAME);
      const from = release.players.find((p) => p.id === actorId)?.pos ?? handler.pos;
      const path = arcPoint(from, hoop, u);
      const z = arcHeight(u, SHOT_APEX);
      ballAt = z > 0 ? { x: path.x, y: path.y, z } : { x: path.x, y: path.y };
    }
    const snapshotPlayers = first.players.map((p) => {
      const sim = byId.get(p.id);
      return sim ? { ...p, x: sim.pos.x, y: sim.pos.y } : p;
    });
    frames.push({ t: Math.round(f * FRAME_MS), ballPos: ballAt, players: snapshotPlayers });
  }
  return { frames, release };
}

/** Ball path after release: a straight line with a perpendicular bulge that peaks mid-flight. */
export function arcPoint(from: { x: number; y: number }, to: { x: number; y: number }, u: number) {
  const p = blend(from, to, u);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.sin(Math.PI * u) * ARC_BULGE;
  return { x: p.x - (dy / len) * bulge, y: p.y + (dx / len) * bulge };
}

/** Linear blend between two points. */
function blend(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Smoothstep easing: starts and ends with zero velocity, so cuts look organic.
 * `t` is clamped to [0, 1], so out-of-range input cannot overshoot the endpoints.
 */
export function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export interface KeyMomentCourtInput {
  /** The user's player who holds the ball. */
  actor: Player;
  /** Up to four other players from the user's team. */
  offense: Player[];
  /** Up to five players from the opposing team. */
  defense: Player[];
  /** The user's team. */
  offenseTeamId: TeamId;
  /** The opposing team. */
  defenseTeamId: TeamId;
  actionId: ActionId;
  /** Seed shared by the frames and the outcome. */
  seed: number;
}

export interface KeyMomentCourtRun {
  frames: CourtSnapshot[];
  outcome: DecisionOutcome;
  /** Player who wins a miss on the rebound, or null when the play was not a missed shot. */
  reboundWinnerId: string | null;
  /** Ids of the user's offense (actor first), so the court can style them. */
  offenseIds: PlayerId[];
  /** Ids of the defenders. */
  defenseIds: PlayerId[];
  actorId: PlayerId;
}

/**
 * Places five offensive players and five defenders with seeded starting positions
 * and velocities. The actor starts with the ball. Every value is drawn from the
 * RNG, so the setup is fully determined by the seed.
 */
export function buildKeyMomentCourt(input: KeyMomentCourtInput, rng: SeededRng): CourtEntity[] {
  const entities: CourtEntity[] = [];
  const carrier = {
    x: rng.range(300, 640),
    y: rng.range(150, 350),
    vx: rng.range(-40, 40),
    vy: rng.range(-30, 30),
  };
  entities.push({ id: input.actor.id, teamId: input.offenseTeamId, ...carrier });
  entities.push({ id: 'ball', teamId: null, ...carrier });
  for (const mate of input.offense.slice(0, 4)) {
    entities.push({
      id: mate.id,
      teamId: input.offenseTeamId,
      x: rng.range(80, 860),
      y: rng.range(60, 440),
      vx: rng.range(-50, 50),
      vy: rng.range(-35, 35),
    });
  }
  for (const defender of input.defense.slice(0, 5)) {
    entities.push({
      id: defender.id,
      teamId: input.defenseTeamId,
      x: rng.range(80, 860),
      y: rng.range(60, 440),
      vx: rng.range(-50, 50),
      vy: rng.range(-35, 35),
    });
  }
  return entities;
}

/** A player's `rebounding` rating from the input, or a neutral 50 if not listed. */
function reboundingOf(input: KeyMomentCourtInput, id: string): number {
  const found = [input.actor, ...input.offense, ...input.defense].find((p) => p.id === id);
  return found?.attributes.rebounding ?? 50;
}

/**
 * Runs the possession once from one seeded RNG: setup first, then the decision roll.
 * The frames are stepped from the state after the roll, so the last frame matches
 * the resolved play.
 */
export function runKeyMomentCourt(input: KeyMomentCourtInput): KeyMomentCourtRun {
  const rng = new SeededRng(input.seed);
  const entities = buildKeyMomentCourt(input, rng);
  const attributes: Attributes = input.actor.attributes;
  const start = createPossession(entities, { attributes, rng });

  const { frames, release } = choreograph(start, input.actor.id);
  const byId = new Map(release.players.map((p) => [p.id, p]));
  const shooter = byId.get(input.actor.id)!;
  const hoop = attackingHoop(shooter.pos.x);
  const defenders = release.players.filter((p) => p.side === 'defense');
  const { outcome, reboundWinnerId } = resolvePlay(attributes, {
    actionId: input.actionId,
    shooter: shooter.pos,
    shooterVel: shooter.vel,
    hoop,
    defenders: defenders.map((d) => ({ pos: d.pos, vel: d.vel })),
    reboundCandidates: release.players.map((p) => ({
      id: p.id,
      pos: p.pos,
      rebounding: reboundingOf(input, p.id),
      offense: p.side === 'offense',
    })),
  }, rng);

  return {
    frames,
    outcome,
    reboundWinnerId,
    offenseIds: [input.actor.id, ...input.offense.slice(0, 4).map((p) => p.id)],
    defenseIds: input.defense.slice(0, 5).map((p) => p.id),
    actorId: input.actor.id,
  };
}
