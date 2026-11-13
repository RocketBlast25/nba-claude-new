import { ACTION_IDS, ACTION_RULES, decisionCards, decide, type ActionId } from '../possession/decision';
import { createPossession } from '../possession/engine';
import type { UserDecision } from '../sim/season/resumableSeason';
import type { Attributes } from '../sim/core/models';
import { SeededRng } from '../sim/core/random';

export interface KeyMomentModalProps {
  /** Matchup text for the paused game, shown above the choices. */
  title: string;
  /** Controlled player's attributes. They set the live success chance of each action. */
  attributes: Attributes;
  /** Seed for this possession's roll, so a given choice resolves the same way every time. */
  rollSeed: number;
  /** Called with the rolled outcome. The store then continues the paused run. */
  onResolve: (decision: UserDecision) => void;
}

/**
 * Resolves one paused Key Moment. The user picks an action; the possession roll runs
 * through the pure decide() so the outcome matches the rest of the sim.
 */
export function KeyMomentModal({ title, attributes, rollSeed, onResolve }: KeyMomentModalProps) {
  const chances = decisionCards(attributes);

  const choose = (actionId: ActionId) => {
    const state = createPossession([], { attributes, rng: new SeededRng(rollSeed) });
    const { outcome } = decide(state, actionId);
    onResolve({ success: outcome.success, reward: outcome.reward });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Key Moment" className="key-moment-modal">
      <h2>Key Moment</h2>
      <p>{title}</p>
      <div role="group" aria-label="Choose an action" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ACTION_IDS.map((id) => (
          <button key={id} type="button" onClick={() => choose(id)}>
            {ACTION_RULES[id].name} ({Math.round(chances[id] * 100)}%)
          </button>
        ))}
      </div>
    </div>
  );
}
