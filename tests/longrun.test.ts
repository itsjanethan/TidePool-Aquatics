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
