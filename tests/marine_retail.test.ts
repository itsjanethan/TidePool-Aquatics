import { describe, expect, it } from 'vitest';
import { createFish, fishInTank, environmentalDamage } from '../src/sim/fish';
import { Rng } from '../src/core/rng';
import { placeOrder } from '../src/sim/supplier';
import { doWaterChange, topOffTank, addDecor } from '../src/sim/tank';
import { diagnoseTank } from '../src/sim/tankDiagnostics';
import { EVAPORATION_PPT_PER_DAY, sgLabel, specificGravity, TARGET_SALINITY } from '../src/sim/marine';
import { assessSpeciesForSetup } from '../src/sim/compat';
import { buyRetailStock, stockSpace, stockSpaceUsed, availableRetail } from '../src/sim/retail';
import { spawnCustomer, checkoutQuote, completeSale } from '../src/sim/customers';
import { SPECIES } from '../src/data/species';
import { phenotypeFrom } from '../src/sim/phenotype';
import { genotypeForMorph } from '../src/sim/genetics';
import { paintFishSheet } from '../src/render/art/fishPainter';
import { world } from './helpers/world';

describe('marine', () => {
  it('salinity rises with evaporation and RO top-off brings it back', () => {
    const sim = world(1, 3);
    const s = sim.state;
    const t = s.tanks.M1;
    expect(t.water.salinity).toBe(TARGET_SALINITY);
    for (let i = 0; i < 24 * 5; i++) sim.tickTanks(1);
    expect(t.water.salinity!).toBeCloseTo(TARGET_SALINITY + EVAPORATION_PPT_PER_DAY * 5, 1);
    s.dryGoods.ro_water = 1;
    expect(topOffTank(s, t).ok).toBe(true);
    expect(Math.abs(t.water.salinity! - TARGET_SALINITY)).toBeLessThan(0.2);
    expect(topOffTank(s, t).ok).toBe(false); // out of RO water
  });

  it('water changes need salt mix; without it salinity drops', () => {
    const sim = world(1, 3);
    const s = sim.state;
    const t = s.tanks.M2;
    s.dryGoods.salt_mix = 1;
    doWaterChange(s, t, 0.25);
    expect(t.water.salinity).toBeCloseTo(TARGET_SALINITY, 1);
    doWaterChange(s, t, 0.25);
    expect(t.water.salinity!).toBeLessThan(28);
    const issue = diagnoseTank(s, t).issues.find((i) => i.id === 'salinity');
    expect(issue?.title).toBe('Salinity too low');
    expect(issue?.value).toContain('SG');
  });

  it('SG is shown like a hydrometer', () => {
    expect(specificGravity(35).toFixed(3)).toBe('1.026');
    expect(sgLabel(35)).toBe('SG 1.026 (35.0 ppt)');
  });

  it('freshwater and marine fish are kept apart', () => {
    const sim = world(1, 3);
    const s = sim.state;
    s.money = 1000;
    const r = placeOrder(s, 'riverside', [{ speciesId: 'guppy', quantity: 2, tankId: 'M1' }], 1);
    expect(r.ok).toBe(false);
    expect(assessSpeciesForSetup('clownfish', { litres: 200, heated: true }).score).toBe(0);
    expect(assessSpeciesForSetup('clownfish', { litres: 200, heated: true, temperature: 26, waterType: 'marine' }).score).toBe(1);
    expect(addDecor(s, s.tanks.A1, 'live_rock', 0.5, 1).ok).toBe(false);
    expect(addDecor(s, s.tanks.M1, 'java_fern', 0.5, 1).ok).toBe(false);
  });

  it('marine fish are harmed by the wrong salinity, freshwater fish by any salt', () => {
    const env = { temperature: 26, ph: 8.2, gh: 12, ammonia: 0, nitrite: 0, nitrate: 5, oxygen: 7, litres: 200, stressTarget: 0 };
    const s = world(1, 3).state;
    const clown = createFish(s, new Rng(1), { speciesId: 'clownfish', origin: 'dev', tankId: 'M1', sizeFraction: 1 });
    expect(environmentalDamage(clown, { ...env, salinity: 35 }).causes).not.toContain('salinity');
    expect(environmentalDamage(clown, { ...env, salinity: 25 }).causes).toContain('salinity');
    const guppy = fishInTank(s, 'A1')[0];
    expect(environmentalDamage(guppy, { ...env, ph: 7.4, gh: 10, temperature: 25, salinity: 20 }).causes).toContain('salinity');
  });
});

