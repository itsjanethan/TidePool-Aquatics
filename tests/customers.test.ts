import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { checkoutQuote, completeSale, queueCustomers, resolveAdvice, servingCustomer, spawnCustomer } from '../src/sim/customers';

describe('customers', () => {
  it('a buy_specific customer reserves fish, queues and can be served', () => {
    const s = newGame({ seed: 21 });
    s.minute = 10 * 60; // open
    const sim = new Simulation(s);
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', archetype: 'hobbyist' });
    c.goalData.speciesId = 'platy';
    c.goalData.quantity = 2;
    c.traits.budget = 100;
    c.browseQueue = ['A5'];
    c.path = [];
    c.phase = 'entering';
    let served = null;
    for (let i = 0; i < 400 && !served; i++) {
      sim.advance(0.5);
      served = servingCustomer(s, sim.layout);
    }
    expect(served).not.toBeNull();
    const quote = checkoutQuote(s, served!);
    expect(quote.total).toBeGreaterThan(0);
    const before = s.money;
    const fishBefore = Object.keys(s.fish).length;
    completeSale(s, sim.customerCtx, served!, quote.total);
    expect(s.money).toBeCloseTo(before + quote.total, 2);
    expect(Object.keys(s.fish).length).toBeLessThan(fishBefore);
    expect(s.stats.customersServed).toBe(1);
    expect(queueCustomers(s).length).toBe(0);
  });

  it('good advice earns knowledge reputation and a sale', () => {
    const s = newGame({ seed: 4 });
    s.minute = 10 * 60;
    const sim = new Simulation(s);
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'advice_stocking', archetype: 'beginner' });
    c.goalData.tankLitres = 60;
    c.goalData.heated = true;
    c.traits.budget = 60;
    const k0 = s.reputation.knowledge;
    const res = resolveAdvice(s, sim.customerCtx, c, 'platy');
    expect(res.success).toBe(true);
    expect(s.reputation.knowledge).toBeGreaterThan(k0);
    expect(c.basket.length).toBe(1);
  });

  it('bad advice to an inexperienced customer creates a grievance', () => {
    const s = newGame({ seed: 4 });
    s.minute = 10 * 60;
    const sim = new Simulation(s);
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'advice_stocking', archetype: 'beginner' });
    c.goalData.tankLitres = 25;
    c.goalData.heated = true;
    c.traits.experience = -1; // never notices
    c.traits.budget = 100;
    resolveAdvice(s, sim.customerCtx, c, 'fancy_goldfish');
    expect(s.profiles[c.profileId].grievance).toBe(true);
  });

  it('customers arrive during opening hours over a simulated day', () => {
    const s = newGame({ seed: 8 });
    const sim = new Simulation(s);
    let arrivals = 0;
    sim.events.on('customer', (e) => {
      if (e.type === 'arrived') arrivals++;
    });
    sim.advance(10 * 60);
    expect(arrivals).toBeGreaterThan(4);
  });
});
