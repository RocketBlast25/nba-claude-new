import { useGameStore } from '../store/gameStore';
import { KeyMomentModal } from './KeyMomentModal';

/**
 * Play-in and four best-of-7 rounds, read straight from PlayoffResult.rounds.
 * The bracket shows the series the sim already played; it does not compute results.
 * In a MyCareer, the playoff stepper pauses on the user's games for Key Moments.
 */
export function PlayoffBracket() {
  const playoffs = useGameStore((s) => s.playoffs);
  const career = useGameStore((s) => s.career);
  const seed = useGameStore((s) => s.seed);
  const playoffsRun = useGameStore((s) => s.playoffsRun);
  const startPlayoffsRun = useGameStore((s) => s.startPlayoffsRun);
  const advancePlayoffsRun = useGameStore((s) => s.advancePlayoffsRun);
  const resolvePlayoffMoment = useGameStore((s) => s.resolvePlayoffMoment);
  const seasonRun = useGameStore((s) => s.seasonRun);
  const runOffseason = useGameStore((s) => s.runOffseason);
  const teams = useGameStore((s) => s.leagueTeams);

  // Runs and standings from an earlier season are stale until the new season is played.
  const currentRun = playoffsRun && career && playoffsRun.season === career.season ? playoffsRun : null;
  const seasonDone =
    seasonRun !== null && career !== null && seasonRun.season === career.season
      ? seasonRun.standings
      : null;

  const stepper =
    career?.playerMode && teams ? (
      <section aria-label="Playoff stepper">
        {currentRun ? (
          <>
            {!currentRun.result && !currentRun.pending ? (
              <button type="button" onClick={() => advancePlayoffsRun()}>
                Advance
              </button>
            ) : null}
            {currentRun.result ? (
              <button type="button" onClick={() => runOffseason()}>
                Enter Offseason
              </button>
            ) : null}
          </>
        ) : seasonDone ? (
          <button type="button" onClick={() => startPlayoffsRun(teams)}>
            Simulate Playoffs
          </button>
        ) : playoffs ? null : (
          <p>Finish the regular season to unlock the playoffs.</p>
        )}
        {currentRun?.pending ? (
          <KeyMomentModal
            title={`Playoff game ${currentRun.pending.gameIndex + 1} (${currentRun.pending.homeId} vs ${currentRun.pending.awayId})`}
            attributes={controlledAttributes(career)}
            rollSeed={seed + career.season + currentRun.pending.gameIndex}
            onResolve={(decision) => resolvePlayoffMoment(decision)}
          />
        ) : null}
      </section>
    ) : null;

  if (!playoffs) {
    return (
      <div>
        {stepper}
        <p>Playoffs have not been played.</p>
      </div>
    );
  }

  const roundNames = ['Round 1', 'Conference semis', 'Conference finals', 'NBA Finals'];

  return (
    <section aria-label="Playoff bracket">
      {stepper}
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

/** Attributes of the MyCareer player, who drives every Key Moment roll. */
function controlledAttributes(career: NonNullable<ReturnType<typeof useGameStore.getState>['career']>) {
  const player = career.players.find((p) => p.id === career.playerMode?.playerId);
  if (!player) throw new Error('controlledAttributes: MyCareer player not found');
  return player.attributes;
}
