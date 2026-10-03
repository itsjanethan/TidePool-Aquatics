import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { checkoutQuote, completeSale, inStockSpecies, resolveAdvice, sellable, servingCustomer, spawnCustomer } from '../src/sim/customers';
import { countProtected, isProtected, setNotForSale } from '../src/sim/protection';
import { sellFishToTrade } from '../src/sim/trade';
import { fishInTank, moveFish } from '../src/sim/fish';
import { birthFry } from '../src/sim/breeding';
import { deserialize, serialize } from '../src/sim/save';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/sim/types';

const open = (seed = 21) => {
  const s = newGame({ seed });
  s.minute = 10 * 60;
  return { s, sim: new Simulation(s) };
};
const platies = (s: GameState) => fishInTank(s, 'A5').filter((f) => f.speciesId === 'platy');

describe('Not for sale: the simulation enforces it', () => {
  it('protected fish are never sellable, so browsing customers cannot reserve them', () => {
    const { s, sim } = open();
    const all = platies(s);
    expect(all.length).toBeGreaterThan(1);
    setNotForSale(s, all.map((f) => f.id), true, sim.customerCtx);
    expect(all.every((f) => !sellable(f))).toBe(true);
    expect(inStockSpecies(s)).not.toContain('platy');
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', archetype: 'hobbyist' });
    c.goalData.speciesId = 'platy';
    c.goalData.quantity = 2;
    c.traits.budget = 200;
    c.browseQueue = ['A5'];
    c.path = [];
    c.phase = 'entering';
    for (let i = 0; i < 300; i++) sim.advance(0.5);
    expect(all.every((f) => f.reservedBy === null && s.fish[f.id])).toBe(true);
    expect(c.basket.some((l) => l.speciesId === 'platy')).toBe(false);
  });

  it('advice sales skip protected fish', () => {
    const { s, sim } = open(4);
    setNotForSale(s, Object.values(s.fish).filter((f) => f.speciesId === 'platy').map((f) => f.id), true);
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'advice_stocking', archetype: 'beginner' });
    c.goalData.tankLitres = 60;
    c.goalData.heated = true;
    c.traits.budget = 80;
    resolveAdvice(s, sim.customerCtx, c, 'platy');
    expect(c.basket.flatMap((l) => l.fishIds).some((id) => isProtected(s.fish[id]))).toBe(false);
  });

  it('protecting a reserved fish releases it and updates the customer order', () => {
    const { s, sim } = open();
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', archetype: 'hobbyist' });
    c.goalData.speciesId = 'platy';
    c.goalData.quantity = 2;
    c.traits.budget = 200;
    c.browseQueue = ['A5'];
    c.path = [];
    c.phase = 'entering';
    for (let i = 0; i < 400 && !c.basket.length; i++) sim.advance(0.5);
    const ids = c.basket.flatMap((l) => l.fishIds);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const target = ids[0];
    const res = setNotForSale(s, [target], true, sim.customerCtx);
    expect(res.released).toBe(1);
    expect(s.fish[target].reservedBy).toBeNull();
    expect(c.basket.flatMap((l) => l.fishIds)).not.toContain(target);
    expect(c.basket.every((l) => l.fishIds.length > 0)).toBe(true);
    expect(res.message).toMatch(/reservation was released/);
  });

  it('a queueing customer left with nothing walks out; not counted as a lost sale', () => {
    const { s, sim } = open();
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', archetype: 'hobbyist' });
    c.goalData.speciesId = 'platy';
    c.goalData.quantity = 1;
    c.traits.budget = 200;
    c.browseQueue = ['A5'];
    c.path = [];
    c.phase = 'entering';
    let served = null;
    for (let i = 0; i < 400 && !served; i++) {
      sim.advance(0.5);
      served = servingCustomer(s, sim.layout);
    }
    expect(served).not.toBeNull();
    const lost = s.today.customersLost;
    const res = setNotForSale(s, served!.basket.flatMap((l) => l.fishIds), true, sim.customerCtx);
    expect(res.customersLeft).toBe(1);
    expect(['leaving', 'gone']).toContain(served!.phase);
    expect(s.today.customersLost).toBe(lost);
  });

  it('the till (player or staff) never sells a protected fish, even if one is in a basket', () => {
    const { s, sim } = open();
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', archetype: 'hobbyist' });
    c.goalData.speciesId = 'platy';
    c.goalData.quantity = 2;
    c.traits.budget = 200;
    c.browseQueue = ['A5'];
    c.path = [];
    c.phase = 'entering';
    let served = null;
    for (let i = 0; i < 400 && !served; i++) {
      sim.advance(0.5);
      served = servingCustomer(s, sim.layout);
    }
    const ids = served!.basket.flatMap((l) => l.fishIds);
    expect(ids.length).toBe(2);
    const quote = checkoutQuote(s, served!).total;
    const unit = served!.basket[0].unitPrice;
    // Bypass the release path to prove completeSale itself refuses.
    s.fish[ids[0]].notForSale = true;
    const before = s.money;
    const sale = completeSale(s, sim.customerCtx, served!, quote);
    expect(s.fish[ids[0]]).toBeDefined();
    expect(s.fish[ids[0]].tankId).toBe('A5');
    expect(s.fish[ids[0]].reservedBy).toBeNull();
    expect(sale.fishCount).toBe(1);
    expect(s.money).toBeCloseTo(before + quote - unit, 2);
  });

  it('the trade buyer never takes a protected fish', () => {
    const { s } = open();
    const [a, b] = platies(s);
    setNotForSale(s, [a.id], true);
    const one = sellFishToTrade(s, [a.id]);
    expect(one.ok).toBe(false);
    expect(one.message).toMatch(/Not for sale/);
    expect(s.fish[a.id]).toBeDefined();
    const both = sellFishToTrade(s, [a.id, b.id]);
    expect(both.ok).toBe(true);
    expect(both.message).toMatch(/1 not-for-sale fish kept/);
    expect(s.fish[a.id]).toBeDefined();
  });
});

