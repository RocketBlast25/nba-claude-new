import { useMemo, useState } from 'react';
import type { Attributes, AttributeKey, Badge, Player, Position } from '../sim/core/models';
import { overallOf } from '../sim/league/roster';
import type { PlayerId } from '../sim/core/types';
import type { CareerState } from '../sim/career/types';
import type { SeasonObjective } from '../sim/career/keyMomentTriggers';
import { ARCHETYPES, POSITION_OPTIONS, type ArchetypeId } from '../sim/career/customPlayer';
import { deriveRole, emptyCareerStats } from '../sim/career/playerMode';
import { rankAgainstGoats, userGoatProfile } from '../sim/career/goatRanking';
import { buildTaleOfTheTape, nextMilestone } from '../sim/career/goatCompare';
import { legendById } from '../sim/career/goatCatalog';
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_ORDER,
  attributeCap,
  upgradeCost,
  type SkillCategory,
  type TrainingFocus,
} from '../sim/career/skillPoints';
import { useGameStore } from '../store/gameStore';
import {
  ROLE_LABELS,
  formatBadgeId,
  formatDelta,
  selectAttributeGroups,
  selectBadges,
  selectContractSummary,
  selectHeader,
  selectObjectiveStatuses,
  selectTrophyGroups,
} from './mycareerSelectors';
import { teamLabel, type TabId } from './careerViewModel';

type Section = 'Overview' | 'Attributes' | 'Accolades' | 'Legacy' | 'Contract';
const SECTIONS: Section[] = ['Overview', 'Attributes', 'Accolades', 'Legacy', 'Contract'];

export interface MyCareerPanelProps {
  /** Controlled player. Defaults to the career's player-mode player. */
  playerId?: PlayerId;
  /** Prior-season attributes for year-over-year deltas. Null in Season 1. */
  previousAttributes?: Attributes | null;
  /** Badge definitions used to name the player's traits. Empty means ids are shown. */
  badgeCatalog?: Badge[];
  /** Current season's coach objectives. Defaults to the career's active objectives. */
  objectives?: SeasonObjective[];
  /** Measured season values per objective id, from box-score totals. */
  objectiveActuals?: Partial<Record<SeasonObjective['id'], number | null>>;
  /** Whether the season has finished, which decides met versus missed. */
  seasonComplete?: boolean;
  onNavigate?: (tab: TabId) => void;
}

/**
 * MyCareer: identity, attributes, accolades, legacy (career totals and the all-time
 * GOAT board) and the contract summary, split into pills so no one page is a wall.
 * Contract moves, trade requests and offers live in Front Office.
 */
