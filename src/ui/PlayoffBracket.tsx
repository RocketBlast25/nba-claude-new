import { useGameStore } from '../store/gameStore';

/**
 * Play-in and four best-of-7 rounds, read straight from PlayoffResult.rounds.
 * The bracket shows the series the sim already played; it does not compute results.
 */
export function PlayoffBracket() {
  const playoffs = useGameStore((s) => s.playoffs);
  if (!playoffs) return <p>Playoffs have not been played.</p>;

  const roundNames = ['Round 1', 'Conference semis', 'Conference finals', 'NBA Finals'];

  return (
    <section aria-label="Playoff bracket">
      <h2>Playoff bracket</h2>
      <p>Champion: {playoffs.champion}</p>
      {playoffs.rounds.map((series, i) => (
        <div key={i}>
          <h3>{roundNames[i] ?? `Round ${i + 1}`}</h3>
          <ul>
            {series.map((s) => (
              <li key={`${s.higherSeed}-${s.lowerSeed}`}>
                {s.higherSeed} {s.higherSeedWins}-{s.lowerSeedWins} {s.lowerSeed} (winner {s.winner})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
