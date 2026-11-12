import { decisionCards, ACTION_RULES, ACTION_IDS, type ActionId } from '../possession/decision';
import { useGameStore } from '../store/gameStore';
import { CourtReplay } from './CourtReplay';

/**
 * Renders the front pending Key Moment as four decision cards. Live success %
 * comes from decisionCards(); the choice resolves through the store, which runs
 * the pure decide() roll and shows the outcome before the next moment.
 */
export function KeyMomentCards() {
  const pending = useGameStore((s) => s.pendingMoments[0]);
  const resolveNext = useGameStore((s) => s.resolveNextMoment);
  const last = useGameStore((s) => s.resolvedMoments[s.resolvedMoments.length - 1]);

  if (!pending) {
    return (
      <section aria-label="Key Moments">
        <h2>Key Moments</h2>
        {last ? <Outcome actionId={last.actionId} success={last.success} reward={last.reward} /> : <p>No Key Moments pending.</p>}
      </section>
    );
  }

  const chances = decisionCards(pending.attributes);

  return (
    <section aria-label="Key Moments">
      <h2>
        Key Moment: Q{pending.quarter} {formatClock(pending.clockSec)}
      </h2>
      {pending.replay ? <CourtReplay key={`${pending.gameId}-${pending.quarter}-${pending.clockSec}`} frames={pending.replay} /> : null}
      <div role="group" aria-label="Choose an action" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ACTION_IDS.map((id: ActionId) => (
          <button key={id} type="button" onClick={() => resolveNext(id)}>
            {ACTION_RULES[id].name} ({Math.round(chances[id] * 100)}%)
          </button>
        ))}
      </div>
      {last ? <Outcome actionId={last.actionId} success={last.success} reward={last.reward} /> : null}
    </section>
  );
}

function Outcome({ actionId, success, reward }: { actionId: string; success: boolean; reward: number }) {
  const name = ACTION_RULES[actionId as ActionId]?.name ?? actionId;
  return (
    <p role="status">
      {name}: {success ? 'Success' : 'Turnover'} (reward {reward})
    </p>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
