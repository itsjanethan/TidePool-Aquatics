import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { newGame } from '../src/sim/newGame';
import { createFish } from '../src/sim/fish';
import { birthFry } from '../src/sim/breeding';
import { phenotypeKey, phenotypeOf } from '../src/sim/phenotype';
import { traitLabels } from '../src/sim/genetics';
import { paintFishSheet, SHEET_FRAMES } from '../src/render/art/fishPainter';
import type { FishEntity } from '../src/sim/types';

function adult(s: ReturnType<typeof newGame>, rng: Rng, speciesId: string, sex: 'male' | 'female', loci?: Record<string, [string, string]>): FishEntity {
  const f = createFish(s, rng, { speciesId, origin: 'dev', originDetail: 'test', tankId: s.tankOrder[0], sizeFraction: 1 });
  f.sex = sex;
  f.ageDays = 300;
  f.health = 100;
  if (loci) Object.assign(f.genes.loci, loci);
  return f;
}

const opaque = (data: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) n++;
  return n;
};

describe('phenotype', () => {
  it('different morphs and traits give different looks', () => {
    const s = newGame({ seed: 1 });
    const rng = new Rng(2);
    const red = adult(s, rng, 'guppy', 'male', { colour: ['R', 'R'] });
    const blue = adult(s, rng, 'guppy', 'male', { colour: ['B', 'B'] });
    red.morphId = 'red_delta';
    blue.morphId = 'blue_mosaic';
    expect(phenotypeKey(phenotypeOf(red))).not.toBe(phenotypeKey(phenotypeOf(blue)));
    const albino = adult(s, rng, 'guppy', 'male', { colour: ['R', 'R'], albino: ['a', 'a'] });
    albino.morphId = 'red_delta';
    const pa = phenotypeOf(albino);
    expect(pa.albino).toBe(true);
    expect(pa.iris[0]).toBeGreaterThan(pa.iris[2]);
    expect(traitLabels(albino)).toContain('Albino');
  });

  it('male-only tail genes are carried hidden by females and juveniles', () => {
    const s = newGame({ seed: 3 });
    const rng = new Rng(4);
    const male = adult(s, rng, 'guppy', 'male', { tail: ['S', 'S'] });
    const female = adult(s, rng, 'guppy', 'female', { tail: ['S', 'S'] });
    expect(phenotypeOf(male).caudal).toBe('double_sword');
    expect(phenotypeOf(female).caudal).toBe('round');
    expect(traitLabels(female)).not.toContain('Double Sword');
    male.ageDays = 3;
    male.sizeCm = male.adultSizeCm * 0.2;
    expect(phenotypeOf(male).caudal).not.toBe('double_sword');
  });

  it('metallic is incompletely dominant: one copy gives half the sheen', () => {
    const s = newGame({ seed: 5 });
    const rng = new Rng(6);
    const one = phenotypeOf(adult(s, rng, 'guppy', 'male', { metal: ['M', 'm'] })).metallic;
    const two = phenotypeOf(adult(s, rng, 'guppy', 'male', { metal: ['M', 'M'] })).metallic;
    expect(one).toBeGreaterThan(0.3);
    expect(two).toBeGreaterThan(one * 1.6);
  });

  it('fry are plain and develop colour and fins as they grow', () => {
    const s = newGame({ seed: 7 });
    const rng = new Rng(8);
    const f = adult(s, rng, 'guppy', 'male', { colour: ['R', 'R'] });
    f.morphId = 'red_delta';
    const grown = phenotypeOf(f);
    f.sizeCm = f.adultSizeCm * 0.2;
    f.ageDays = 2;
    const fry = phenotypeOf(f);
    expect(fry.fry).toBe(true);
    expect(fry.maturity).toBe(0);
    expect(fry.caudalSize).toBeLessThan(grown.caudalSize);
    expect(fry.bodyClarity).toBeGreaterThan(0);
  });

  it('pregnancy shows: gravid females paint a fuller belly', () => {
    const s = newGame({ seed: 9 });
    const rng = new Rng(10);
    const f = adult(s, rng, 'guppy', 'female');
    const before = paintFishSheet(phenotypeOf(f), 80);
    f.pregnancy = { daysRemaining: 0.5, fryCount: 8 };
    const p = phenotypeOf(f);
    expect(p.gravid).toBeGreaterThan(0.8);
    const after = paintFishSheet(p, 80);
    expect(opaque(after.frames[0])).toBeGreaterThan(opaque(before.frames[0]));
  });

  it('is deterministic per fish and varies between siblings', () => {
    const s = newGame({ seed: 11 });
    const rng = new Rng(12);
    const mum = adult(s, rng, 'guppy', 'female', { colour: ['R', 'B'], tail: ['D', 'S'], metal: ['M', 'm'] });
    const dad = adult(s, rng, 'guppy', 'male', { colour: ['B', 'G'], tail: ['S', 'r'], metal: ['m', 'm'] });
    const kids = birthFry(s, rng, mum, dad, s.tanks[s.tankOrder[0]], 12);
    for (const k of kids) {
      k.sex = 'male';
      k.ageDays = 200;
      k.sizeCm = k.adultSizeCm;
    }
    const keys = new Set(kids.map((k) => phenotypeKey(phenotypeOf(k))));
    expect(keys.size).toBeGreaterThan(6);
    expect(phenotypeKey(phenotypeOf(kids[0]))).toBe(phenotypeKey(phenotypeOf(kids[0])));
  });

  it('the painter fills every frame, and turn frames are narrower', () => {
    const s = newGame({ seed: 13 });
    const f = adult(s, new Rng(14), 'neon_tetra', 'male');
    const sheet = paintFishSheet(phenotypeOf(f), 90);
    expect(sheet.frames.length).toBe(SHEET_FRAMES);
    for (const fr of sheet.frames) expect(opaque(fr)).toBeGreaterThan(100);
    expect(opaque(sheet.frames[SHEET_FRAMES - 1])).toBeLessThan(opaque(sheet.frames[0]) * 0.6);
  });

  it('paints every species and morph without errors', () => {
    const s = newGame({ seed: 15 });
    const rng = new Rng(16);
    for (const sid of ['guppy', 'endler', 'platy', 'molly', 'neon_tetra', 'zebra_danio', 'white_cloud', 'bronze_cory', 'bristlenose', 'fancy_goldfish']) {
      const f = adult(s, rng, sid, 'male');
      const t0 = performance.now();
      const sheet = paintFishSheet(phenotypeOf(f), 100);
      expect(performance.now() - t0).toBeLessThan(400);
      expect(opaque(sheet.frames[0])).toBeGreaterThan(200);
    }
  });
});
