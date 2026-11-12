import { useGameStore } from '../store/gameStore';

/**
 * Lottery and draft order board. The order comes from the store, which built it
 * with the pure buildDraftOrder(). The user's picks are highlighted; AI picks
 * are filled by the offseason economy.
 */
export function DraftRoom() {
  const draftOrder = useGameStore((s) => s.draftOrder);
  const userTeamId = useGameStore((s) => s.userTeamId);

  if (draftOrder.length === 0) return <p>Draft order is set after the playoffs.</p>;

  return (
    <section aria-label="Draft room">
      <h2>Draft order</h2>
      <ol>
        {draftOrder.map((p) => (
          <li key={p.pick} aria-current={p.teamId === userTeamId ? 'true' : undefined}>
            Pick {p.pick}: {p.teamId}
          </li>
        ))}
      </ol>
    </section>
  );
}
