/**
 * Balance smoke test: a simple "competent player" bot runs the shop for three
 * in-game weeks. Guards against economy or welfare collapse after tuning.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { checkoutQuote, completeSale, inStockSpecies, problemFor, resolveAdvice, resolveProblem } from '../src/sim/customers';
import { assessSpeciesForSetup } from '../src/sim/compat';
import { fishInTank } from '../src/sim/fish';
import { cleanFilter, cleanGlass, doWaterChange, feedTank, removeDead } from '../src/sim/tank';
import { placeOrder, buyFoodTub } from '../src/sim/supplier';
import { overallReputation } from '../src/sim/reputation';
import { dayOf, hourOf } from '../src/sim/time';

export function runBot(days: number, seed: number) {
  const s = newGame({ seed });
  const sim = new Simulation(s);
  const initial = new Map<string, { tank: string; n: number }>();
  for (const id of s.tankOrder) for (const f of fishInTank(s, id)) {
    const k = initial.get(f.speciesId) ?? { tank: id, n: 0 };
    k.n++;
    initial.set(f.speciesId, k);
  }
  const startRep = overallReputation(s);
  let revenue = 0;
  sim.advance(60 - (s.minute % 60)); // align to the hour
  while (dayOf(s.minute) <= days) {
    sim.advance(15);
    const h = hourOf(s.minute);
    const m = s.minute % 60;
    // Serve everyone queueing.
    for (const c of [...s.customers]) {
      if (c.phase === 'queueing') {
        const q = checkoutQuote(s, c);
        revenue += q.total;
        completeSale(s, sim.customerCtx, c, q.total);
      } else if (c.phase === 'waiting_help' || c.phase === 'seeking_help') {
        if (c.goal === 'advice_stocking') {
          const setup = { litres: c.goalData.tankLitres ?? 60, heated: !!c.goalData.heated };
          const best = inStockSpecies(s).find((sid) => assessSpeciesForSetup(sid, setup).score >= 0.75) ?? null;
          resolveAdvice(s, sim.customerCtx, c, best);
        } else if (c.goal === 'problem') {
          const p = problemFor(c);
          resolveProblem(s, sim.customerCtx, c, p.options.findIndex((o) => o.correct));
        }
      }
    }
    if (m === 0 && (h === 9 || h === 16)) for (const id of s.tankOrder) feedTank(s, s.tanks[id], 'normal');
    if (m === 0 && h === 19) {
      const day = dayOf(s.minute);
      for (const id of s.tankOrder) {
        const t = s.tanks[id];
        removeDead(s, t);
        if (day % 3 === 0) doWaterChange(s, t, 0.25);
        if (day % 5 === 0) cleanGlass(s, t);
        if (t.filterCondition < 0.5) cleanFilter(s, t);
      }
      if (s.foodUnits < 150) buyFoodTub(s);
      // Restock species running low.
      for (const [sid, { tank, n }] of initial) {
        const have = fishInTank(s, tank).filter((f) => f.speciesId === sid).length;
        const pending = s.orders.some((o) => o.lines.some((l) => l.speciesId === sid));
        if (have < n / 2 && !pending && s.money > 80) placeOrder(s, 'riverside', [{ speciesId: sid, quantity: Math.min(n - have, s.suppliers.riverside.stock.find((x) => x.speciesId === sid)?.available ?? 0), tankId: tank }], day);
      }
    }
    if (h === 19 && m === 0) sim.skipToNextMorning();
  }
  return { s, revenue, startRep, endRep: overallReputation(s) };
}

describe('balance', () => {
  it('a competent player stays solvent and keeps fish alive for three weeks', () => {
    const { s, revenue, startRep, endRep } = runBot(21, 1234);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ money: s.money, revenue: Math.round(revenue), served: s.stats.customersServed, died: s.stats.fishDied, sold: s.stats.totalFishSold, startRep: Math.round(startRep), endRep: Math.round(endRep), rep: s.reputation }));
    expect(s.money).toBeGreaterThan(400);
    expect(s.stats.customersServed).toBeGreaterThan(100);
    expect(s.stats.fishDied).toBeLessThan(25);
    expect(endRep).toBeGreaterThan(startRep);
  });
});
