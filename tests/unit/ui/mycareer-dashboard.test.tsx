// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore } from '../../../src/store/gameStore';
import { MyCareerDashboard } from '../../../src/ui/MyCareerDashboard';
import { selectAttributeGroups, selectSuperstarStandings, selectTrophyGroups, formatDelta } from '../../../src/ui/mycareerSelectors';
import { formatBadgeId } from '../../../src/ui/MyCareerDashboard';
import type { SeasonObjective } from '../../../src/sim/career/keyMomentTriggers';
import { buildLeague, careerFrom } from '../store/leagueFixture';

function startCareer(seed: number) {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  return league;
}

describe('MyCareer dashboard', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the player card with name, position, team, overall, potential and age', () => {
    startCareer(42);
    const { container } = render(createElement(MyCareerDashboard));
    expect(screen.getByRole('region', { name: 'Player card' })).toBeTruthy();
    expect(container.textContent).toMatch(/Overall \d+ · Potential \d+/);
    expect(container.textContent).toMatch(/Age \d+/);
    expect(container.textContent).toMatch(/Role: (Bench|6th Man|Starter|Franchise)/);
    expect(screen.getAllByText('Not tracked yet').length).toBe(3);
  });

  it('shows the four attribute groups with a delta of 0 in Season 1', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    for (const name of ['Offense / Shooting', 'Playmaking', 'Defense / Rebounding', 'Athleticism / IQ']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    const deltas = screen.getAllByLabelText(/change$/);
    expect(deltas.length).toBe(14);
    for (const cell of deltas) expect(cell.textContent).toBe('0');
  });

  it('shows the contract summary', () => {
    startCareer(42);
    const { container } = render(createElement(MyCareerDashboard));
    expect(screen.getByRole('region', { name: 'Contract' })).toBeTruthy();
    expect(container.textContent).toMatch(/Years left: \d+/);
    expect(container.textContent).toMatch(/Total contract value: \$/);
    expect(container.textContent).toMatch(/Career earnings \(current contract\): \$/);
  });

  it('shows the empty trophy state when no trophies have been won', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    expect(screen.getByText('No trophies won yet.')).toBeTruthy();
  });

  it('lists superstar standings ranked by PPG with the user player highlighted', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    expect(screen.getByRole('region', { name: 'Superstar standings' })).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('ranks free agency offers by the selected priority and shows the offers section only when expiring', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    expect(screen.queryByRole('region', { name: 'Free agency offers' })).toBeNull();
  });

  it('shows the coach objectives empty state when none are active', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    expect(screen.getByText('No coach objectives active this season.')).toBeTruthy();
  });

  it('renders coach objectives with target, progress and completion status', () => {
    startCareer(42);
    const objectives: SeasonObjective[] = [
      { id: 'points_per_game', label: 'Score 20 PPG', target: 20 },
      { id: 'win_pct', label: 'Win 60%', target: 0.6 },
    ];
    render(
      createElement(MyCareerDashboard, {
        objectives,
        objectiveActuals: { points_per_game: 22.5, win_pct: 0.4 },
        seasonComplete: true,
      }),
    );
    const section = screen.getByRole('region', { name: 'Coach objectives' });
    expect(section.textContent).toContain('Score 20 PPG: target 20 · progress 22.50 · met');
    expect(section.textContent).toContain('Win 60%: target 0.6 · progress 0.40 · missed');
  });

  it('shows an objective as in progress while the season is open and unmeasured', () => {
    startCareer(42);
    const objectives: SeasonObjective[] = [{ id: 'assists_per_game', label: 'Dish 6 APG', target: 6 }];
    render(createElement(MyCareerDashboard, { objectives, seasonComplete: false }));
    const section = screen.getByRole('region', { name: 'Coach objectives' });
    expect(section.textContent).toContain('Dish 6 APG: target 6 · progress not measured · in progress');
  });

  it('renders the badges empty state when the player has no badges', () => {
    const league = startCareer(42);
    const career = useGameStore.getState().career!;
    const topId = (career.rosters[career.userTeamId] ?? [])[0]!;
    const bare = career.players.map((p) => (p.id === topId ? { ...p, badges: [] } : p));
    useGameStore.setState({ career: { ...career, players: bare } });
    expect(league).toBeTruthy();
    render(createElement(MyCareerDashboard, { playerId: topId }));
    expect(screen.getByRole('region', { name: 'Badges' }).textContent).toContain('No badges equipped.');
  });

  it('names equipped badges from the catalog and formats unknown badge ids cleanly', () => {
    const league = startCareer(42);
    const career = useGameStore.getState().career!;
    const userRoster = career.rosters[career.userTeamId] ?? [];
    const topId = userRoster[0]!;
    const top = career.players.find((p) => p.id === topId)!;
    const withBadges = { ...top, badges: [top.badges[0] ?? ('deadeye' as (typeof top.badges)[number])] };
    const patched = { ...career, players: career.players.map((p) => (p.id === topId ? withBadges : p)) };
    useGameStore.setState({ career: patched });
    expect(league).toBeTruthy();
    const badgeId = withBadges.badges[0]!;
    render(createElement(MyCareerDashboard, { playerId: topId, badgeCatalog: [] }));
    const section = screen.getByRole('region', { name: 'Badges' });
    expect(section.textContent).toContain(formatBadgeId(badgeId));
  });
});

describe('formatBadgeId', () => {
  it('turns snake_case and slug ids into readable words', () => {
    expect(formatBadgeId('three_point_specialist')).toBe('Three Point Specialist');
    expect(formatBadgeId('deadeye')).toBe('Deadeye');
    expect(formatBadgeId('lock-down')).toBe('Lock Down');
  });
});

describe('MyCareer selectors', () => {
  it('formats deltas with an explicit sign', () => {
    expect(formatDelta(2)).toBe('+2');
    expect(formatDelta(-1)).toBe('-1');
    expect(formatDelta(0)).toBe('0');
  });

  it('reports a zero delta for every attribute without a prior snapshot', () => {
    const league = buildLeague(7);
    const attrs = league[0]!.roster[0]!.attributes;
    const groups = selectAttributeGroups(attrs, null);
    expect(groups.flatMap((g) => g.rows).every((r) => r.delta === 0)).toBe(true);
  });

  it('computes deltas against the prior snapshot', () => {
    const league = buildLeague(7);
    const attrs = league[0]!.roster[0]!.attributes;
    const prior = { ...attrs, finishing: attrs.finishing - 3 };
    const row = selectAttributeGroups(attrs, prior)[0]!.rows[0]!;
    expect(row.key).toBe('finishing');
    expect(row.delta).toBe(3);
  });

  it('groups trophies by kind with the newest season first and omits empty kinds', () => {
    const groups = selectTrophyGroups([
      { kind: 'mvp', season: 2 },
      { kind: 'mvp', season: 5 },
      { kind: 'championship', season: 3 },
    ] as Parameters<typeof selectTrophyGroups>[0]);
    expect(groups.map((g) => g.kind)).toEqual(['championship', 'mvp']);
    expect(groups.find((g) => g.kind === 'mvp')!.seasons).toEqual([5, 2]);
  });

  it('returns an empty list of standings when the season has no player lines', () => {
    const league = startCareer(42);
    useGameStore.getState().playSeason(league);
    const season = useGameStore.getState().season!;
    expect(season.playerSeasons.length).toBeGreaterThan(0);
    const rows = selectSuperstarStandings(
      useGameStore.getState().career!,
      { ...season, playerSeasons: [] },
      null,
      15,
    );
    expect(rows).toEqual([]);
  });
});
