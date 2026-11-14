/**
 * Builds the court for a live Key Moment and runs it once. The frames and the
 * outcome come from the same seeded run, so the shot, pass or turnover shown on
 * the court always matches the text result. Pure: no React, no DOM.
 */
import type { Attributes, Player } from '../sim/core/models';
import { SeededRng } from '../sim/core/random';
import type { PlayerId, TeamId } from '../sim/core/types';
import { decide, type ActionId, type DecisionOutcome } from './decision';
import { createPossession, step } from './engine';
import { snapshotCourt, type CourtSnapshot } from './replay';
import type { CourtEntity } from './types';

/** Frames captured across the execution span, one every FRAME_MS. */
const FRAME_COUNT = 8;
const FRAME_MS = 500;

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

  const frames: CourtSnapshot[] = [snapshotCourt(state)];
  let current = state;
  for (let f = 1; f < FRAME_COUNT; f++) {
    current = step(current, FRAME_MS);
    frames.push(snapshotCourt(current));
  }
  return {
    frames,
    outcome,
    offenseIds: [input.actor.id, ...input.offense.slice(0, 4).map((p) => p.id)],
    defenseIds: input.defense.slice(0, 5).map((p) => p.id),
    actorId: input.actor.id,
  };
}
