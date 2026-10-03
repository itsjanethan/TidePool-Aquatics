import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { GENETICS } from '../src/data/genetics';
import { birthFry, breedingConditions, tickBreeding } from '../src/sim/breeding';
import { createFish, fishInTank, fishValue } from '../src/sim/fish';
import { establishStrain, expressed, inherit, morphFromGenes, strainEligibility } from '../src/sim/genetics';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import type { GameState } from '../src/sim/types';

const quiet = { log: () => undefined };

function emptyTank(s: GameState, id: string) {
  for (const f of fishInTank(s, id, true)) delete s.fish[f.id];
  return s.tanks[id];
}

describe('genetics', () => {
  it('expresses dominant alleles and maps morphs', () => {
    const colour = GENETICS.guppy.loci[0];
    expect(expressed(colour, ['w', 'R'])).toBe('R');
    expect(morphFromGenes('guppy', { colour: ['w', 'w'] })).toBe('wild');
    expect(morphFromGenes('guppy', { colour: ['B', 'w'] })).toBe('blue_mosaic');
  });

  it('two carriers of a recessive produce about a quarter recessive offspring', () => {
    const rng = new Rng(5);
    const parent = { loci: { colour: ['R', 'w'] as [string, string] }, quality: 0.5, size: 1 };
    let wild = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (morphFromGenes('guppy', inherit('guppy', parent, parent, rng).genes.loci) === 'wild') wild++;
    expect(wild / n).toBeGreaterThan(0.2);
    expect(wild / n).toBeLessThan(0.3);
  });

  it('every species genotype generator can produce each morph', () => {
    const s = newGame({ seed: 1 });
    const rng = new Rng(2);
    for (const sid of Object.keys(GENETICS)) {
      for (const rule of GENETICS[sid].rules) {
        const f = createFish(s, rng, { speciesId: sid, morphId: rule.morph, origin: 'dev', tankId: null });
        expect(f.morphId, `${sid}/${rule.morph}`).toBe(rule.morph);
      }
    }
  });
});

