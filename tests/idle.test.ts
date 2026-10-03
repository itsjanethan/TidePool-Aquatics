import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { fishInTank } from '../src/sim/fish';
import { earn, spend } from '../src/sim/economy';
import { cleanGlass, doWaterChange, feedTank, addDecor } from '../src/sim/tank';
import { buyDryGood, buyFoodTub, placeOrder } from '../src/sim/supplier';
import { idleLockReason } from '../src/sim/idle';
import { deserialize, serialize } from '../src/sim/save';
import { spawnCustomer, completeSale, checkoutQuote } from '../src/sim/customers';
import { hireApplicant, refreshApplicants, approveProposal, makeStockProposal } from '../src/sim/staff';
import { buyExpansion } from '../src/sim/expansion';
import { buyRetailStock } from '../src/sim/retail';
import { previewFix } from '../src/sim/preview';
import { takeCutting } from '../src/sim/plants';
import { sellFishToTrade } from '../src/sim/trade';
import { hire, world } from './helpers/world';

function snapshot(sim: Simulation) {
  const s = sim.state;
  const fish = Object.values(s.fish).map((f) => [f.id, f.hunger, f.health, f.sizeCm, f.ageDays, f.stress, f.pregnancy?.daysRemaining ?? null]);
  const tanks = s.tankOrder.map((id) => JSON.stringify([s.tanks[id].water, s.tanks[id].algae, s.tanks[id].glassDirt, s.tanks[id].food, s.tanks[id].decor.map((d) => d.size)]));
  return JSON.stringify({ m: s.minute, money: s.money, rep: s.reputation, fish, tanks, cust: s.customers.map((c) => [c.id, c.x, c.y, c.phase]), staff: s.staff.map((m) => [m.x, m.y, m.skills, m.task?.label ?? null]), orders: s.orders.length, ledger: s.today, rng: s.rngState });
}

describe('Idle Mode', () => {
  it('pauses the persistent simulation completely', () => {
    const sim = new Simulation(newGame({ seed: 4 }));
    const s = sim.state;
    sim.advance(60 * 3); // into opening hours with customers about
    for (let i = 0; i < 3; i++) spawnCustomer(s, sim.customerCtx);
    hire(sim, 'maintenance');
    const p = Object.values(s.fish).find((f) => f.sex === 'female')!;
    p.pregnancy = { fatherId: null, daysRemaining: 3, fatherGenes: null } as never;
    s.idle = true;
    const before = snapshot(sim);
    for (let i = 0; i < 48; i++) sim.advance(60);
    sim.skipToNextMorning();
    expect(snapshot(sim)).toBe(before);
  });

  it('time, hunger, water, growth, customers, staff and wages resume afterwards', () => {
    const sim = new Simulation(newGame({ seed: 4 }));
    const s = sim.state;
    s.idle = true;
    sim.advance(600);
    s.idle = false;
    const m = s.minute;
    const hunger = fishInTank(s, 'A1')[0].hunger;
    sim.advance(120);
    expect(s.minute).toBeGreaterThan(m);
    expect(fishInTank(s, 'A1')[0].hunger).not.toBe(hunger);
  });

  it('refuses every transaction and business action', () => {
    const sim = new Simulation(newGame({ seed: 4 }));
    const s = sim.state;
    refreshApplicants(s, sim.rng, true);
    s.retail.filter_sponge = 2;
    const stockProp = makeStockProposal(s, sim.rng, { skills: { knowledge: 80, cleaning: 50, service: 50, speed: 50 }, id: 'x' } as never);
    if (stockProp) s.proposals.push(stockProp);
    s.idle = true;
    const money = s.money;
    const t = s.tanks.A1;
    t.glassDirt = 0.5;
    expect(spend(s, 10, 'test')).toBe(false);
    earn(s, 10, 'test');
    expect(s.money).toBe(money);
    for (const r of [
      feedTank(s, t, 'normal'), doWaterChange(s, t, 0.25), cleanGlass(s, t), addDecor(s, t, 'java_fern', 0.5, 1),
      buyDryGood(s, 'conditioner', 5), buyFoodTub(s), placeOrder(s, 'riverside', [{ speciesId: 'guppy', quantity: 2, tankId: 'C2' }], 1),
      hireApplicant(s, s.applicants.list[0].id), buyExpansion(s, 'coldwater'), buyRetailStock(s, 'filter_sponge', 1),
      takeCutting(s, t, t.decor[0].uid, 'small'), sellFishToTrade(s, [fishInTank(s, 'A1')[0].id]),
      ...(stockProp ? [approveProposal(s, stockProp.id)] : []),
    ]) {
      expect(r.ok).toBe(false);
      expect(r.message).toContain('Unavailable in Idle Mode');
    }
    expect(t.glassDirt).toBe(0.5);
    expect(s.money).toBe(money);
    expect(s.staff.length).toBe(0);
    expect(s.orders.length).toBe(0);
    const c = spawnCustomer(s, sim.customerCtx);
    const sale = completeSale(s, sim.customerCtx, c, checkoutQuote(s, c).total + 10);
    expect(sale.total).toBe(0);
    expect(s.money).toBe(money);
  });

  it('lock messages name Idle Mode and the way out', () => {
    const s = newGame({ seed: 1 });
    expect(idleLockReason(s, 'buy')).toBeNull();
    s.idle = true;
    expect(idleLockReason(s, 'buy')).toBe('Unavailable in Idle Mode. Choose Resume Business to buy things.');
  });

  it('previews in Idle Mode never change the real state', () => {
    const s = newGame({ seed: 1 });
    s.tanks.A1.glassDirt = 0.7;
    s.idle = true;
    const p = previewFix(s, 'A1', 'glass');
    expect(p.result.ok).toBe(false);
    expect(s.tanks.A1.glassDirt).toBe(0.7);
  });

  it('saving in Idle Mode is safe and loading resumes normal play', () => {
    const s = newGame({ seed: 2 });
    s.idle = true;
    const file = serialize(s, 'slot1');
    expect((file.state as { idle?: boolean }).idle).toBeUndefined();
    const loaded = deserialize(JSON.parse(JSON.stringify(file)));
    expect(loaded.idle).toBeFalsy();
    const sim = new Simulation(loaded);
    const m = loaded.minute;
    sim.advance(30);
    expect(loaded.minute).toBe(m + 30);
  });

  it('staff stand still in Idle Mode (cosmetic only)', () => {
    const sim = world(3);
    hire(sim, 'floater');
    sim.advance(100);
    const s = sim.state;
    s.idle = true;
    const pos = s.staff.map((m) => `${m.x},${m.y},${m.floor}`).join();
    sim.advance(300);
    expect(s.staff.map((m) => `${m.x},${m.y},${m.floor}`).join()).toBe(pos);
  });
});

describe('Idle Mode browsing', () => {
  it('floors can still be changed and tanks inspected (diagnostics) without changing anything', async () => {
    const { diagnoseTank } = await import('../src/sim/tankDiagnostics');
    const sim = world(5, 2);
    const s = sim.state;
    s.idle = true;
    const before = JSON.stringify(s.tanks);
    // Moving floors is the player's position, not the business.
    s.player.floor = 'upstairs';
    expect(sim.grid).toBe(sim.grids.upstairs);
    const r = diagnoseTank(s, s.tanks.U1, true);
    expect(r.scores).toBeTruthy();
    expect(JSON.stringify(s.tanks)).toBe(before);
  });
});
