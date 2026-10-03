/** Player walking pace in the store. Running changes only the player's step time, never the simulation clock. */

/** Seconds per tile walking. */
export const STEP_TIME = 0.17;
/** Seconds per tile running (hold B, Shift or gamepad X): twice walking speed. */
export const RUN_TIME = STEP_TIME / 2;

/** Seconds to cross one tile. Movement is one tile at a time on the grid, so there is no diagonal speed-up. */
export function stepDuration(running: boolean): number {
  return running ? RUN_TIME : STEP_TIME;
}
