import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { lineWarnings, orderWarnings, projectedStocking } from '../src/sim/orderCheck';
import { fishInTank } from '../src/sim/fish';

describe('order validation', () => {
  it('warns about an uncycled tank and wrong temperature, but returns advice only', () => {
    const s = newGame({ seed: 11 });
    const t = s.tanks[s.tankOrder[0]];
    t.water.aob = 0;
    t.water.nob = 0;
    t.water.ammonia = 0;
    t.water.nitrite = 0;
    t.water.temperature = 18;
    const w = lineWarnings(s, { speciesId: 'neon_tetra', quantity: 8, tankId: t.id }, []);
    const text = w.map((x) => x.text).join(' | ');
    expect(text).toMatch(/not cycled/);
    expect(text).toMatch(/18°C/);
  });

  it('projects stocking across all lines going to the same tank', () => {
    const s = newGame({ seed: 12 });
    const id = s.tankOrder[0];
    const one = projectedStocking(s, id, [{ speciesId: 'guppy', quantity: 5, tankId: id }]);
    const two = projectedStocking(s, id, [
      { speciesId: 'guppy', quantity: 5, tankId: id },
      { speciesId: 'platy', quantity: 5, tankId: id },
    ]);
    expect(two).toBeGreaterThan(one);
    const big = orderWarnings(s, [{ speciesId: 'fancy_goldfish', quantity: 20, tankId: id }]);
    expect(big.some((w) => /overstocked/.test(w.text))).toBe(true);
  });

  it('flags goldfish going in with tiny fish and small groups', () => {
    const s = newGame({ seed: 13 });
    const id = s.tankOrder.find((tid) => fishInTank(s, tid).some((f) => f.speciesId === 'neon_tetra'))!;
    const w = orderWarnings(s, [{ speciesId: 'fancy_goldfish', quantity: 1, tankId: id }]);
    expect(w.some((x) => /goldfish|temperature/i.test(x.text))).toBe(true);
  });

  it('a sensible order to a matching tank has no hard warnings', () => {
    const s = newGame({ seed: 14 });
    const id = s.tankOrder.find((tid) => fishInTank(s, tid).some((f) => f.speciesId === 'guppy'))!;
    for (const f of fishInTank(s, id)) delete s.fish[f.id];
    const t = s.tanks[id];
    Object.assign(t.water, { aob: 0.9, nob: 0.9, ammonia: 0, nitrite: 0, ph: 7.4, gh: 12, temperature: 25 });
    const w = orderWarnings(s, [{ speciesId: 'guppy', quantity: 6, tankId: id }]).filter((x) => x.severity === 'warn');
    expect(w).toEqual([]);
  });
});
