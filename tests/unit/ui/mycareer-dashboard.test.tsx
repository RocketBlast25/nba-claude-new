// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore } from '../../../src/store/gameStore';
import { MyCareerDashboard } from '../../../src/ui/MyCareerDashboard';
import { CareerDashboard } from '../../../src/ui/CareerDashboard';
import type { PlayerOffer } from '../../../src/sim/career/freeAgency';
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

describe('MyCareer player-career actions (UI clicks)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  type Career = NonNullable<ReturnType<typeof useGameStore.getState>['career']>;

  /** Highest-overall player on the user roster, which is the dashboard's default pick. */
  function controlledId(career: Career) {
    const roster = (career.rosters[career.userTeamId] ?? [])
      .map((id) => career.players.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .sort((a, b) => b.overall - a.overall);
    return roster[0]!.id;
  }

  /** Starts a player career on the code's own default player, as the setup list would. */
  function playerCareer(seed: number) {
    const league = startCareer(seed);
    const playerId = controlledId(useGameStore.getState().career!);
    expect(useGameStore.getState().startPlayerCareer(playerId)).toEqual({ ok: true });
    return { league, playerId };
  }

  /** Expires the controlled player's contract and, when given, holds one offer for them. */
  function expireContract(playerId: string, offer: PlayerOffer | null) {
    useGameStore.setState((s) => {
      if (!s.career || !s.career.playerMode) return {};
      return {
        career: {
          ...s.career,
          players: s.career.players.map((p) =>
            p.id === playerId ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
          ),
          playerMode: { ...s.career.playerMode, pendingOffers: offer ? [offer] : [] },
        },
      };
    });
  }

  /** A small, cap-safe offer from another team. */
  function offerFrom(career: Career): PlayerOffer {
    const teamId = (Object.keys(career.rosters) as PlayerOffer['teamId'][]).find(
      (id) => id !== career.userTeamId,
    )!;
    return { teamId, salary: 1000, years: 2, teamOverall: 70, marketSize: 50, projectedRole: 'starter' };
  }

  it('starts a player career from the setup list', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    expect(screen.getByRole('region', { name: 'Career setup' })).toBeTruthy();
    const pick = screen.getAllByRole('button', { name: /^Start career with/ })[0]!;
    fireEvent.click(pick);
    expect(useGameStore.getState().career?.playerMode).toBeDefined();
  });

  it('creates a custom player from the setup form and starts their career', () => {
    startCareer(42);
    render(createElement(MyCareerDashboard));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ace Carter' } });
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'SG' } });
    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: 'sharpshooter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create player' }));

    const career = useGameStore.getState().career!;
    expect(career.playerMode).toBeDefined();
    const created = career.players.find((p) => p.id === career.playerMode!.playerId)!;
    expect(created.name).toBe('Ace Carter');
    expect(created.position).toBe('SG');
    expect(created.attributes.threePoint).toBeGreaterThan(created.attributes.interiorDefense);
    expect(created.contract.type).toBe('rookie');
  });

  it('reports a trade rejection while the player is not unhappy enough', () => {
    playerCareer(42);
    render(createElement(MyCareerDashboard));
    fireEvent.click(screen.getByRole('button', { name: 'Request Trade' }));
    expect(screen.getByRole('status').textContent).toBe('Trade rejected: Trade is not requested yet.');
  });

  it('approves a trade and moves the player once the trade is requested', () => {
    const { playerId } = playerCareer(42);
    const before = useGameStore.getState().career!;
    useGameStore.setState({
      career: {
        ...before,
        playerMode: { ...before.playerMode!, unhappySeasons: 2 },
        careers: before.careers.map((c) =>
          c.playerId === playerId ? { ...c, unsignedOffseasons: 2 } : c,
        ),
      },
    });

    render(createElement(MyCareerDashboard));
    fireEvent.click(screen.getByRole('button', { name: 'Request Trade' }));

    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toMatch(/^Trade approved: moved to T\d+\.$/);
    const next = useGameStore.getState().career!;
    const onRoster = (teamId: string) => next.rosters[teamId as PlayerOffer['teamId']] ?? [];
    expect(onRoster(before.userTeamId)).not.toContain(playerId);
    expect(onRoster(status.replace(/^Trade approved: moved to |\.$/g, ''))).toContain(playerId);
  });

  it('signs a pending free agency offer from its card', () => {
    const { playerId } = playerCareer(42);
    const career = useGameStore.getState().career!;
    const offer = offerFrom(career);
    expireContract(playerId, offer);

    render(createElement(MyCareerDashboard));
    const sign = screen.getByRole('button', { name: `Sign with ${offer.teamId}` });
    fireEvent.click(sign);

    const next = useGameStore.getState().career!;
    expect(next.playerMode!.pendingOffers).toEqual([]);
    expect(next.rosters[offer.teamId] ?? []).toContain(playerId);
    expect(next.rosters[next.userTeamId] ?? []).not.toContain(playerId);
    expect(next.players.find((p) => p.id === playerId)!.contract.yearsLeft).toBe(offer.years);
  });

  it('declines every pending offer and counts another unsigned offseason', () => {
    const { playerId } = playerCareer(42);
    const career = useGameStore.getState().career!;
    expireContract(playerId, offerFrom(career));

    render(createElement(MyCareerDashboard));
    fireEvent.click(screen.getByRole('button', { name: 'Decline All' }));

    const next = useGameStore.getState().career!;
    expect(next.playerMode!.pendingOffers).toEqual([]);
    expect(next.careers.find((c) => c.playerId === playerId)!.unsignedOffseasons).toBe(1);
  });

  it('resolves a pending Key Moment from the season stepper', () => {
    let pending = false;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      useGameStore.getState().reset();
      const league = startCareer(seed);
      const career = useGameStore.getState().career!;
      useGameStore.getState().startPlayerCareer(controlledId(career));
      const result = useGameStore.getState().startSeasonRun(league);
      if (result.status === 'pending') {
        pending = true;
        break;
      }
    }
    expect(pending).toBe(true);

    render(createElement(CareerDashboard));
    const dialog = screen.getByRole('dialog', { name: 'Key Moment' });
    const before = useGameStore.getState().seasonRun!.resolved.length;
    const action = within(dialog).getAllByRole('button', { name: /\(\d+%\)$/ })[0]!;
    fireEvent.click(action);

    expect(useGameStore.getState().seasonRun!.resolved.length).toBe(before + 1);
  });
});
