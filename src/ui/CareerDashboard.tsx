import { useGameStore } from '../store/gameStore';
import { sortStandings, winPct } from '../sim/league/standings';
import { payrollOf, capSpace } from '../sim/league/economy';
import { ROSTER_FLOOR } from '../sim/career/careerLoop';
import { KeyMomentCards } from './KeyMomentCards';
import { KeyMomentModal } from './KeyMomentModal';
import { GameLog } from './GameLog';

/** Season overview, the user roster summary, and conference standings. */
export function CareerDashboard() {
  const career = useGameStore((s) => s.career);
  const season = useGameStore((s) => s.season);
  const userTeamId = useGameStore((s) => s.userTeamId);
  const playSeason = useGameStore((s) => s.playSeason);
  const teams = useGameStore((s) => s.leagueTeams);
  const seasonRun = useGameStore((s) => s.seasonRun);
  const startSeasonRun = useGameStore((s) => s.startSeasonRun);
  const advanceSeasonRun = useGameStore((s) => s.advanceSeasonRun);
  const resolveSeasonMoment = useGameStore((s) => s.resolveSeasonMoment);
  const startPlayoffsRun = useGameStore((s) => s.startPlayoffsRun);
  const playoffsRun = useGameStore((s) => s.playoffsRun);
  const seed = useGameStore((s) => s.seed);

  if (!career || !userTeamId) return <p>No career started.</p>;

  // A run from an earlier season is stale: it is ignored until the new season starts.
  const currentRun = seasonRun && seasonRun.season === career.season ? seasonRun : null;
  const playoffsStarted =
    playoffsRun !== null && playoffsRun.season === career.season;
  // Standings come from the one-shot season, or from the resumable run the stepper drives.
  const standingsRows = season
    ? sortStandings(season.standings, season.outcomes)
    : currentRun?.standings
      ? sortStandings(currentRun.standings, currentRun.outcomes)
      : null;

  const roster = (career.rosters[userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const payroll = payrollOf(roster.map((p) => p.contract.salary));
  const moodById = new Map(career.careers.map((c) => [c.playerId, c]));
  const avgMood = roster.length
    ? Math.round(roster.reduce((sum, p) => sum + (moodById.get(p.id)?.mood ?? 0), 0) / roster.length)
    : 0;
  const avgChemistry = roster.length
    ? Math.round(roster.reduce((sum, p) => sum + (moodById.get(p.id)?.chemistry ?? 0), 0) / roster.length)
    : 0;

  return (
    <div>
      <h1>Season {career.season}</h1>
      <section aria-label="Roster summary">
        <h2>Your roster</h2>
        <ul>
          <li>Players: {roster.length} (floor {ROSTER_FLOOR}, cap 15)</li>
          <li>Average mood: {avgMood}</li>
          <li>Average chemistry: {avgChemistry}</li>
          <li>Payroll: {payroll} (cap space {capSpace(payroll)})</li>
        </ul>
      </section>
      {career.playerMode ? (
        <section aria-label="Season stepper">
          {!currentRun ? (
            <button type="button" onClick={() => teams && startSeasonRun(teams)} disabled={!teams}>
              Simulate Season
            </button>
          ) : currentRun.nextGame < currentRun.schedule.length && !currentRun.pending ? (
            <button type="button" onClick={() => advanceSeasonRun()}>
              Advance
            </button>
          ) : null}
          {currentRun?.standings && !currentRun.pending ? (
            <p>
              Regular season complete: {currentRun.standings.length} teams seeded.{' '}
              {playoffsStarted ? null : (
                <button type="button" onClick={() => teams && startPlayoffsRun(teams)}>
                  Start Playoffs
                </button>
              )}
            </p>
          ) : null}
          {currentRun?.pending ? (
            <KeyMomentModal
              title={`Key Moment in game ${currentRun.pending.gameIndex + 1} (${currentRun.pending.homeId} vs ${currentRun.pending.awayId})`}
              attributes={controlledAttributes(career)}
              rollSeed={seed + career.season + currentRun.pending.gameIndex}
              onResolve={(decision) => resolveSeasonMoment(decision)}
            />
          ) : null}
        </section>
      ) : null}
      {standingsRows ? (
        <Standings rows={standingsRows} userTeamId={userTeamId} />
      ) : career.playerMode ? null : (
        <button type="button" onClick={() => teams && playSeason(teams)} disabled={!teams}>
          Play season
        </button>
      )}
      <GameLog />
      <KeyMomentCards />
    </div>
  );
}

/** Attributes of the MyCareer player, who drives every Key Moment roll. */
function controlledAttributes(career: NonNullable<ReturnType<typeof useGameStore.getState>['career']>) {
  const player = career.players.find((p) => p.id === career.playerMode?.playerId);
  if (!player) throw new Error('controlledAttributes: MyCareer player not found');
  return player.attributes;
}

function Standings({ rows, userTeamId }: { rows: { teamId: string; conference: 'East' | 'West'; wins: number; losses: number }[]; userTeamId: string }) {
  return (
    <section aria-label="Standings">
      {(['East', 'West'] as const).map((conf) => (
        <table key={conf}>
          <caption>{conf}ern Conference</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">W</th>
              <th scope="col">L</th>
              <th scope="col">PCT</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.conference === conf)
              .map((r) => (
                <tr key={r.teamId} aria-current={r.teamId === userTeamId ? 'true' : undefined}>
                  <td>{r.teamId}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{winPct(r).toFixed(3)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}
