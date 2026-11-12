import { useGameStore } from '../store/gameStore';
import { ROSTER_FLOOR } from '../sim/career/careerLoop';
import { LEAGUE_CONFIG } from '../sim/league/leagueConfig';
import { DraftRoom } from './DraftRoom';

/**
 * Offseason summary: retirements, roster floor and cap status for every team,
 * and the user's mood leverage. All figures come from the store's career state.
 */
export function OffseasonHub() {
  const career = useGameStore((s) => s.career);
  const userTeamId = useGameStore((s) => s.userTeamId);
  const runOffseason = useGameStore((s) => s.runOffseason);
  const phase = useGameStore((s) => s.phase);
  const season = useGameStore((s) => s.season);
  const playoffs = useGameStore((s) => s.playoffs);

  if (!career || !userTeamId) return <p>No career started.</p>;

  const retired = career.careers.filter((c) => c.retired && c.retiredSeason === career.season).length;
  const teamIds = Object.keys(career.rosters) as (keyof typeof career.rosters)[];
  const rosterStatus = teamIds.map((id) => {
    const count = career.rosters[id]?.length ?? 0;
    const status = count < ROSTER_FLOOR ? 'below floor' : count > LEAGUE_CONFIG.maxRosterSize ? 'over cap' : 'ok';
    return { id, count, status };
  });
  const flagged = rosterStatus.filter((r) => r.status !== 'ok');
  const userRoster = career.rosters[userTeamId] ?? [];
  const moodById = new Map(career.careers.map((c) => [c.playerId, c.mood]));
  const userMood = userRoster.length
    ? Math.round(userRoster.reduce((sum, id) => sum + (moodById.get(id) ?? 0), 0) / userRoster.length)
    : 0;

  return (
    <section aria-label="Offseason hub">
      <h2>Offseason {career.season}</h2>
      <ul>
        <li>Retirements this offseason: {retired}</li>
        <li>
          Your roster: {userRoster.length} players (floor {ROSTER_FLOOR}, cap {LEAGUE_CONFIG.maxRosterSize})
        </li>
        <li>Your average mood (re-sign leverage): {userMood}</li>
        <li>
          Teams outside floor or cap: {flagged.length === 0 ? 'none' : flagged.map((f) => `${f.id} (${f.count}, ${f.status})`).join(', ')}
        </li>
      </ul>
      {phase !== 'offseason' && season && playoffs ? (
        <button type="button" onClick={() => runOffseason()}>
          Run offseason
        </button>
      ) : null}
      <DraftRoom />
    </section>
  );
}