describe('breeding', () => {
  it('livebearers get pregnant and give birth to persistent fry with parents', () => {
    const s = newGame({ seed: 3 });
    const sim = new Simulation(s);
    const t = emptyTank(s, 'A1');
    t.decor.push({ uid: 'p1', defId: 'hornwort', x: 0.3, layer: 0, flip: false, health: 1, size: 1.4 });
    const rng = new Rng(4);
    const male = createFish(s, rng, { speciesId: 'guppy', sex: 'male', ageDays: 60, sizeFraction: 0.95, origin: 'dev', tankId: 'A1' });
    const female = createFish(s, rng, { speciesId: 'guppy', sex: 'female', ageDays: 60, sizeFraction: 0.95, origin: 'dev', tankId: 'A1' });
    let born = 0;
    for (let h = 0; h < 24 * 30 && born === 0; h++) {
      for (const f of [male, female]) {
        f.hunger = 20;
        f.stress = 10;
        f.health = 100;
        f.breedingReadiness = Math.max(f.breedingReadiness, 0.8);
      }
      s.minute += 60;
      sim.tickTanks(1);
      born = fishInTank(s, 'A1').filter((f) => f.origin === 'bred').length;
    }
    expect(born).toBeGreaterThan(0);
    const fry = fishInTank(s, 'A1').find((f) => f.origin === 'bred')!;
    expect(fry.parents.motherId).toBe(female.id);
    expect(fry.parents.fatherId).toBe(male.id);
    expect(fry.generation).toBe(1);
    expect(female.offspringCount).toBeGreaterThan(0);
  });

  it('cave spawners need a cave', () => {
    const s = newGame({ seed: 3 });
    const t = emptyTank(s, 'B1');
    const rng = new Rng(1);
    for (const sex of ['male', 'female'] as const) {
      const f = createFish(s, rng, { speciesId: 'bristlenose', sex, ageDays: 200, sizeFraction: 0.95, origin: 'dev', tankId: 'B1' });
      f.breedingReadiness = 1;
      f.stress = 5;
      f.hunger = 10;
    }
    expect(breedingConditions(s, t, 'bristlenose').factor).toBeGreaterThan(0);
    t.decor = t.decor.filter((d) => d.defId !== 'clay_cave');
    expect(breedingConditions(s, t, 'bristlenose').factor).toBe(0);
  });

  it('egg broods hatch into fry; cover protects fry from predators', () => {
    const run = (cover: boolean) => {
      const s = newGame({ seed: 9 });
      const t = emptyTank(s, 'A6');
      t.decor = cover ? Array.from({ length: 6 }, (_, i) => ({ uid: `h${i}`, defId: 'hornwort', x: i / 6, layer: 1 as const, flip: false, health: 1, size: 1.4 })) : [];
      const rng = new Rng(11);
      const mum = createFish(s, rng, { speciesId: 'zebra_danio', sex: 'female', ageDays: 80, sizeFraction: 0.95, origin: 'dev', tankId: 'A6' });
      const dad = createFish(s, rng, { speciesId: 'zebra_danio', sex: 'male', ageDays: 80, sizeFraction: 0.95, origin: 'dev', tankId: 'A6' });
      for (let i = 0; i < 4; i++) createFish(s, rng, { speciesId: 'zebra_danio', ageDays: 80, sizeFraction: 0.95, origin: 'dev', tankId: 'A6' });
      (t.broods ??= []).push({ id: 'b1', speciesId: 'zebra_danio', motherId: mum.id, fatherId: dad.id, count: 100, daysLeft: 0.01, laidDay: 1 });
      let total = 0;
      for (let k = 0; k < 20; k++) {
        tickBreeding(s, t, 1, new Rng(100 + k), quiet);
        if (k === 0) total = fishInTank(s, 'A6').filter((f) => f.origin === 'bred').length;
      }
      for (let h = 0; h < 24 * 5; h++) tickBreeding(s, t, 1, new Rng(h), quiet);
      return { hatched: total, left: fishInTank(s, 'A6').filter((f) => f.origin === 'bred').length };
    };
    const open = run(false);
    const planted = run(true);
    expect(planted.hatched).toBeGreaterThan(open.hatched);
    expect(planted.left).toBeGreaterThanOrEqual(open.left);
  });

  it('strains need a shop-bred line and are inherited', () => {
    const s = newGame({ seed: 4 });
    const t = emptyTank(s, 'A1');
    const rng = new Rng(8);
    const p1 = createFish(s, rng, { speciesId: 'guppy', morphId: 'red_delta', sex: 'female', origin: 'bred', tankId: 'A1', generation: 1, genes: { loci: { colour: ['R', 'R'] }, quality: 0.7, size: 1 } });
    const p2 = createFish(s, rng, { speciesId: 'guppy', morphId: 'red_delta', sex: 'male', origin: 'bred', tankId: 'A1', generation: 1, genes: { loci: { colour: ['R', 'R'] }, quality: 0.7, size: 1 } });
    const kids = birthFry(s, rng, p1, p2, t, 3);
    expect(kids[0].generation).toBe(2);
    expect(strainEligibility(s, kids[0]).ok).toBe(true);
    const supplierFish = createFish(s, rng, { speciesId: 'guppy', morphId: 'red_delta', origin: 'supplier', tankId: 'A1' });
    expect(strainEligibility(s, supplierFish).ok).toBe(false);
    const strain = establishStrain(s, kids[0], 'Tidepool Red Delta')!;
    expect(strain).toBeTruthy();
    expect(kids[1].strainName).toBe(strain.id);
    const grandkids = birthFry(s, rng, kids[0].sex === 'female' ? kids[0] : kids[1], kids[2], t, 2);
    if (kids[0].sex !== kids[2].sex) expect(grandkids.every((g) => g.strainName === strain.id)).toBe(true);
    // Bred and strain fish are worth more than equivalent supplier fish, within limits.
    const a = { ...supplierFish, sizeCm: supplierFish.adultSizeCm, quality: 0.6, health: 100 };
    const b = { ...a, origin: 'bred' as const, strainName: strain.id, generation: 10 };
    expect(fishValue(b)).toBeGreaterThan(fishValue(a));
    expect(fishValue(b) / fishValue(a)).toBeLessThan(1.6);
  });
});
