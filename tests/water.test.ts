import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { createFish, fishInTank } from '../src/sim/fish';
import { Rng } from '../src/core/rng';
import { cycleStatus, waterChange } from '../src/sim/water';
import { feedTank } from '../src/sim/tank';

describe('water system', () => {
  it('a new tank with fish shows an ammonia then nitrite spike and eventually cycles', () => {
    const s = newGame({ seed: 7 });
    const sim = new Simulation(s);
    const rng = new Rng(3);
    const tank = s.tanks.C2;
    expect(cycleStatus(tank.water)).toBe('uncycled');
    for (let i = 0; i < 4; i++) createFish(s, rng, { speciesId: 'zebra_danio', origin: 'dev', tankId: 'C2' });
    let peakAmmonia = 0;
    let peakNitrite = 0;
    for (let d = 0; d < 30; d++) {
      for (let h = 0; h < 24; h++) {
        s.minute += 60; sim.tickTanks(1);
        for (const f of fishInTank(s, 'C2')) f.hunger = 30; // keep fish fed for this test
      }
      peakAmmonia = Math.max(peakAmmonia, tank.water.ammonia);
      peakNitrite = Math.max(peakNitrite, tank.water.nitrite);
    }
    expect(peakAmmonia).toBeGreaterThan(0.1);
    expect(peakNitrite).toBeGreaterThan(0.05);
    expect(cycleStatus(tank.water)).toBe('cycled');
    expect(tank.water.ammonia).toBeLessThan(0.1);
  });

  it('mature starter tanks stay stable for a week', () => {
    const s = newGame({ seed: 11 });
    const sim = new Simulation(s);
    for (let h = 0; h < 24 * 7; h++) {
      s.minute += 60; sim.tickTanks(1);
      if (h % 12 === 0) for (const id of s.tankOrder) feedTank(s, s.tanks[id], 'normal');
    }
    for (const id of s.tankOrder) {
      if (id === 'C2') continue;
      expect(s.tanks[id].water.ammonia, id).toBeLessThan(0.25);
      expect(s.tanks[id].water.nitrite, id).toBeLessThan(0.25);
    }
    const alive = Object.values(s.fish).filter((f) => f.alive && f.origin === 'starter').length;
    expect(alive).toBe(65);
  });

  it('overfeeding raises waste compared with normal feeding', () => {
    const a = newGame({ seed: 5 });
    const b = newGame({ seed: 5 });
    const sa = new Simulation(a);
    const sb = new Simulation(b);
    for (let h = 0; h < 72; h++) {
      if (h % 8 === 0) {
        feedTank(a, a.tanks.A1, 'normal');
        for (let i = 0; i < 3; i++) feedTank(b, b.tanks.A1, 'heavy');
      }
      a.minute += 60; b.minute += 60;
      sa.tickTanks(1);
      sb.tickTanks(1);
    }
    expect(b.tanks.A1.water.nitrate + b.tanks.A1.water.ammonia * 10).toBeGreaterThan(a.tanks.A1.water.nitrate + a.tanks.A1.water.ammonia * 10);
    expect(b.tanks.A1.water.cloudiness).toBeGreaterThanOrEqual(a.tanks.A1.water.cloudiness);
  });

  it('water changes reduce nitrate', () => {
    const s = newGame({ seed: 2 });
    const t = s.tanks.A1;
    t.water.nitrate = 40;
    waterChange(t, 0.5);
    expect(t.water.nitrate).toBeCloseTo(20, 5);
  });
});
