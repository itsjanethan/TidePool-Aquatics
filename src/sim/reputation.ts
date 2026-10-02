/**
 * ReputationSystem: several independent reputation dimensions. Customers
 * weight them differently (see customers.ts).
 */
import { clamp, round } from '../core/math';
import { summarizeAquascape } from './aquascape';
import { fishInTank } from './fish';
import type { GameState, RepDimension } from './types';

export const REP_DIMENSIONS: RepDimension[] = ['quality', 'welfare', 'service', 'cleanliness', 'aquascape', 'value', 'knowledge'];

export const REP_LABELS: Record<RepDimension, string> = {
  quality: 'Livestock Quality',
  welfare: 'Fish Welfare',
  service: 'Customer Service',
  cleanliness: 'Cleanliness',
  aquascape: 'Aquascaping',
  value: 'Value for Money',
  knowledge: 'Expert Advice',
};

const WEIGHTS: Record<RepDimension, number> = {
  quality: 1, welfare: 1.2, service: 1.2, cleanliness: 1, aquascape: 0.7, value: 1, knowledge: 1,
};

export function overallReputation(state: GameState): number {
  let s = 0;
  let w = 0;
  for (const d of REP_DIMENSIONS) {
    s += state.reputation[d] * WEIGHTS[d];
    w += WEIGHTS[d];
  }
  return s / w;
}

export function repStars(value: number): number {
  return clamp(Math.round((value / 100) * 10) / 2, 0, 5);
}

/** Applies a change with diminishing returns near the extremes. */
export function nudgeRep(state: GameState, dim: RepDimension, delta: number): void {
  const r = state.reputation[dim];
  // Strong diminishing returns: the last points of reputation are hard won.
  const scaled = delta > 0 ? delta * 1.2 * (1 - r / 100) ** 2 : delta * (0.5 + r / 140);
  state.reputation[dim] = round(clamp(r + scaled, 0, 100), 2);
}

/** Measured (instantaneous) scores derived from the shop's tanks. */
export function measuredScores(state: GameState): Partial<Record<RepDimension, number>> {
  let welfare = 0;
  let quality = 0;
  let fishN = 0;
  let clean = 0;
  let scape = 0;
  let deadPenalty = 0;
  const tanks = state.tankOrder.map((id) => state.tanks[id]);
  for (const t of tanks) {
    const all = fishInTank(state, t.id, true);
    for (const f of all) {
      if (!f.alive) {
        deadPenalty += 6;
        continue;
      }
      welfare += f.health - f.stress * 0.5;
      quality += f.quality * 100;
      fishN++;
    }
    clean += 100 - (t.algae * 45 + t.glassDirt * 40 + t.water.cloudiness * 45);
    const sum = summarizeAquascape(t);
    scape += sum.layout;
  }
  const n = Math.max(1, tanks.length);
  return {
    welfare: clamp((fishN ? welfare / fishN : 60) - deadPenalty, 0, 100),
    quality: fishN ? quality / fishN : 40,
    cleanliness: clamp(clean / n - deadPenalty, 0, 100),
    aquascape: scape / n,
  };
}

/** Called once per in-game day. Drifts measured dimensions toward reality. */
export function dailyReputationUpdate(state: GameState): Partial<Record<RepDimension, number>> {
  const measured = measuredScores(state);
  const deltas: Partial<Record<RepDimension, number>> = {};
  for (const k of Object.keys(measured) as RepDimension[]) {
    const before = state.reputation[k];
    const target = measured[k] ?? before;
    state.reputation[k] = round(clamp(before + (target - before) * 0.18, 0, 100), 2);
    deltas[k] = round(state.reputation[k] - before, 2);
  }
  return deltas;
}
