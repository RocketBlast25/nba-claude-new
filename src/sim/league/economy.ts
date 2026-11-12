import { LEAGUE_CONFIG } from './leagueConfig';

/**
 * Market salary for a player by overall rating, in thousands of dollars.
 * Linear between minAtOverall and maxAtOverall, clamped to [minimum, maximum].
 */
export function salaryForOverall(overall: number): number {
  const { minimum, maximum, minAtOverall, maxAtOverall } = LEAGUE_CONFIG.salary;
  if (overall >= maxAtOverall) return maximum;
  if (overall <= minAtOverall) return minimum;
  const t = (overall - minAtOverall) / (maxAtOverall - minAtOverall);
  return Math.round(minimum + t * (maximum - minimum));
}

/**
 * Rookie-scale salary by draft pick: picks slide linearly from rookieTop (pick 1)
 * to rookieFloor (pick 30).
 */
export function rookieSalary(pick: number): number {
  const { rookieTop, rookieFloor } = LEAGUE_CONFIG.salary;
  const picks = LEAGUE_CONFIG.draftRounds;
  const clamped = Math.min(picks, Math.max(1, pick));
  const t = (clamped - 1) / (picks - 1);
  return Math.round(rookieTop + t * (rookieFloor - rookieTop));
}

/** Payroll in thousands: sum of contract salaries. */
export function payrollOf(salaries: number[]): number {
  return salaries.reduce((s, x) => s + x, 0);
}

/** Cap space in thousands: how far payroll is below the salary cap (never negative). */
export function capSpace(payroll: number): number {
  return Math.max(0, LEAGUE_CONFIG.cap.salaryCap - payroll);
}

/**
 * Luxury tax owed: a rate applied to payroll above the luxury tax line.
 * Returns 0 when payroll is at or under the line.
 */
export function luxuryTax(payroll: number): number {
  const { luxuryTaxLine, luxuryTaxRate } = LEAGUE_CONFIG.cap;
  const over = payroll - luxuryTaxLine;
  return over > 0 ? Math.round(over * luxuryTaxRate) : 0;
}
