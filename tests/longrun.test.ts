/**
 * Long-duration simulation tests (30 / 100 / 365 in-game days) with breeding
 * tanks. Checks for runaway populations, economy inflation, bankruptcy, save
 * growth, ID collisions, broken pregnancies, impossible chemistry and
 * negative or duplicated inventory. Run with --silent=false to see the stats.
 */
import { describe, expect, it } from 'vitest';
import { runBot } from './helpers/bot';
import { serialize, deserialize } from '../src/sim/save';
import { MAX_FISH_PER_TANK } from '../src/sim/breeding';
import type { GameState } from '../src/sim/types';

function invariants(s: GameState) {
  // Chemistry stays physical.
  for (const id of s.tankOrder) {
    const w = s.tanks[id].water;
    for (const [k, v] of Object.entries(w)) expect(Number.isFinite(v), `${id}.${k}`).toBe(true);
    expect(w.ammonia).toBeGreaterThanOrEqual(0);
    expect(w.nitrate).toBeGreaterThanOrEqual(0);
    expect(w.ph).toBeGreaterThan(4);
    expect(w.ph).toBeLessThan(10);
    expect(w.temperature).toBeGreaterThan(5);
    expect(w.temperature).toBeLessThan(40);
    for (const d of s.tanks[id].decor) expect(Number.isFinite(d.size)).toBe(true);
  }
  // Fish records are sane.
  for (const [id, f] of Object.entries(s.fish)) {
    expect(f.id).toBe(id);
    expect(Number.isFinite(f.sizeCm) && f.sizeCm > 0).toBe(true);
    if (f.pregnancy) expect(Number.isFinite(f.pregnancy.daysRemaining) && f.pregnancy.daysRemaining > -1).toBe(true);
    if (f.tankId) expect(s.tanks[f.tankId]).toBeTruthy();
  }
  // Inventory never negative, uids unique.
  expect(s.foodUnits).toBeGreaterThanOrEqual(0);
  for (const v of Object.values(s.dryGoods)) expect(v).toBeGreaterThanOrEqual(0);
  for (const v of Object.values(s.storage.decor)) expect(v).toBeGreaterThanOrEqual(0);
  const uids = [...s.storage.plants.map((p) => p.uid), ...s.tankOrder.flatMap((t) => s.tanks[t].decor.map((d) => d.uid))];
  expect(new Set(uids).size).toBe(uids.length);
  for (const t of s.tankOrder) expect(Object.values(s.fish).filter((f) => f.tankId === t).length).toBeLessThanOrEqual(MAX_FISH_PER_TANK);
}

function report(label: string, days: number, r: ReturnType<typeof runBot>, ms: number) {
  const s = r.sim.state;
  const saveBytes = JSON.stringify(serialize(s, 'auto')).length;
  console.log(`${label}: ${JSON.stringify({
    days, ms, money: Math.round(s.money), revenue: Math.round(r.revenue), served: s.stats.customersServed, sold: s.stats.totalFishSold,
    bred: s.stats.fishBred, fryEaten: s.stats.fryEaten ?? 0, died: s.stats.fishDied, fishRecords: Object.keys(s.fish).length,
    maxTank: r.maxFishInTank, maxTotal: r.maxTotalFish, plantsSold: s.stats.plantsSold ?? 0, rep: Math.round(r.endRep), saveKB: Math.round(saveBytes / 1024), tradeSales: r.tradeSales,
  })}`);
  return saveBytes;
}

const BREEDERS = ['A1', 'A5', 'B1'];

describe('long-run simulation', () => {
  it('30 days', () => {
    const t0 = Date.now();
    const r = runBot(30, 101, { breedingTanks: BREEDERS });
    report('30d', 30, r, Date.now() - t0);
    invariants(r.sim.state);
    expect(r.sim.state.money).toBeGreaterThan(0);
    expect(r.sim.state.stats.fishBred).toBeGreaterThan(0);
  });

  it('100 days', () => {
    const t0 = Date.now();
    const r = runBot(100, 202, { breedingTanks: BREEDERS });
    const bytes = report('100d', 100, r, Date.now() - t0);
    invariants(r.sim.state);
    expect(r.sim.state.money).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(1_500_000);
    // Saves still round-trip after a long game.
    const back = deserialize(JSON.parse(JSON.stringify(serialize(r.sim.state, 'x'))));
    expect(Object.keys(back.fish).length).toBe(Object.keys(r.sim.state.fish).length);
  }, 120_000);

  it('365 days', () => {
    const t0 = Date.now();
    const r = runBot(365, 303, { breedingTanks: BREEDERS });
    const bytes = report('365d', 365, r, Date.now() - t0);
    invariants(r.sim.state);
    const s = r.sim.state;
    expect(s.money).toBeGreaterThan(0);
    // No runaway inflation: a near-perfect bot should not be a millionaire after a year.
    expect(s.money).toBeLessThan(250_000);
    expect(r.maxTotalFish).toBeLessThan(MAX_FISH_PER_TANK * s.tankOrder.length);
    expect(bytes).toBeLessThan(2_000_000);
  }, 300_000);
});

