import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { applyEvent, rollOffCourtEvent } from './offCourt';
import { progressPlayer } from './progression';
import { retirementReason, type RetirementReason } from './retirement';
import type { CareerState, OffCourtEvent, PlayerCareer } from './types';

export interface OffseasonStepResult {
  state: CareerState;
  retired: { playerId: Player['id']; reason: RetirementReason }[];
  events: OffCourtEvent[];
}

/**
 * Advances the career by one offseason. For each player, in roster order:
 * rolls an off-court event, applies its mood/chemistry effect, progresses the
 * player one year, then checks retirement. Retired players are removed from
 * `players` and marked retired in `careers`. The input state is not mutated.
 */
export function advanceCareerOffseason(state: CareerState, rng: SeededRng): OffseasonStepResult {
  const careerById = new Map(state.careers.map((c) => [c.playerId, c]));
  const players: Player[] = [];
  const careers: PlayerCareer[] = [];
  const events: OffCourtEvent[] = [];
  const retired: OffseasonStepResult['retired'] = [];

  for (const player of state.players) {
    const career = careerById.get(player.id);
    if (!career || career.retired) continue;

    let mood = career.mood;
    let chemistry = career.chemistry;
    const event = rollOffCourtEvent(player, state.season, rng);
    if (event) {
      events.push(event);
      ({ mood, chemistry } = applyEvent(mood, chemistry, event));
    }

    const progressed = progressPlayer(player, mood, rng);
    const reason = retirementReason(progressed, career.unsignedOffseasons, rng);
    if (reason) {
      retired.push({ playerId: player.id, reason });
      careers.push({ ...career, mood, chemistry, retired: true, retiredSeason: state.season });
      continue;
    }
    players.push(progressed);
    careers.push({ ...career, mood, chemistry, yearsPro: career.yearsPro + 1 });
  }

  const nextState: CareerState = {
    season: state.season + 1,
    userTeamId: state.userTeamId,
    players,
    careers,
    events: [...state.events, ...events],
  };
  return { state: nextState, retired, events };
}
