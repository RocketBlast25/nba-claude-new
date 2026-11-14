// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore } from '../../../src/store/gameStore';
import { AwardsRecapCard } from '../../../src/ui/AwardsRecapCard';
import type { AwardsRecapPayload } from '../../../src/persistence/snapshot';
import { buildLeague, careerFrom } from '../store/leagueFixture';

/** Starts a player career and returns the controlled player's id and a teammate's id. */
function startPlayerCareer() {
  const league = buildLeague(17);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed: 17, leagueTeams: league });
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id)!)
    .sort((a, b) => b.overall - a.overall);
  const result = useGameStore.getState().startPlayerCareer(roster[0]!.id);
  if (!result.ok) throw new Error(result.reason);
  return { userId: roster[0]!.id, rivalId: roster[1]!.id, career: useGameStore.getState().career! };
}

describe('AwardsRecapCard', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing without a recap', () => {
    startPlayerCareer();
    const { container } = render(createElement(AwardsRecapCard));
    expect(container.textContent).toBe('');
  });

  it('shows each ballot with its winner and vote shares, highlighting the user row', () => {
    const { userId, rivalId, career } = startPlayerCareer();
    const recap: AwardsRecapPayload = {
      stage: 'regular_season',
      season: 2,
      userAwards: ['mvp'],
      entries: [
        {
          kind: 'mvp',
          winnerId: userId,
          userRank: 1,
          top: [
            { playerId: userId, score: 9, share: 0.6, rank: 1 },
            { playerId: rivalId, score: 6, share: 0.4, rank: 2 },
          ],
        },
        {
          kind: 'dpoy',
          winnerId: rivalId,
          userRank: 7,
          top: [{ playerId: rivalId, score: 8, share: 1, rank: 1 }],
        },
        {
          kind: 'all_league',
          winnerId: null,
          userRank: null,
          top: [],
        },
      ],
    };
    useGameStore.setState({ awardsRecap: recap });

    render(createElement(AwardsRecapCard));

    const dialog = screen.getByRole('dialog', { name: '2 Season Awards' });
    expect(within(dialog).getByText('You won: Most Valuable Player.')).toBeTruthy();

    const mvp = within(dialog).getByRole('region', { name: 'Most Valuable Player' });
    expect(within(mvp).getByText('60%')).toBeTruthy();
    expect(within(mvp).getByText('40%')).toBeTruthy();
    const table = within(mvp).getByRole('table');
    const userRow = within(table).getAllByRole('row').find((row) => row.classList.contains('awards-user-row'));
    expect(userRow).toBeTruthy();
    expect(within(userRow!).getByText('60%')).toBeTruthy();
    expect(career.players.some((p) => p.id === userId)).toBe(true);

    const dpoy = within(dialog).getByRole('region', { name: 'Defensive Player of the Year' });
          expect(within(dpoy).getByText('Your player finished #7 on this ballot.')).toBeTruthy();

    const allNba = within(dialog).getByRole('region', { name: 'All-NBA' });
    expect(within(allNba).getByText(/Winner:/)).toBeTruthy();
  });

  it('dismisses cleanly and removes the dialog', () => {
    const { userId, rivalId } = startPlayerCareer();
    useGameStore.setState({
      awardsRecap: {
        stage: 'regular_season',
        season: 2,
        userAwards: [],
        entries: [
          {
            kind: 'mvp',
            winnerId: rivalId,
            userRank: 2,
            top: [
              { playerId: rivalId, score: 9, share: 1, rank: 1 },
              { playerId: userId, score: 3, share: 0.2, rank: 2 },
            ],
          },
        ],
      },
    });

    render(createElement(AwardsRecapCard));
    expect(screen.getByRole('dialog', { name: '2 Season Awards' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().awardsRecap).toBeNull();
  });
});
