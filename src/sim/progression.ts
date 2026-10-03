/**
 * ProgressionSystem: goals that guide the player through the vertical slice.
 * Future unlocks (floors, marine) hang off the same structure.
 */
import { cycleStatus } from './water';
import { summarizeAquascape } from './aquascape';
import { overallReputation } from './reputation';
import type { GameState } from './types';

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
  reward: number;
  check: (s: GameState) => boolean;
}

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'first_feed', title: 'Feed a tank', hint: 'Walk up to a tank, press Z/Enter and choose Feed.', reward: 0, check: (s) => s.tankOrder.some((id) => s.tanks[id].lastFedMinute > 0) },
  { id: 'view_tank', title: 'Inspect an aquarium', hint: 'Choose View Tank from a tank menu to watch your fish up close.', reward: 0, check: (s) => !!s.objectives.view_tank?.progress },
  { id: 'first_sale', title: 'Serve your first customer', hint: 'Customers with a basket queue at the till. Stand behind the counter and press Z.', reward: 20, check: (s) => s.stats.customersServed >= 1 },
  { id: 'good_advice', title: 'Give good advice', hint: 'Customers with a "?" want help. Talk to them and recommend suitable fish.', reward: 25, check: (s) => s.stats.goodAdvice >= 1 },
  { id: 'order_stock', title: 'Order new livestock', hint: 'Use the office PC (top right) to order fish from a supplier.', reward: 0, check: (s) => !!s.objectives.order_stock?.progress },
  { id: 'cycle_c2', title: 'Cycle the new tank (C2)', hint: 'C2 is brand new. Add a little food or bacteria starter, then wait and test the water.', reward: 40, check: (s) => !!s.tanks.C2 && cycleStatus(s.tanks.C2.water) === 'cycled' },
  { id: 'aquascape', title: 'Create a beautiful tank', hint: 'Use Aquascape to add plants, wood and rocks until a tank layout scores 85+.', reward: 40, check: (s) => s.tankOrder.some((id) => summarizeAquascape(s.tanks[id]).layout >= 85) },
  { id: 'serve_10', title: 'Serve 10 customers', hint: 'Keep tanks clean and stocked to bring in more customers.', reward: 50, check: (s) => s.stats.customersServed >= 10 },
  { id: 'rep_50', title: 'Reach 2.5 stars reputation', hint: 'Clean tanks, healthy fish, good advice and fair prices all count.', reward: 75, check: (s) => overallReputation(s) >= 50 },
  { id: 'money_1500', title: 'Save up £1,500', hint: 'Future expansions will need capital.', reward: 0, check: (s) => s.money >= 1500 },
];

export function initObjectives(): GameState['objectives'] {
  const o: GameState['objectives'] = {};
  for (const d of OBJECTIVES) o[d.id] = { done: false, doneDay: null, progress: 0 };
  return o;
}

/** Marks a manual-progress objective (e.g. view_tank) as progressed. */
export function markObjective(state: GameState, id: string): void {
  const o = (state.objectives[id] ??= { done: false, doneDay: null, progress: 0 });
  o.progress = Math.max(1, o.progress + 1);
}

/** Checks objectives; returns newly completed ones (and pays rewards). */
export function checkObjectives(state: GameState): ObjectiveDef[] {
  const done: ObjectiveDef[] = [];
  for (const d of OBJECTIVES) {
    const o = (state.objectives[d.id] ??= { done: false, doneDay: null, progress: 0 });
    if (o.done) continue;
    if (d.check(state)) {
      o.done = true;
      o.doneDay = Math.floor(state.minute / 1440) + 1;
      if (d.reward) {
        state.money += d.reward;
        state.today.income += d.reward;
      }
      done.push(d);
    }
  }
  return done;
}

export function currentObjective(state: GameState): ObjectiveDef | null {
  return OBJECTIVES.find((d) => !state.objectives[d.id]?.done) ?? null;
}
