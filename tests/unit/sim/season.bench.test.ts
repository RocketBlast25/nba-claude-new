import { it } from 'vitest';
import { SIM_CONFIG } from '../../../src/sim/background/config';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import type { SimTeam } from '../../../src/sim/background/gameSim';
import { simulateSeason } from '../../../src/sim/league/season';

// Benchmark for TR-background-sim-006: a full 1,230-game season in under 1 second.
it('measures one 1,230-game season', () => {
  const rng = new SeededRng(7);
  const league = Array.from({ length: 30 }, (_, i) => {
    const id = makeId<'team'>(`T${i + 1}`) as TeamId;
    const conference: 'East' | 'West' = i < 15 ? 'East' : 'West';
    const roster = generateRoster(id, 10, rng.fork());
    const sim: SimTeam = {
      id,
      pace: SIM_CONFIG.leaguePace,
      offRating: SIM_CONFIG.leagueOffRating,
      defRating: SIM_CONFIG.leagueOffRating,
      players: roster.map((p) => ({ id: p.id, attributes: p.attributes, stamina: p.stamina, usage: p.overall / 100 })),
    };
    return { id, conference, division: `${conference}-${Math.floor(i / 5) % 3}`, sim } as ScheduleTeam & { sim: SimTeam };
  });

  const start = performance.now();
  const season = simulateSeason(league, new SeededRng(123));
  const ms = performance.now() - start;
  console.log(`BENCH season games=${season.gamesPlayed} ms=${ms.toFixed(1)}`);
});
