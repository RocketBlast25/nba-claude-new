// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore } from '../../../src/store/gameStore';
import { MyCareerPanel } from '../../../src/ui/MyCareerPanel';
import { GOAT_LEGENDS } from '../../../src/sim/career/goatCatalog';
import { buildLeague, careerFrom } from '../store/leagueFixture';

function startPlayerCareer() {
  const league = buildLeague(23);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed: 23, leagueTeams: league });
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id)!)
    .sort((a, b) => b.overall - a.overall);
  const result = useGameStore.getState().startPlayerCareer(roster[0]!.id);
  if (!result.ok) throw new Error(result.reason);
}

describe('GOAT Tale of the Tape card', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows no comparison until a legend is picked', () => {
    startPlayerCareer();
    render(createElement(MyCareerPanel));
    fireEvent.click(screen.getByRole('button', { name: 'Legacy' }));

    expect(screen.queryByLabelText('Tale of the Tape')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Next Milestone' })).toBeNull();
  });

  it('switches the comparison and milestone when a different legend is clicked', () => {
    startPlayerCareer();
    render(createElement(MyCareerPanel));
    fireEvent.click(screen.getByRole('button', { name: 'Legacy' }));

    const [first, second] = GOAT_LEGENDS;
    const boardButton = (name: string) => {
      const btn = screen.queryByRole('button', { name });
      expect(btn).toBeTruthy();
      return btn!;
    };

    fireEvent.click(boardButton(first!.name));
    const tape = screen.getByLabelText('Tale of the Tape');
    expect(within(tape).getByRole('heading', { name: `Tale of the Tape: you vs ${first!.name}` })).toBeTruthy();
    expect(boardButton(first!.name).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(boardButton(second!.name));
    const updated = screen.getByLabelText('Tale of the Tape');
    expect(within(updated).getByRole('heading', { name: `Tale of the Tape: you vs ${second!.name}` })).toBeTruthy();
    expect(boardButton(second!.name).getAttribute('aria-pressed')).toBe('true');
    expect(boardButton(first!.name).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('heading', { name: 'Next Milestone' })).toBeTruthy();
  });
});