describe('Not for sale: everything else still works', () => {
  it('bulk protect and unprotect report what changed; repeating changes nothing', () => {
    const { s } = open();
    const ids = platies(s).map((f) => f.id);
    const r1 = setNotForSale(s, ids, true);
    expect(r1.changed).toBe(ids.length);
    expect(countProtected(s, ids)).toBe(ids.length);
    const r2 = setNotForSale(s, ids, true);
    expect(r2.changed).toBe(0);
    expect(r2.message).toMatch(/already not for sale/);
    const r3 = setNotForSale(s, ids.slice(0, 1), false);
    expect(r3.changed).toBe(1);
    expect(r3.message).toMatch(/For sale again/);
    expect(countProtected(s, ids)).toBe(ids.length - 1);
  });

  it('protection survives moves, saves and export/import; old saves load unprotected', () => {
    const { s } = open();
    const [a] = platies(s);
    setNotForSale(s, [a.id], true);
    const dest = s.tankOrder.find((id) => id !== 'A5' && (s.tanks[id].waterType ?? 'freshwater') === 'freshwater')!;
    moveFish(a, dest);
    expect(a.notForSale).toBe(true);
    const text = JSON.stringify(serialize(s, 'slot1'));
    const back = deserialize(JSON.parse(text));
    expect(back.fish[a.id].notForSale).toBe(true);
    expect(back.fish[a.id].tankId).toBe(dest);
    // An older save has no field at all.
    const old = JSON.parse(text);
    for (const f of Object.values(old.state.fish) as Array<Record<string, unknown>>) delete f.notForSale;
    const loaded = deserialize(old);
    expect(Object.values(loaded.fish).some((f) => f.notForSale)).toBe(false);
    expect(sellable(loaded.fish[a.id]) || loaded.fish[a.id].health <= 55).toBe(true);
  });

  it('protected fish still breed, and their offspring are for sale', () => {
    const { s } = open();
    const mom = platies(s).find((f) => f.sex === 'female')!;
    const dad = platies(s).find((f) => f.sex === 'male')!;
    setNotForSale(s, [mom.id, dad.id], true);
    const fry = birthFry(s, new Rng(5), mom, dad, s.tanks.A5, 4);
    expect(fry.length).toBeGreaterThan(0);
    expect(fry.every((f) => !f.notForSale)).toBe(true);
    expect(mom.offspringCount).toBeGreaterThan(0);
  });
});
