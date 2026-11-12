import { useMemo, useState } from 'react';
import { SeededRng } from '../sim/core/random';
import {
  findTradeDestination,
  generatePlayerOffers,
  scoreOfferForPlayer,
  type CareerPriority,
} from '../sim/career/freeAgency';
import { shouldRequestTrade } from '../sim/career/playerMode';
import type { SeasonObjective } from '../sim/career/keyMomentTriggers';
import type { Badge, Player, Attributes } from '../sim/core/models';
import type { PlayerId } from '../sim/core/types';
import { useGameStore } from '../store/gameStore';
import { deriveRole, type PlayerCareerMode } from '../sim/career/playerMode';
import {
  ROLE_LABELS,
  formatDelta,
  selectAttributeGroups,
  selectBadges,
  selectContractSummary,
  selectHeader,
  selectObjectiveStatuses,
  selectSuperstarStandings,
  selectTrophyGroups,
} from './mycareerSelectors';

export interface MyCareerDashboardProps {
  /** Controlled player. Defaults to the user team's highest-overall player. */
  playerId?: PlayerId;
  /** Mode state (coach trust, happiness, ambition, trophies). Not yet stored; optional. */
  mode?: PlayerCareerMode | null;
  /** Prior-season attributes for year-over-year deltas. Null in Season 1. */
  previousAttributes?: Attributes | null;
  /** Badge definitions used to name the player's traits. Empty means ids are shown. */
  badgeCatalog?: Badge[];
  /** Current season's coach objectives. Empty shows the empty state. */
  objectives?: SeasonObjective[];
  /** Measured season values per objective id, from box-score totals. */
  objectiveActuals?: Partial<Record<SeasonObjective['id'], number | null>>;
  /** Whether the season has finished, which decides met versus missed. */
  seasonComplete?: boolean;
}

function Meter({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div>
        <span>{label}</span>: <span>Not tracked yet</span>
      </div>
    );
  }
  return (
    <div>
      <label>
        {label}
        <meter min={0} max={100} value={value} aria-valuetext={`${value} of 100`} />
      </label>{' '}
      <span>{value}/100</span>
    </div>
  );
}

const PRIORITIES: { id: CareerPriority; label: string }[] = [
  { id: 'max_money', label: 'Max Money' },
  { id: 'ring_chasing', label: 'Ring Chasing' },
  { id: 'market_size', label: 'Market Size' },
];

/** Offers for the player, ranked by score under the chosen priority (highest first). */
function rankedOffers(
  career: Parameters<typeof generatePlayerOffers>[0],
  player: Player,
  priority: CareerPriority,
) {
  return generatePlayerOffers(career, player, new SeededRng(player.overall * 1000 + player.age))
    .map((o) => ({ ...o, score: scoreOfferForPlayer(o, priority) }))
    .sort((a, b) => b.score - a.score);
}

