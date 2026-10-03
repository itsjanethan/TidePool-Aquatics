/**
 * Balance smoke test: the bot runs the shop for three in-game weeks.
 * Guards against economy or welfare collapse after tuning.
 */
import { describe, expect, it } from 'vitest';
import { runBot } from './helpers/bot';

describe('balance', () => {
  it('a competent player stays solvent and keeps fish alive for three weeks', () => {
    const { sim, revenue, startRep, endRep } = runBot(21, 1234);
    const s = sim.state;
    console.log(JSON.stringify({ money: s.money, revenue: Math.round(revenue), served: s.stats.customersServed, died: s.stats.fishDied, bred: s.stats.fishBred, sold: s.stats.totalFishSold, startRep: Math.round(startRep), endRep: Math.round(endRep) }));
    expect(s.money).toBeGreaterThan(400);
    expect(s.stats.customersServed).toBeGreaterThan(100);
    expect(s.stats.fishDied).toBeLessThan(40);
    expect(endRep).toBeGreaterThan(startRep);
  });
});