describe('long-run with staff and every floor', () => {
  it('100 days run by staff alone (proposals approved each morning)', async () => {
    const { world, hire } = await import('./helpers/world');
    const { approveProposal, openProposals } = await import('../src/sim/staff');
    const { buyFoodTub } = await import('../src/sim/supplier');
    const { buildWalkGrid } = await import('../src/data/shopLayout');
    const { getFloorLayout } = await import('../src/data/floors');
    const t0 = Date.now();
    const sim = world(404, 4);
    const s = sim.state;
    s.money = 3000;
    hire(sim, 'sales', { service: 70, knowledge: 60 });
    hire(sim, 'maintenance', { cleaning: 70, speed: 60, knowledge: 50 });
    hire(sim, 'maintenance', { cleaning: 55, speed: 55, knowledge: 40 });
    hire(sim, 'stock', { knowledge: 70 });
    hire(sim, 'floater', { service: 55, cleaning: 55 });
    for (const id of ['filter_sponge', 'heater_50', 'bundle_starter', 'tank_60']) s.retail[id] = 6;
    s.dryGoods.salt_mix = 40;
    s.dryGoods.ro_water = 60;
    let maxCustomers = 0;
    let approved = 0;
    for (let d = 0; d < 100; d++) {
      for (let h = 0; h < 24; h++) {
        sim.advance(60);
        maxCustomers = Math.max(maxCustomers, s.customers.length);
      }
      for (const p of openProposals(s)) if (approveProposal(s, p.id).ok) approved++;
      if (s.foodUnits < 300) buyFoodTub(s);
      if ((s.dryGoods.ro_water ?? 0) < 10) s.dryGoods.ro_water = 40;
      if ((s.dryGoods.salt_mix ?? 0) < 10) s.dryGoods.salt_mix = 40;
      for (const m of s.staff) {
        const grid = buildWalkGrid(getFloorLayout(m.floor));
        expect(grid[Math.round(m.y)]?.[Math.round(m.x)], `${m.name} on a walkable tile`).toBe(true);
      }
    }
    invariants(s);
    for (const id of s.tankOrder) if (s.tanks[id].waterType === 'marine') {
      const sal = s.tanks[id].water.salinity!;
      expect(sal).toBeGreaterThan(30);
      expect(sal).toBeLessThan(38);
    }
    for (const v of Object.values(s.retail)) expect(v).toBeGreaterThanOrEqual(0);
    expect(maxCustomers).toBeLessThanOrEqual(20);
    expect(s.proposals.length).toBeLessThanOrEqual(40);
    const tasks = s.staff.reduce((t, m) => t + m.stats.tasksDone, 0);
    const helped = s.staff.reduce((t, m) => t + m.stats.customersHelped, 0);
    console.log(`staff100d: ${JSON.stringify({ ms: Date.now() - t0, money: Math.round(s.money), served: s.stats.customersServed, tasks, helped, approved, rep: Math.round(Object.values(s.reputation).reduce((a, b) => a + b, 0) / 7), fish: Object.values(s.fish).filter((f) => f.alive && f.tankId).length, died: s.stats.fishDied, saveKB: Math.round(JSON.stringify(serialize(s, 'x')).length / 1024) })}`);
    expect(tasks).toBeGreaterThan(50);
    expect(helped).toBeGreaterThan(50);
    expect(Number.isFinite(s.money)).toBe(true);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, 'x'))));
    expect(back.staff.length).toBe(5);
  }, 300_000);
});

describe('long-run: a played shop with every floor and staff', () => {
  it('100 days at level 4 with two staff stays solvent', async () => {
    const { buildUpTo, hire } = await import('./helpers/world');
    const { createFish } = await import('../src/sim/fish');
    const { Rng } = await import('../src/core/rng');
    const { topOffTank } = await import('../src/sim/tank');
    const { buyRetailStock } = await import('../src/sim/retail');
    const t0 = Date.now();
    const stock: Array<[string, string, number]> = [
      ['U1', 'rosy_barb', 8], ['U2', 'medaka', 10], ['U3', 'paradise_fish', 2], ['U4', 'hillstream_loach', 4],
      ['M1', 'clownfish', 2], ['M2', 'banggai_cardinal', 5], ['M3', 'royal_gramma', 1], ['M4', 'german_blue_ram', 2],
    ];
    const r = runBot(100, 505, {
      breedingTanks: BREEDERS,
      setup: (sim) => {
        const s = sim.state;
        buildUpTo(s, 4);
        s.money = 2500;
        const rng = new Rng(9);
        for (const [tank, sid, n] of stock) {
          s.tanks[tank].water.aob = 0.85;
          s.tanks[tank].water.nob = 0.8;
          for (let i = 0; i < n; i++) createFish(s, rng, { speciesId: sid, origin: 'dev', tankId: tank, sizeFraction: 0.8 });
        }
        hire(sim, 'sales', { service: 60, knowledge: 55 });
        hire(sim, 'maintenance', { cleaning: 60, speed: 55 });
        for (const id of ['filter_sponge', 'heater_50', 'bundle_starter', 'tank_60', 'light_led']) s.retail[id] = 5;
        s.dryGoods.salt_mix = 30;
        s.dryGoods.ro_water = 30;
      },
      onDay: (sim) => {
        const s = sim.state;
        for (const id of s.tankOrder) if (s.tanks[id].waterType === 'marine') topOffTank(s, s.tanks[id]);
        if ((s.dryGoods.ro_water ?? 0) < 6) s.dryGoods.ro_water = 20;
        if ((s.dryGoods.salt_mix ?? 0) < 6) s.dryGoods.salt_mix = 20;
        for (const id of ['filter_sponge', 'heater_50', 'bundle_starter', 'tank_60', 'light_led']) if ((s.retail[id] ?? 0) < 2 && s.money > 300) buyRetailStock(s, id, 3);
      },
    });
    const s = r.sim.state;
    invariants(s);
    report('L4+staff 100d', 100, r, Date.now() - t0);
    for (const id of s.tankOrder) if (s.tanks[id].waterType === 'marine') expect(s.tanks[id].water.salinity!).toBeLessThan(37);
    expect(s.money).toBeGreaterThan(0);
  }, 300_000);
});
