/**
 * A "competent player" bot used by balance and long-run tests. It serves
 * customers, gives correct advice, feeds, maintains tanks, restocks, takes
 * plant cuttings and sells surplus fish to the trade buyer.
 */
import { newGame } from '../../src/sim/newGame';
import { Simulation } from '../../src/sim/simulation';
import { checkoutQuote, completeSale, inStockSpecies, problemFor, resolveAdvice, resolveProblem } from '../../src/sim/customers';
import { assessSpeciesForSetup, stockingRatio } from '../../src/sim/compat';
import { fishInTank } from '../../src/sim/fish';
import { cleanFilter, cleanGlass, doWaterChange, feedTank, removeDead, scrubAlgae } from '../../src/sim/tank';
import { buyFoodTub, placeOrder, suppliersFor } from '../../src/sim/supplier';
import { overallReputation } from '../../src/sim/reputation';
import { dayOf, hourOf } from '../../src/sim/time';
import { sellPlantsToTrade, takeCutting } from '../../src/sim/plants';
import { sellFishToTrade } from '../../src/sim/trade';
import { getDecor } from '../../src/data/catalog';

export interface BotResult {
  sim: Simulation;
  revenue: number;
  startRep: number;
  endRep: number;
  maxFishInTank: number;
  maxTotalFish: number;
  tradeSales: number;
}

export function runBot(days: number, seed: number, opts: { onDay?: (sim: Simulation) => void; setup?: (sim: Simulation) => void; breedingTanks?: string[] } = {}): BotResult {
  const s = newGame({ seed });
  const sim = new Simulation(s);
  opts.setup?.(sim);
  // Breeding tanks are kept off the shop floor; their surplus goes to the trade buyer.
  for (const id of opts.breedingTanks ?? []) s.tanks[id].forSale = false;
  const initial = new Map<string, { tank: string; n: number }>();
  for (const id of s.tankOrder) for (const f of fishInTank(s, id)) {
    if (s.tanks[id].forSale === false) continue;
    const k = initial.get(f.speciesId) ?? { tank: id, n: 0 };
    k.n++;
    initial.set(f.speciesId, k);
  }
  const startRep = overallReputation(s);
  let revenue = 0;
  let maxFishInTank = 0;
  let maxTotalFish = 0;
  let tradeSales = 0;
  sim.advance(60 - (s.minute % 60));
  while (dayOf(s.minute) <= days) {
    sim.advance(15);
    const h = hourOf(s.minute);
    const m = s.minute % 60;
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
        if (day % 3 === 0) doWaterChange(s, t, 0.3);
        if (day % 5 === 0) cleanGlass(s, t);
        if (t.algae > 0.4) scrubAlgae(s, t);
        if (t.filterCondition < 0.5) cleanFilter(s, t);
        // Propagate overgrown plants and sell the cuttings.
        for (const d of t.decor) if (getDecor(d.defId).kind === 'plant' && d.size > 1.25) takeCutting(s, t, d.uid, 'medium');
        // Thin out crowded tanks via the trade buyer.
        const fish = fishInTank(s, id);
        maxFishInTank = Math.max(maxFishInTank, fish.length);
        if (stockingRatio(t, fish) > 0.95) {
          const surplus = fish.filter((f) => !f.reservedBy).sort((a, b) => b.sizeCm - a.sizeCm).slice(0, Math.ceil(fish.length * 0.25));
          const r = sellFishToTrade(s, surplus.map((f) => f.id));
          if (r.ok) tradeSales++;
        }
      }
      if (s.storage.plants.length > 6) sellPlantsToTrade(s, s.storage.plants.slice(0, s.storage.plants.length - 4).map((p) => p.uid));
      if (s.foodUnits < 200) buyFoodTub(s);
      for (const [sid, { tank, n }] of initial) {
        const have = fishInTank(s, tank).filter((f) => f.speciesId === sid).length;
        const pending = s.orders.some((o) => o.lines.some((l) => l.speciesId === sid));
        const sup = suppliersFor(s).find((x) => (s.suppliers[x.id]?.stock.find((y) => y.speciesId === sid)?.available ?? 0) > 0);
        const avail = sup ? s.suppliers[sup.id].stock.find((x) => x.speciesId === sid)!.available : 0;
        const target = Math.round(n * 1.6);
        if (sup && have < target * 0.7 && !pending && s.money > 60 && avail > 0 && stockingRatio(s.tanks[tank], fishInTank(s, tank)) < 0.8) placeOrder(s, sup.id, [{ speciesId: sid, quantity: Math.max(1, Math.min(target - have, avail)), tankId: tank }], day);
      }
      maxTotalFish = Math.max(maxTotalFish, Object.keys(s.fish).length);
      opts.onDay?.(sim);
      sim.skipToNextMorning();
    }
  }
  return { sim, revenue, startRep, endRep: overallReputation(s), maxFishInTank, maxTotalFish, tradeSales };
}
