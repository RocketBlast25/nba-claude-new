/**
 * Situational Key Moment scenarios. A scenario is picked deterministically from the
 * game context and the seeded RNG, then offers 3-4 tailored plays. Each play maps onto
 * an engine ActionId plus a situational modifier. Pure: no React, no DOM.
 */
import type { ActionId } from './decision';
import type { SeededRng } from '../sim/core/random';

/** Game context used to pick a scenario. */
export interface MomentContext {
  /** Absolute score margin at the moment. */
  margin: number;
  /** Quarter 1-4; overtime periods are reported as 5+. */
  quarter: number;
  /** Overtime periods played before the moment. */
  overtimes: number;
}

/** Multiplier and additive tweak applied to an engine action's success chance. */
export interface PlayModifier {
  /** Multiplies the base chance. 1 means no change. */
  multiplier: number;
  /** Added to the chance after the multiplier, in probability units. */
  bonus: number;
}

export interface ScenarioPlay {
  label: string;
  description: string;
  actionId: ActionId;
  /** Short risk/reward hint shown on the card. */
  riskReward: string;
  modifier: PlayModifier;
}

export interface Scenario {
  id: string;
  title: string;
  plays: readonly ScenarioPlay[];
}

const NO_MODIFIER: PlayModifier = { multiplier: 1, bonus: 0 };

