import { describe, expect, it } from 'vitest';
import {
  goalSideSpot,
  hedgeSpot,
  helpSpot,
  shotContest,
  dist,
  HOOP_RIGHT,
  CONTEST_RANGE,
  GOAL_SIDE_GAP,
} from '../../../src/possession/defense';
import {
  stepTactics,
  steerVelocity,
  DRIBBLE_SPEED,
  SPRINT_SPEED,
  ACCEL,
  type TacticalState,
} from '../../../src/possession/tactics';
import { STEP_MS } from '../../../src/possession/types';

describe('goal-side defense', () => {
  it('places the defender between the attacker and the hoop it guards', () => {
    const attacker = { x: 300, y: 250 };
    const spot = goalSideSpot(attacker, HOOP_RIGHT);
    // Lies on the segment from attacker toward the hoop, GOAL_SIDE_GAP away.
    expect(spot.x).toBeGreaterThan(attacker.x);
    expect(dist(spot, attacker)).toBeCloseTo(GOAL_SIDE_GAP, 5);
  });

  it('stays on the attacker when the attacker is already at the hoop', () => {
    const spot = goalSideSpot(HOOP_RIGHT, HOOP_RIGHT);
    expect(spot).toEqual(HOOP_RIGHT);
  });

  it('hedge factor 0 keeps the defender where it was, 1 moves it fully onto the ball', () => {
    const defender = { x: 100, y: 100 };
    const handler = { x: 200, y: 200 };
    const screener = { x: 180, y: 190 };
    const stayed = hedgeSpot(defender, handler, screener, 0);
    expect(stayed).toEqual(defender);
    const full = hedgeSpot(defender, handler, screener, 1);
    expect(full.x).toBeCloseTo(screener.x + (handler.x - screener.x) * 0.25, 5);
  });

  it('help factor moves the defender toward the drive lane', () => {
    const defender = { x: 600, y: 100 };
    const driver = { x: 300, y: 250 };
    const hoop = HOOP_RIGHT;
    const helped = helpSpot(defender, driver, hoop, 1);
    const laneX = driver.x + (hoop.x - driver.x) * 0.5;
    expect(helped.x).toBeCloseTo(laneX, 5);
  });
});

describe('shot contest', () => {
  const shooter = { x: 500, y: 250 };
  const still = { x: 0, y: 0 };
  const hoop = HOOP_RIGHT;

  it('is zero when no defender is within the contest range', () => {
    const far = { pos: { x: shooter.x + CONTEST_RANGE + 10, y: shooter.y }, vel: still };
    expect(shotContest(shooter, still, hoop, [far])).toBe(0);
  });

  it('rises as the defender gets closer to the shooter', () => {
    const near = shotContest(shooter, still, hoop, [{ pos: { x: 510, y: 250 }, vel: still }]);
    const mid = shotContest(shooter, still, hoop, [{ pos: { x: 540, y: 250 }, vel: still }]);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
  });

  it('is higher when the defender is closing on the shooter than when standing still', () => {
    const closingVel = { x: -80, y: 0 };
    const standing = shotContest(shooter, still, hoop, [{ pos: { x: 530, y: 250 }, vel: still }]);
    const closing = shotContest(shooter, still, hoop, [{ pos: { x: 530, y: 250 }, vel: closingVel }]);
    expect(closing).toBeGreaterThan(standing);
  });

  it('is higher when the defender stands in front of the shot line than from the side', () => {
    const inFront = shotContest(shooter, still, hoop, [{ pos: { x: 520, y: 250 }, vel: still }]);
    const side = shotContest(shooter, still, hoop, [{ pos: { x: 500, y: 290 }, vel: still }]);
    expect(inFront).toBeGreaterThan(side);
  });

  it('stays within [0, 1]', () => {
    const d = { pos: { x: 501, y: 250 }, vel: { x: -200, y: 0 } };
    const v = shotContest(shooter, still, hoop, [d]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('tactical stepper', () => {
  const base = (): TacticalState => ({
    handlerId: 'h',
    spacing: 'five_out',
    timeMs: 0,
    players: [
      { id: 'h', side: 'offense', pos: { x: 300, y: 250 }, vel: { x: 0, y: 0 }, role: 0, topSpeed: SPRINT_SPEED },
      { id: 'm1', side: 'offense', pos: { x: 200, y: 80 }, vel: { x: 0, y: 0 }, role: 1, topSpeed: SPRINT_SPEED },
      { id: 'd1', side: 'defense', pos: { x: 320, y: 250 }, vel: { x: 0, y: 0 }, role: 0, guards: 'h', topSpeed: 210 },
    ],
  });

  it('returns a new state and does not mutate the input', () => {
    const s = base();
    const before = JSON.stringify(s);
    stepTactics(s, true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('advances time by one fixed step per tick', () => {
    const next = stepTactics(base(), true);
    expect(next.timeMs).toBe(STEP_MS);
  });

  it('is deterministic: the same input steps to the same output', () => {
    const a = stepTactics(stepTactics(base(), true), true);
    const b = stepTactics(stepTactics(base(), true), true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('limits acceleration so velocity cannot change faster than ACCEL per second', () => {
    const dt = STEP_MS / 1000;
    const v = steerVelocity({ x: 0, y: 0 }, { x: 1000, y: 0 }, dt);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(ACCEL * dt + 1e-9);
  });

  it('keeps the dribbling handler slower than the sprint speed when no defender is near', () => {
    const s = base();
    s.players[2]!.pos = { x: 900, y: 450 };
    const next = stepTactics(s, true);
    const handler = next.players.find((p) => p.id === 'h')!;
    expect(Math.hypot(handler.vel.x, handler.vel.y)).toBeLessThanOrEqual(DRIBBLE_SPEED + 1e-6);
  });
});