export function MyCareerDashboard({
  playerId,
  mode = null,
  previousAttributes = null,
  badgeCatalog = [],
  objectives = [],
  objectiveActuals = {},
  seasonComplete = false,
}: MyCareerDashboardProps) {
  const career = useGameStore((s) => s.career);
  const season = useGameStore((s) => s.season);
  const [priority, setPriority] = useState<CareerPriority>('max_money');

  const player: Player | null = useMemo(() => {
    if (!career) return null;
    const id = playerId ?? defaultPlayerId(career);
    return id ? (career.players.find((p) => p.id === id) ?? null) : null;
  }, [career, playerId]);

  if (!career || !player) {
    return <section aria-label="MyCareer"><p>No player selected. Start a career to see your MyCareer.</p></section>;
  }

  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => b.overall - a.overall);
  const rosterRank = roster.findIndex((p) => p.id === player.id) + 1;
  const role = rosterRank > 0
    ? deriveRole({ rosterRank, overall: player.overall, isStarter: rosterRank <= 5 })
    : null;

  const header = selectHeader(player, mode, role);
  const groups = selectAttributeGroups(player.attributes, previousAttributes);
  const contract = selectContractSummary(player);
  const trophies = selectTrophyGroups(mode?.trophies ?? []);
  const standings = season ? selectSuperstarStandings(career, season, player.id) : [];
  const tradeTargets = shouldRequestTrade(career.careers.find((c) => c.playerId === player.id)?.unsignedOffseasons ?? 0)
    ? findTradeDestination(career, player.id)
    : [];
  const offers = contract.expiring ? rankedOffers(career, player, priority) : [];
  const badges = selectBadges(player, badgeCatalog);
  const objectiveRows = selectObjectiveStatuses(
    objectives,
    {
      points_per_game: objectiveActuals.points_per_game ?? null,
      win_pct: objectiveActuals.win_pct ?? null,
      fg_pct: objectiveActuals.fg_pct ?? null,
      assists_per_game: objectiveActuals.assists_per_game ?? null,
    },
    seasonComplete,
  );

  return (
    <section aria-label="MyCareer">
      <h2>MyCareer</h2>

      <section aria-label="Player card">
        <h3>{header.name}</h3>
        <p>
          {header.position} · {career.userTeamId} · Age {header.age}
        </p>
        <p>Role: {header.role ? ROLE_LABELS[header.role] : 'Unassigned'}</p>
        <p>Overall {header.overall} · Potential {header.potential}</p>
        <Meter label="Coach Trust" value={header.coachTrust} />
        <Meter label="Happiness" value={header.happiness} />
        <Meter label="Ambition" value={header.ambition} />
      </section>

      <section aria-label="Attribute progression">
        <h3>Attributes</h3>
        {groups.map((group) => (
          <div key={group.name}>
            <h4>{group.name}</h4>
            <table>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>{row.value}</td>
                    <td aria-label={`${row.label} change`}>{formatDelta(row.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section aria-label="Contract">
        <h3>Contract</h3>
        <p>Salary: ${contract.salary.toLocaleString()}</p>
        <p>Years left: {contract.yearsLeft}</p>
        <p>Total contract value: ${contract.totalValue.toLocaleString()}</p>
        <p>Career earnings (current contract): ${contract.currentContractEarnings.toLocaleString()}</p>
      </section>

      <section aria-label="Badges">
        <h3>Badges</h3>
        {player.badges.length === 0 ? (
          <p>No badges equipped.</p>
        ) : (
          <ul>
            {player.badges.map((id) => {
              const b = badges.find((x) => x.id === id);
              return (
                <li key={id} title={b?.description}>
                  {b ? `${b.name} (${b.tier})` : formatBadgeId(id)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Coach objectives">
        <h3>Coach objectives</h3>
        {objectiveRows.length === 0 ? (
          <p>No coach objectives active this season.</p>
        ) : (
          <ul>
            {objectiveRows.map((o) => (
              <li key={o.id}>
                {o.label}: target {o.target} · progress{' '}
                {o.actual === null ? 'not measured' : o.actual.toFixed(2)} · {o.status.replace('_', ' ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Trade request">
        <h3>Trade request</h3>
        {tradeTargets.length > 0 ? (
          <p>Eligible destinations: {tradeTargets.join(', ')}</p>
        ) : (
          <p>Trade request not available yet.</p>
        )}
      </section>

      {contract.expiring && (
        <section aria-label="Free agency offers">
          <h3>Free agency offers</h3>
          <fieldset>
            <legend>Priority</legend>
            {PRIORITIES.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name="offer-priority"
                  checked={priority === p.id}
                  onChange={() => setPriority(p.id)}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          <ol>
            {offers.map((o) => (
              <li key={o.teamId}>
                {o.teamId}: ${o.salary.toLocaleString()} for {o.years} yr(s), score {o.score.toFixed(1)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Trophy case">
        <h3>Trophy case</h3>
        {trophies.length === 0 ? (
          <p>No trophies won yet.</p>
        ) : (
          <ul>
            {trophies.map((group) => (
              <li key={group.kind}>
                {group.label}: {group.seasons.map((s) => `Season ${s}`).join(', ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Superstar standings">
        <h3>Superstar standings (PPG)</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Team</th>
              <th scope="col">OVR</th>
              <th scope="col">PPG</th>
              <th scope="col">RPG</th>
              <th scope="col">APG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.playerId} aria-current={row.isUser ? 'true' : undefined}>
                <td>{row.rank}</td>
                <td>{row.name}{row.isUser ? ' (you)' : ''}</td>
                <td>{row.teamId}</td>
                <td>{row.overall}</td>
                <td>{row.ppg.toFixed(1)}</td>
                <td>{row.rpg.toFixed(1)}</td>
                <td>{row.apg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

/** Turns a snake_case or slug badge id into readable words when no catalog name exists. */
export function formatBadgeId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function defaultPlayerId(career: { rosters: Record<string, PlayerId[]>; userTeamId: string; players: Player[] }): PlayerId | null {
  const ids = career.rosters[career.userTeamId] ?? [];
  let best: Player | null = null;
  for (const id of ids) {
    const p = career.players.find((x) => x.id === id);
    if (p && (!best || p.overall > best.overall)) best = p;
  }
  return best?.id ?? null;
}
