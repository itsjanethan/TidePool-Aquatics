import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { createFish, eat, fishValue } from '../src/sim/fish';
import { assessSpeciesForSetup, stressTarget } from '../src/sim/compat';
import { summarizeAquascape } from '../src/sim/aquascape';
import { SPECIES } from '../src/data/species';

describe('fish', () => {
  it('every species definition is internally consistent', () => {
    for (const sp of SPECIES) {
      expect(sp.temperature.min).toBeLessThan(sp.temperature.max);
      expect(sp.temperature.ideal).toBeGreaterThanOrEqual(sp.temperature.min);
      expect(sp.temperature.ideal).toBeLessThanOrEqual(sp.temperature.max);
      expect(sp.ph.min).toBeLessThan(sp.ph.max);
      expect(sp.morphs.length).toBeGreaterThan(0);
      expect(sp.retailPrice).toBeGreaterThan(sp.supplierCost);
    }
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });

  it('fed fish grow, starving fish do not', () => {
    const s = newGame({ seed: 1 });
    const sim = new Simulation(s);
    const rng = new Rng(9);
    const fed = createFish(s, rng, { speciesId: 'guppy', origin: 'dev', tankId: 'A1', sizeFraction: 0.4 });
    const starved = createFish(s, rng, { speciesId: 'guppy', origin: 'dev', tankId: 'A3', sizeFraction: 0.4 });
    const fed0 = fed.sizeCm;
    const st0 = starved.sizeCm;
    for (let h = 0; h < 24 * 10; h++) {
      fed.hunger = 20;
      starved.hunger = 95;
      s.minute += 60; sim.tickTanks(1);
    }
    expect(fed.sizeCm - fed0).toBeGreaterThan((starved.sizeCm - st0) * 2);
    expect(fed.ageDays).toBeGreaterThan(9);
  });

  it('eating reduces hunger proportional to appetite', () => {
    const s = newGame({ seed: 1 });
    const f = createFish(s, new Rng(1), { speciesId: 'neon_tetra', origin: 'dev', tankId: 'A4' });
    f.hunger = 80;
    const took = eat(f, 100);
    expect(took).toBeGreaterThan(0);
    expect(f.hunger).toBeLessThan(5);
  });

  it('a lone neon is stressed, a shoal is not', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.C2;
    const rng = new Rng(4);
    const lone = createFish(s, rng, { speciesId: 'neon_tetra', origin: 'dev', tankId: 'C2' });
    const scape = summarizeAquascape(t);
    const loneStress = stressTarget(lone, t, [lone], scape).total;
    const group = [lone];
    for (let i = 0; i < 7; i++) group.push(createFish(s, rng, { speciesId: 'neon_tetra', origin: 'dev', tankId: 'C2' }));
    const groupStress = stressTarget(lone, t, group, scape).total;
    expect(loneStress).toBeGreaterThan(groupStress + 10);
  });

  it('suitability check catches classic mistakes', () => {
    expect(assessSpeciesForSetup('fancy_goldfish', { litres: 30, heated: false }).score).toBeLessThan(0.5);
    expect(assessSpeciesForSetup('neon_tetra', { litres: 60, heated: false }).score).toBeLessThan(0.5);
    expect(assessSpeciesForSetup('guppy', { litres: 60, heated: true }).score).toBeGreaterThanOrEqual(0.75);
    expect(assessSpeciesForSetup('white_cloud', { litres: 40, heated: false }).score).toBeGreaterThanOrEqual(0.75);
    expect(assessSpeciesForSetup('guppy', { litres: 60, heated: true, residentSpecies: ['zebra_danio'] }).issues.length).toBeGreaterThan(0);
  });

  it('bigger, healthier fish are worth more', () => {
    const s = newGame({ seed: 3 });
    const rng = new Rng(1);
    const small = createFish(s, rng, { speciesId: 'platy', morphId: 'red', origin: 'dev', tankId: null, sizeFraction: 0.35, quality: 0.5 });
    const big = createFish(s, rng, { speciesId: 'platy', morphId: 'red', origin: 'dev', tankId: null, sizeFraction: 0.95, quality: 0.5 });
    expect(fishValue(big)).toBeGreaterThan(fishValue(small));
    big.health = 30;
    expect(fishValue(big)).toBeLessThan(fishValue({ ...big, health: 100 }));
  });
});