describe('equipment retail', () => {
  it('stock space limits buying in', () => {
    const sim = world(1, 4);
    const s = sim.state;
    s.money = 100000;
    expect(stockSpace(s)).toBe(240);
    expect(buyRetailStock(s, 'tank_120', 31).ok).toBe(false); // 248 > 240 space
    expect(buyRetailStock(s, 'tank_120', 10).ok).toBe(true);
    expect(stockSpaceUsed(s)).toBe(80);
  });

  it('equipment customers go to the basement, buy what they need, and pay at the till', () => {
    const sim = world(7, 4);
    const s = sim.state;
    s.minute = Math.floor(s.minute / 1440) * 1440 + 10 * 60;
    for (const id of ['filter_sponge', 'heater_50', 'tank_60', 'filter_hob', 'heater_150', 'tank_120', 'light_led', 'skimmer', 'refractometer']) s.retail[id] = 5;
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_equipment' });
    c.wants = ['filter_sponge'];
    c.askedAdvice = true;
    c.traits.budget = 100;
    let visited = false;
    for (let i = 0; i < 200 && !(c.equipment ?? []).length; i++) {
      sim.advance(1);
      if (c.floor === 'basement') visited = true;
    }
    expect(visited).toBe(true);
    expect(c.equipment).toEqual(['filter_sponge']);
    expect(availableRetail(s, 'filter_sponge')).toBe(4);
    const money = s.money;
    const total = checkoutQuote(s, c).total;
    completeSale(s, sim.customerCtx, c, total);
    expect(s.retail.filter_sponge).toBe(4);
    expect(s.money).toBeCloseTo(money + total, 2);
  });

  it('a beginner wanting several parts often takes a bundle', () => {
    const sim = world(8, 4);
    const s = sim.state;
    s.minute = Math.floor(s.minute / 1440) * 1440 + 10 * 60;
    s.retail.bundle_starter = 3;
    s.retail.tank_60 = 3;
    s.retail.filter_sponge = 3;
    s.retail.heater_50 = 3;
    let bundles = 0;
    for (let k = 0; k < 8; k++) {
      const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_equipment' });
      c.wants = ['tank_60', 'filter_sponge', 'heater_50'];
      c.traits.budget = 300;
      c.askedAdvice = true;
      for (let i = 0; i < 200 && !(c.equipment ?? []).length; i++) sim.advance(1);
      if (c.equipment?.includes('bundle_starter')) bundles++;
      s.customers = [];
      s.retail.bundle_starter = 3;
    }
    expect(bundles).toBeGreaterThan(2);
  });
});

describe('new species meet the painter standard', () => {
  it('every species and morph paints a full 11-frame sheet with visible pixels', () => {
    for (const sp of SPECIES) {
      for (const m of sp.morphs) {
        const ph = phenotypeFrom({ speciesId: sp.id, morphId: m.id, sex: 'male', sizeFraction: 1, ageDays: sp.maturityDays * 3, loci: genotypeForMorph(sp.id, m.id, new Rng(3)), quality: 0.6, health: 100, pregnancy: 0, breedingReadiness: 0, id: `${sp.id}${m.id}` });
        const sheet = paintFishSheet(ph, 90);
        expect(sheet.frames.length).toBe(11);
        const opaque = sheet.frames[0].filter((_, i) => i % 4 === 3 && sheet.frames[0][i] > 200).length;
        expect(opaque, `${sp.id}/${m.id}`).toBeGreaterThan(300);
      }
    }
  });
});

describe('equipment advice and bundles', () => {
  it('selling a bundle uses one bundle from stock and earns its margin', async () => {
    const { retailMargin } = await import('../src/sim/retail');
    const { getRetailItem } = await import('../src/data/retail');
    const sim = world(3, 4);
    const s = sim.state;
    s.retail.bundle_starter = 2;
    s.retail.tank_60 = 1;
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_equipment' });
    c.equipment = ['bundle_starter'];
    const money = s.money;
    completeSale(s, sim.customerCtx, c, checkoutQuote(s, c).total);
    expect(s.retail.bundle_starter).toBe(1);
    expect(s.retail.tank_60).toBe(1); // parts stock untouched: a bundle is its own boxed item
    expect(s.money - money).toBeCloseTo(getRetailItem('bundle_starter').retail, 2);
    // Bundles earn more per sale than the same parts would at their own margins on average.
    const b = getRetailItem('bundle_starter');
    expect(retailMargin(s, b.id)).toBeGreaterThan(30);
  });

  it('good equipment advice covers the need; a poor suggestion does not', async () => {
    const { equipmentCovers, equipmentOptions, resolveEquipmentAdvice } = await import('../src/sim/customers');
    const sim = world(3, 4);
    const s = sim.state;
    for (const id of ['heater_50', 'heater_150', 'tank_60', 'filter_sponge', 'air_pump', 'bundle_starter', 'bundle_tropical40']) s.retail[id] = 3;
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_equipment' });
    c.wants = ['heater_150'];
    c.traits.budget = 100;
    const opts = equipmentOptions(s, c);
    expect(opts.some((o) => equipmentCovers(c, o.items))).toBe(true);
    expect(opts.some((o) => !equipmentCovers(c, o.items))).toBe(true);
    c.traits.experience = 0;
    const r = resolveEquipmentAdvice(s, sim.customerCtx, c, ['heater_150']);
    expect(r.success).toBe(true);
    expect(c.equipment).toEqual(['heater_150']);
    const c2 = spawnCustomer(s, sim.customerCtx, { goal: 'buy_equipment' });
    c2.wants = ['tank_60', 'filter_sponge', 'heater_50'];
    c2.traits.budget = 300;
    expect(equipmentOptions(s, c2).some((o) => o.items[0] === 'bundle_starter')).toBe(true);
  });

  it('marine kit is only stocked once marine is unlocked', async () => {
    const { retailItemsFor } = await import('../src/sim/retail');
    const s2 = world(1, 2).state;
    expect(retailItemsFor(s2).some((r) => r.id === 'bundle_marine')).toBe(false);
    const s3 = world(1, 3).state;
    expect(retailItemsFor(s3).some((r) => r.id === 'bundle_marine')).toBe(true);
  });
});
