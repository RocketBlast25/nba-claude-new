import { useGameStore } from '../store/gameStore';
import { CareerDashboard } from './CareerDashboard';
import { PlayoffBracket } from './PlayoffBracket';
import { OffseasonHub } from './OffseasonHub';

/**
 * Root shell. Screens read from the Zustand store; no sim logic lives here.
 * The phase decides which screen leads, and every screen remains reachable.
 */
export function App() {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const reset = useGameStore((s) => s.reset);

  return (
    <main style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>NBA Career Simulator</h1>
      {!career ? (
        <p>Start a career to begin.</p>
      ) : (
        <>
          <p>Phase: {phase.replace('_', ' ')}</p>
          <CareerDashboard />
          <PlayoffBracket />
          <OffseasonHub />
          <button type="button" onClick={() => reset()}>
            Reset career
          </button>
        </>
      )}
    </main>
  );
}