/** Per-game averages show one decimal; counts and totals are whole numbers. */
function formatTape(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function MyCareerPanel({
  playerId,
  previousAttributes = null,
  badgeCatalog = [],
  objectives,
  objectiveActuals = {},
  seasonComplete = false,
  onNavigate,
}: MyCareerPanelProps) {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const [section, setSection] = useState<Section>('Overview');
  const [compareId, setCompareId] = useState<string | null>(null);

  const player: Player | null = useMemo(() => {
    if (!career) return null;
    const id = playerId ?? career.playerMode?.playerId ?? defaultPlayerId(career);
    return id ? (career.players.find((p) => p.id === id) ?? null) : null;
  }, [career, playerId]);

  if (!career) return <p>No career started.</p>;
  if (!player) {
    return (
      <section className="panel" aria-label="MyCareer">
        <h2>MyCareer</h2>
        <p className="muted">No player found for this career. Start a new career from Saves.</p>
        <button type="button" className="secondary" onClick={() => onNavigate?.('saves')}>
          Go to Saves
        </button>
      </section>
    );
  }

  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => b.overall - a.overall);
  const rosterRank = roster.findIndex((p) => p.id === player.id) + 1;
  const role =
    rosterRank > 0 ? deriveRole({ rosterRank, overall: player.overall, isStarter: rosterRank <= 5 }) : null;

  const header = selectHeader(player, career.playerMode ?? null, role);
  const groups = selectAttributeGroups(player.attributes, previousAttributes);
  const contract = selectContractSummary(player);
  const trophies = selectTrophyGroups(career.playerMode?.trophies ?? []);
  const badges = selectBadges(player, badgeCatalog);
  const activeObjectives = objectives ?? career.playerMode?.activeObjectives ?? [];
  const objectiveRows = selectObjectiveStatuses(
    activeObjectives,
    {
      points_per_game: objectiveActuals.points_per_game ?? null,
      win_pct: objectiveActuals.win_pct ?? null,
      fg_pct: objectiveActuals.fg_pct ?? null,
      assists_per_game: objectiveActuals.assists_per_game ?? null,
    },
    seasonComplete,
  );
  const stats = career.playerMode?.careerStats ?? emptyCareerStats();
  const board = rankAgainstGoats(career, player.id);
  const userRow = board.find((e) => e.isUser) ?? null;
  const compareLegend = compareId ? legendById(compareId) ?? null : null;
  const userProfile = compareLegend ? userGoatProfile(career, player.id) : null;
  const tape = compareLegend && userProfile ? buildTaleOfTheTape(userProfile, compareLegend) : null;
  const milestone = userProfile ? nextMilestone(userProfile) : null;

  return (
    <section aria-label="MyCareer" className="career">
      {career.playerMode ? null : <CareerSetup career={career} />}

      <div role="group" aria-label="MyCareer sections" className="pillbar">
        {SECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            className="pill-button"
            aria-pressed={section === name}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {section === 'Overview' ? (
        <div className="grid-2">
          <section className="panel" aria-label="Player card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{teamLabel(career, career.userTeamId)}</p>
                <h2>{header.name}</h2>
              </div>
              <span className="pill accent">OVR {header.overall}</span>
            </div>
            <p className="muted">
              {header.position} · Age {header.age} · Potential {header.potential}
            </p>
            <p>Role: {header.role ? ROLE_LABELS[header.role] : 'Unassigned'}</p>
            <div className="meter-list">
              <Meter label="Coach trust" value={header.coachTrust} />
              <Meter label="Happiness" value={header.happiness} />
              <Meter label="Ambition" value={header.ambition} />
            </div>
          </section>

          <section className="panel" aria-label="Coach objectives">
            <h3>Coach objectives</h3>
            {objectiveRows.length === 0 ? (
              <p className="muted">No coach objectives active this season.</p>
            ) : (
              <ul className="objective-list">
                {objectiveRows.map((o) => (
                  <li key={o.id} className={`objective ${o.status}`}>
                    <span>{o.label}</span>
                    <span className="muted">
                      target {o.target} ·{' '}
                      {o.actual === null ? 'not measured' : o.actual.toFixed(2)} ·{' '}
                      {o.status.replace('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-label="Badges">
            <h3>Badges</h3>
            {player.badges.length === 0 ? (
              <p className="muted">No badges equipped.</p>
            ) : (
              <ul className="chip-list">
                {player.badges.map((id) => {
                  const b = badges.find((x) => x.id === id);
                  return (
                    <li key={id} className="chip" title={b?.description}>
                      {b ? `${b.name} (${b.tier})` : formatBadgeId(id)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {section === 'Attributes' ? (
        <section className="panel" aria-label="Attribute progression">
          <h2>Attributes</h2>
          <SkillPointsPanel
            player={player}
            skillPoints={career.playerMode?.skillPoints ?? 0}
            trainingFocus={career.playerMode?.trainingFocus ?? null}
            offseason={phase === 'offseason'}
          />
          <div className="grid-2">
            {groups.map((group) => (
              <div key={group.name}>
                <h3>{group.name}</h3>
                <table className="stat-table">
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td className="num">{row.value}</td>
                        <td className="num" aria-label={`${row.label} change`}>
                          {formatDelta(row.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {section === 'Accolades' ? (
        <section className="panel" aria-label="Trophy case">
          <h2>Accolades</h2>
          {trophies.length === 0 ? (
            <p className="muted">No trophies won yet. Win games, earn All-NBA, and chase a ring.</p>
          ) : (
            <ul className="chip-list">
              {trophies.map((group) => (
                <li key={group.kind} className="chip trophy">
                  <strong>{group.label}</strong> · {group.seasons.map((s) => `S${s}`).join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === 'Legacy' ? (
        <div className="stack">
          <section className="panel" aria-label="Career totals">
            <div className="panel-head">
              <h2>Career totals</h2>
              <span className="pill">{stats.gamesPlayed} games</span>
            </div>
            <dl className="stat-grid">
              <div>
                <dt>Points</dt>
                <dd>{stats.points.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Rebounds</dt>
                <dd>{stats.rebounds.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Assists</dt>
                <dd>{stats.assists.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Steals</dt>
                <dd>{stats.steals.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Blocks</dt>
                <dd>{stats.blocks.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Playoff points</dt>
                <dd>{stats.playoffPoints.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Playoff games</dt>
                <dd>{stats.playoffGames}</dd>
              </div>
              <div>
                <dt>Finals appearances</dt>
                <dd>{stats.finalsAppearances}</dd>
              </div>
            </dl>
          </section>

          <section className="panel" aria-label="All-time GOAT leaderboard">
            <div className="panel-head">
              <h2>All-time GOAT leaderboard</h2>
              {userRow ? (
                <span className="pill accent">
                  #{userRow.rank} · {userRow.goatScore.toFixed(1)}
                </span>
              ) : null}
            </div>
            {userRow ? (
              <p className="hint">Tier: {userRow.tier}</p>
            ) : (
              <p className="muted">Score your career against the 20 all-time greats.</p>
            )}
            <table className="stat-table">
              <thead>
                <tr>
                  <th scope="col" className="num">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Tier</th>
                  <th scope="col" className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => (
                  <tr key={`${row.rank}-${row.name}`} aria-current={row.isUser ? 'true' : undefined}>
                    <td className="num">{row.rank}</td>
                    <th scope="row">
                      {row.legendId ? (
                        <button
                          type="button"
                          className="link-button"
                          aria-pressed={compareId === row.legendId}
                          onClick={() => setCompareId(row.legendId)}
                        >
                          {row.name}
                        </button>
                      ) : (
                        <>
                          {row.name}
                          {row.isUser ? ' (you)' : ''}
                        </>
                      )}
                    </th>
                    <td>{row.tier}</td>
                    <td className="num">{row.goatScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {userRow?.nextMilestoneHint ? <p className="hint">{userRow.nextMilestoneHint}</p> : null}
            {tape && compareLegend && milestone ? (
              <div className="tape" aria-label="Tale of the Tape">
                <h3>Tale of the Tape: you vs {compareLegend.name}</h3>
                <table className="stat-table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">You</th>
                      <th scope="col">Stat</th>
                      <th scope="col" className="num">{compareLegend.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tape.rows.map((row) => (
                      <tr key={row.key} data-leader={row.leader}>
                        <td className="num">{formatTape(row.user)}</td>
                        <th scope="row">{row.label}</th>
                        <td className="num">{formatTape(row.legend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Next Milestone</h3>
                {milestone.target ? (
                  <>
                    <p className="hint">
                      Pass {milestone.target.name} with {Math.ceil(milestone.scoreGap * 10) / 10} more GOAT score.
                    </p>
                    <ul>
                      {milestone.gaps.map((gap) => (
                        <li key={gap.key}>
                          {gap.needed} more {gap.label}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="hint">You already rank above every legend.</p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {section === 'Contract' ? (
        <section className="panel" aria-label="Contract">
          <h2>Contract</h2>
          <dl className="stat-grid">
            <div>
              <dt>Salary</dt>
              <dd>${contract.salary.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Years left</dt>
              <dd>{contract.yearsLeft}</dd>
            </div>
            <div>
              <dt>Total value</dt>
              <dd>${contract.totalValue.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Current-contract earnings</dt>
              <dd>${contract.currentContractEarnings.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="muted">
            Offers, trade requests and franchise moves live in Front Office.
          </p>
          <button type="button" className="secondary" onClick={() => onNavigate?.('frontoffice')}>
            Open Front Office
          </button>
        </section>
      ) : null}
    </section>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="meter">
      <span>{label}</span>
      {value === null ? (
        <span className="muted">Not tracked yet</span>
      ) : (
        <>
          <meter min={0} max={100} value={value} aria-valuetext={`${value} of 100`} />
          <span className="num">{value}/100</span>
        </>
      )}
    </div>
  );
}

/**
 * Pick Your Player entry point, shown while the career has no controlled player
 * (for example a save imported from before player mode existed). Not a dead end:
 * either pick someone or create a player.
 */
function CareerSetup({ career }: { career: CareerState }) {
  const startPlayerCareer = useGameStore((s) => s.startPlayerCareer);
  const createPlayer = useGameStore((s) => s.createPlayer);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('PG');
  const [archetype, setArchetype] = useState<ArchetypeId>('all_around');
  const [error, setError] = useState<string | null>(null);

  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  const start = (playerId: Player['id']) => {
    const started = startPlayerCareer(playerId);
    setError(started.ok ? null : started.reason);
  };

  return (
    <section className="panel" aria-label="Career setup">
      <h2>Pick your player</h2>
      <p className="muted">Choose a player on {teamLabel(career, career.userTeamId)} to control for this career.</p>
      <ul className="pick-list">
        {roster.map((p) => (
          <li key={p.id}>
            <span>
              {p.name} · {p.position} · OVR {p.overall}
            </span>
            <button type="button" className="secondary" onClick={() => start(p.id)}>
              Start career with {p.name}
            </button>
          </li>
        ))}
      </ul>
      <form
        aria-label="Create your own player"
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          const made = createPlayer({ name, position, archetype });
          if (!made.ok) {
            setError(made.reason);
            return;
          }
          start(made.playerId);
        }}
      >
        <h3>Create your own player</h3>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Position{' '}
          <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {POSITION_OPTIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label>
          Archetype{' '}
          <select value={archetype} onChange={(e) => setArchetype(e.target.value as ArchetypeId)}>
            {ARCHETYPES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="secondary">
          Create player
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}

const SKILL_LABELS: Record<SkillCategory, string> = {
  finishing: 'Finishing',
  shooting: 'Shooting',
  playmaking: 'Playmaking',
  perimeter_defense: 'Perimeter Defense',
  interior_defense: 'Interior Defense',
  athleticism: 'Athleticism',
};

/**
 * Skill point balance, one "+" per attribute category, and the offseason training focus.
 * Upgrades use the store's spend action, which applies the sim's cost and cap rules.
 */
function SkillPointsPanel({
  player,
  skillPoints,
  trainingFocus,
  offseason,
}: {
  player: Player;
  skillPoints: number;
  trainingFocus: TrainingFocus;
  offseason: boolean;
}) {
  const spendSkillPoint = useGameStore((s) => s.spendSkillPoint);
  const setTrainingFocus = useGameStore((s) => s.setTrainingFocus);
  const [message, setMessage] = useState<string | null>(null);
  const overall = overallOf(player.attributes);
  const cap = attributeCap(overall);

  return (
    <div className="skill-points" aria-label="Skill points">
      <p>
        <strong>Skill points:</strong> {skillPoints} · Overall cap {cap}
      </p>
      <table className="stat-table">
        <tbody>
          {SKILL_CATEGORY_ORDER.map((category) => {
            // "+" raises the weakest attribute in the category; ties keep the listed order.
            const attr = SKILL_CATEGORIES[category].reduce((low, a) =>
              player.attributes[a] < player.attributes[low] ? a : low,
            ) as AttributeKey;
            const current = player.attributes[attr];
            const cost = upgradeCost(current);
            return (
              <tr key={category}>
                <th scope="row">{SKILL_LABELS[category]}</th>
                <td className="num">
                  {SKILL_CATEGORIES[category].map((a) => player.attributes[a]).join(' / ')}
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Upgrade ${SKILL_LABELS[category]} for ${cost} SP`}
                    disabled={skillPoints < cost || current >= cap}
                    onClick={() => {
                      const result = spendSkillPoint(attr);
                      setMessage(result.ok ? null : result.reason);
                    }}
                  >
                    + ({cost} SP)
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {message ? <p role="alert">{message}</p> : null}
      {offseason ? (
        <label>
          Offseason training focus{' '}
          <select
            aria-label="Offseason training focus"
            value={trainingFocus ?? ''}
            onChange={(e) =>
              setTrainingFocus(e.target.value === '' ? null : (e.target.value as SkillCategory))
            }
          >
            <option value="">None</option>
            {SKILL_CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {SKILL_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
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
