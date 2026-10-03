/** Test helpers: a game with every expansion built and some staff. */
import { newGame } from '../../src/sim/newGame';
import { Simulation } from '../../src/sim/simulation';
import { buyExpansion } from '../../src/sim/expansion';
import { EXPANSIONS } from '../../src/data/expansions';
import { hireApplicant, refreshApplicants } from '../../src/sim/staff';
import type { GameState, StaffRole } from '../../src/sim/types';

/** Satisfies every requirement and builds expansions up to `level`. */
export function buildUpTo(s: GameState, level: number): void {
  for (const e of EXPANSIONS) {
    if (e.level > level || s.unlocks.floors.includes(e.floor)) continue;
    s.money = Math.max(s.money, e.requires.capital + e.cost + 500);
    s.stats.customersServed = Math.max(s.stats.customersServed, e.requires.customersServed);
    s.stats.fishBred = Math.max(s.stats.fishBred, e.requires.fishBred ?? 0);
    for (const k of Object.keys(s.reputation) as Array<keyof GameState['reputation']>) s.reputation[k] = Math.max(s.reputation[k], e.requires.reputation + 5);
    for (const o of e.requires.objectives) s.objectives[o] = { done: true, doneDay: 1, progress: 1 };
    const r = buyExpansion(s, e.id);
    if (!r.ok) throw new Error(`Could not build ${e.id}: ${r.message}`);
  }
}

export function hire(sim: Simulation, role: StaffRole, skills?: Partial<Record<'cleaning' | 'service' | 'speed' | 'knowledge', number>>): string {
  const s = sim.state;
  refreshApplicants(s, sim.rng, true);
  const a = s.applicants.list[0];
  if (skills) Object.assign(a.skills, skills);
  const r = hireApplicant(s, a.id, role);
  if (!r.ok) throw new Error(r.message);
  return s.staff[s.staff.length - 1].id;
}

export function world(seed = 11, level = 1): Simulation {
  const s = newGame({ seed });
  const sim = new Simulation(s);
  if (level > 1) buildUpTo(s, level);
  return sim;
}