/** The ten situations, in a fixed order so the seeded pick is stable. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'buzzer_beater',
    title: 'Last-Second Buzzer Beater',
    plays: [
      { label: 'Rise for the three', description: 'Catch and shoot before the horn.', actionId: 'pull_up', riskReward: 'High reward, tight timing', modifier: { multiplier: 0.9, bonus: 0 } },
      { label: 'Attack the rim', description: 'Drive hard for a layup at the buzzer.', actionId: 'drive', riskReward: 'Safer, lower reward', modifier: NO_MODIFIER },
      { label: 'Kick it out', description: 'Find the open shooter for a quick look.', actionId: 'pass', riskReward: 'Clean look, less time', modifier: { multiplier: 1.05, bonus: 0 } },
    ],
  },
  {
    id: 'down_three_late',
    title: 'Down 3 Late in the 4th',
    plays: [
      { label: 'Pull up for three', description: 'Trail-three to tie the game.', actionId: 'pull_up', riskReward: 'Big swing, low odds', modifier: { multiplier: 0.95, bonus: 0.05 } },
      { label: 'Drive to the paint', description: 'Force the defence and draw contact.', actionId: 'drive', riskReward: 'Steady, moderate reward', modifier: NO_MODIFIER },
      { label: 'Reset the set', description: 'Run the clock and reload the offence.', actionId: 'reset', riskReward: 'Safe, little upside', modifier: { multiplier: 1, bonus: -0.05 } },
    ],
  },
  {
    id: 'shot_clock_three',
    title: 'Shot Clock Winding Down (3s)',
    plays: [
      { label: 'Hoist it now', description: 'Pull up before the buzzer sounds.', actionId: 'pull_up', riskReward: 'Quick, contested look', modifier: { multiplier: 0.9, bonus: 0 } },
      { label: 'Gun it to the rim', description: 'Attack at once to beat the clock.', actionId: 'drive', riskReward: 'Good odds if open', modifier: NO_MODIFIER },
      { label: 'Reset with 3s left', description: 'Burn the clock and start over.', actionId: 'reset', riskReward: 'Heavy penalty, no shot', modifier: { multiplier: 0.6, bonus: 0 } },
    ],
  },
  {
    id: 'fastbreak_two_on_one',
    title: 'Fastbreak 2-on-1',
    plays: [
      { label: 'Drive the lane', description: 'Attack the rim with the numbers.', actionId: 'drive', riskReward: 'High reward if it lands', modifier: { multiplier: 1.1, bonus: 0 } },
      { label: 'Hit the trailer', description: 'Pass to the open teammate for a layup.', actionId: 'pass', riskReward: 'Easy look, a little risk', modifier: { multiplier: 1.1, bonus: 0 } },
      { label: 'Pull up short', description: 'Stop and shoot the mid-range jumper.', actionId: 'pull_up', riskReward: 'Low reward, low risk', modifier: NO_MODIFIER },
    ],
  },
  {
    id: 'double_team_post',
    title: 'Double-Teamed in the Post',
    plays: [
      { label: 'Pass out of it', description: 'Kick to the open shooter on the perimeter.', actionId: 'pass', riskReward: 'Open shooter boosts odds', modifier: { multiplier: 1.1, bonus: 0.05 } },
      { label: 'Power through', description: 'Drive into the double for the bucket.', actionId: 'drive', riskReward: 'Contested, high reward', modifier: { multiplier: 0.85, bonus: 0 } },
      { label: 'Reset the post', description: 'Reset and wait for the rotation.', actionId: 'reset', riskReward: 'Safe, slow', modifier: NO_MODIFIER },
    ],
  },
  {
    id: 'big_man_mismatch',
    title: 'Mismatch on a Big Man',
    plays: [
      { label: 'Attack the mismatch', description: 'Drive at the slower big for the rim.', actionId: 'drive', riskReward: 'Mismatch boosts rim attack', modifier: { multiplier: 1.15, bonus: 0 } },
      { label: 'Shoot over him', description: 'Pull up over the outmatched defender.', actionId: 'pull_up', riskReward: 'Good looks, moderate reward', modifier: { multiplier: 1.05, bonus: 0 } },
      { label: 'Swing the ball', description: 'Keep the ball moving to find a better look.', actionId: 'pass', riskReward: 'Patient, lower reward', modifier: NO_MODIFIER },
    ],
  },
  {
    id: 'defender_sagging',
    title: 'Defender Playing Off / Giving Space',
    plays: [
      { label: 'Rise up open', description: 'Take the open jumper the defender gives.', actionId: 'pull_up', riskReward: 'Open look, boosted odds', modifier: { multiplier: 1.1, bonus: 0 } },
      { label: 'Blow by him', description: 'Drive past the sagging defender.', actionId: 'drive', riskReward: 'Good odds into the paint', modifier: NO_MODIFIER },
      { label: 'Swing to the corner', description: 'Move the ball to a corner shooter.', actionId: 'pass', riskReward: 'Safe, moderate reward', modifier: { multiplier: 1.05, bonus: 0 } },
    ],
  },
  {
    id: 'full_court_press',
    title: 'Tight Full-Court Press',
    plays: [
      { label: 'Split the press', description: 'Dribble through the trap.', actionId: 'drive', riskReward: 'Contested, high reward', modifier: { multiplier: 0.85, bonus: 0 } },
      { label: 'Quick outlet pass', description: 'Hit the release man past the press.', actionId: 'pass', riskReward: 'Solid, some turnover risk', modifier: { multiplier: 0.95, bonus: 0.05 } },
      { label: 'Reset and breathe', description: 'Bring it up calmly and reset.', actionId: 'reset', riskReward: 'Safe, gives up time', modifier: NO_MODIFIER },
    ],
  },
  {
    id: 'momentum_stopper',
    title: 'Momentum Stopper Run',
    plays: [
      { label: 'Stop the run', description: 'Attack to break the opponent surge.', actionId: 'drive', riskReward: 'Momentum swing, risky', modifier: NO_MODIFIER },
      { label: 'Call a timeout reset', description: 'Settle the offence and reset.', actionId: 'reset', riskReward: 'Safe, cools the run', modifier: { multiplier: 1, bonus: 0.05 } },
      { label: 'Hit a quick three', description: 'Answer with a fast jumper.', actionId: 'pull_up', riskReward: 'Quick answer, lower odds', modifier: { multiplier: 0.95, bonus: 0 } },
    ],
  },
  {
    id: 'overtime_clutch',
    title: 'Overtime Clutch Possession',
    plays: [
      { label: 'Iso and attack', description: 'Give the ball to the star for a clutch drive.', actionId: 'drive', riskReward: 'Star power, high stakes', modifier: { multiplier: 1.05, bonus: 0 } },
      { label: 'Trust the shooter', description: 'Pull up for the go-ahead shot.', actionId: 'pull_up', riskReward: 'High reward, tough shot', modifier: { multiplier: 0.95, bonus: 0.05 } },
      { label: 'Run the play', description: 'Pass into the designed set.', actionId: 'pass', riskReward: 'Steady, moderate reward', modifier: NO_MODIFIER },
    ],
  },
];

/**
 * Picks a scenario from the game context and the seeded RNG. Overtime always uses the
 * clutch scenario; otherwise a late, close game uses a late-game scenario; the rest is
 * drawn from the RNG so the same seed gives the same situation.
 */
export function selectScenario(context: MomentContext, rng: SeededRng): Scenario {
  if (context.overtimes > 0) return SCENARIOS[9]!;
  // Late and close: only the buzzer beater and the trailing-three scenario fit.
  if (context.quarter >= 4 && context.margin <= 3) {
    const late = [SCENARIOS[0]!, SCENARIOS[1]!];
    return late[rng.int(0, late.length - 1)]!;
  }
  const pool = SCENARIOS.slice(2, 9);
  return pool[rng.int(0, pool.length - 1)]!;
}
