/**
 * The Key Moment possession roll, kept pure and separate from the modal. The text
 * outcome and the court frames come from the same seeded run, so they always agree.
 */
import { runKeyMomentCourt, type KeyMomentCourtInput, type KeyMomentCourtRun } from '../possession/keyMomentCourt';

/** Runs the possession once. The text roll and the court frames both read this run. */
export function createRoll(input: KeyMomentCourtInput): KeyMomentCourtRun {
  return runKeyMomentCourt(input);
}
