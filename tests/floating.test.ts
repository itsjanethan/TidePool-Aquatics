import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { buyFloating, floatingShade, plantFloatingFromStorage, scoopFloating, sellFloatingToTrade, totalFloating } from '../src/sim/floating';
import { summarizeAquascape } from '../src/sim/aquascape';
import { addDecor } from '../src/sim/tank';

function runDays(sim: Simulation, s: ReturnType<typeof newGame>, days: number) {
  for (let h = 0; h < 24 * days; h++) {
    s.minute += 60;
    sim.tickTanks(1);
  }
}

describe('floating plants', () => {
  it('duckweed spreads from one portion to cover the surface if ignored', () => {
    const s = newGame({ seed: 21 });
    const sim = new Simulation(s);
    const t = s.tanks.A4;
    t.floating = {};
    t.decor = [];
    s.money = 100;
    expect(buyFloating(s, t, 'duckweed').ok).toBe(true);
    const start = totalFloating(t);
    runDays(sim, s, 7);
    const week = totalFloating(t);
    runDays(sim, s, 21);
    expect(week).toBeGreaterThan(start * 3);
    expect(totalFloating(t)).toBeGreaterThan(0.85);
    expect(totalFloating(t)).toBeLessThanOrEqual(1.0001);
  });

  it('cover shades submerged plants, soaks up nitrate and hides fry', () => {
    const s = newGame({ seed: 22 });
    const sim = new Simulation(s);
    const a = s.tanks.A4;
    const b = s.tanks.A5;
    for (const t of [a, b]) {
      t.decor = [];
      addDecor(s, t, 'hornwort', 0.5, 0);
      t.water.nitrate = 30;
    }
    a.floating = { duckweed: 0.95 };
    const coverBefore = summarizeAquascape(b).cover;
    runDays(sim, s, 5);
    expect(a.decor[0].size).toBeLessThan(b.decor[0].size);
    expect(floatingShade(a)).toBeGreaterThan(0.4);
    expect(summarizeAquascape(a).cover).toBeGreaterThan(coverBefore);
    b.water.nitrate = 30;
    a.water.nitrate = 30;
    runDays(sim, s, 1);
    expect(a.water.nitrate).toBeLessThan(b.water.nitrate);
  });

  it('scooping moves portions to the stockroom, which can restock another tank or be sold', () => {
    const s = newGame({ seed: 23 });
    const a = s.tanks.A4;
    const b = s.tanks.A5;
    a.floating = { frogbit: 0.6 };
    expect(scoopFloating(s, a, 'frogbit', 0.5, true).ok).toBe(true);
    expect(a.floating.frogbit).toBeCloseTo(0.3, 3);
    const stored = s.storage.floating!.frogbit;
    expect(stored).toBeGreaterThan(2);
    expect(plantFloatingFromStorage(s, b, 'frogbit').ok).toBe(true);
    expect(s.storage.floating!.frogbit).toBe(stored - 1);
    const money = s.money;
    expect(sellFloatingToTrade(s, 'frogbit').ok).toBe(true);
    expect(s.money).toBeGreaterThan(money);
    expect(s.storage.floating!.frogbit).toBeUndefined();
    // Throwing away keeps nothing.
    scoopFloating(s, a, 'frogbit', 1, false);
    expect(a.floating.frogbit).toBeUndefined();
  });
});
