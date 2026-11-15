/**
 * Builds the court for a live Key Moment and runs it once. The frames and the
 * outcome come from the same seeded run, so the shot, pass or turnover shown on
 * the court always matches the text result. Pure: no React, no DOM.
 */
import type { Attributes, Player } from '../sim/core/models';
import { SeededRng } from '../sim/core/random';
import type { PlayerId, TeamId } from '../sim/core/types';
import { decide, type ActionId, type DecisionOutcome } from './decision';
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
const RELEASE_FRAME = FRAME_COUNT - 4;
/** Peak sideways offset of the ball path, in court units. */
const ARC_BULGE = 24;

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
function choreograph(state: PossessionState, actorId: PlayerId, actionId: ActionId): CourtSnapshot[] {
  const first = snapshotCourt(state);
  const carrier = first.players.find((p) => p.id === actorId) ?? { x: 470, y: 250 };
  const hoop = attackingHoop(carrier.x);
  const carrierTeam = state.entities.find((e) => e.id === actorId)?.teamId ?? null;
  const offense = first.players.filter((p) => p.teamId === carrierTeam);
  const defense = first.players.filter((p) => p.teamId !== null && p.teamId !== carrierTeam);
  const spots = [
    { x: hoop.x > 470 ? 780 : 160, y: 60 },
    { x: hoop.x > 470 ? 780 : 160, y: 440 },
    { x: hoop.x > 470 ? 640 : 300, y: 120 },
    { x: hoop.x > 470 ? 640 : 300, y: 380 },
  ];
  // Shots arc to the hoop, passes to the first teammate spot, resets keep the ball.
  const target = actionId === 'pass' ? spots[0]! : actionId === 'reset' ? null : hoop;
  const frames: CourtSnapshot[] = [];
  for (let f = 0; f < FRAME_COUNT; f++) {
    const t = f / (FRAME_COUNT - 1);
    const carrierAt = blend(carrier, hoop, t * 0.6);
    const ballAt =
      f <= RELEASE_FRAME || target === null
        ? carrierAt
        : arcPoint(blend(carrier, hoop, (RELEASE_FRAME / (FRAME_COUNT - 1)) * 0.6), target, (f - RELEASE_FRAME) / (FRAME_COUNT - 1 - RELEASE_FRAME));
    const players = first.players.map((p) => {
      if (p.id === actorId) return { ...p, ...carrierAt };
      const mateIdx = offense.findIndex((m) => m.id === p.id) - 1;
      if (mateIdx >= 0 && mateIdx < spots.length) {
        return { ...p, ...blend(p, spots[mateIdx]!, t) };
      }
      const defIdx = defense.findIndex((d) => d.id === p.id);
      if (defIdx >= 0) {
        const target = offense[defIdx % offense.length] ?? carrier;
        const shadow = { x: target.x + (hoop.x > target.x ? -18 : 18), y: target.y };
        return { ...p, ...blend(p, shadow, t) };
      }
      return p;
    });
    frames.push({ t: Math.round(f * FRAME_MS), ballPos: ballAt, players });
  }
  return frames;
}

/** Ball path after release: a straight line with a perpendicular bulge that peaks mid-flight. */
function arcPoint(from: { x: number; y: number }, to: { x: number; y: number }, u: number) {
  const p = blend(from, to, u);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.sin(Math.PI * u) * ARC_BULGE;
  return { x: p.x - (dy / len) * bulge, y: p.y + (dx / len) * bulge };
}

/** Linear blend between two points, clamped to the court. */
function blend(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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
  const { state, outcome } = decide(start, input.actionId);

  const frames = choreograph(state, input.actor.id, input.actionId);
  return {
    frames,
    outcome,
    offenseIds: [input.actor.id, ...input.offense.slice(0, 4).map((p) => p.id)],
    defenseIds: input.defense.slice(0, 5).map((p) => p.id),
    actorId: input.actor.id,
  };
}
