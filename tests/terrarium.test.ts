import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { getSpecies } from '../src/data/species';
import { PALUDARIUM_WATER, VIVARIUM_ROOM_TEMP } from '../src/data/terra';
import { applyPreset, createSandbox } from '../src/dev/sandbox';
import { breedingConditions } from '../src/sim/breeding';
import { loadRatio } from '../src/sim/compat';
import { createFish, fishInTank } from '../src/sim/fish';
import { newGame } from '../src/sim/newGame';
import { previewFix } from '../src/sim/preview';
import { deserialize, serialize } from '../src/sim/save';
import { Simulation } from '../src/sim/simulation';
import { maintenanceJobs } from '../src/sim/staff';
import { placeOrder, refreshSupplierStock } from '../src/sim/supplier';
import { animalEnv, addDecor, feedTank } from '../src/sim/tank';
import { diagnoseTank } from '../src/sim/tankDiagnostics';
import {
  climateWarnings, enclosureFeeder, feedEnclosure, habitatRefusal, hotspot, isLandOnly, landVolume, mistEnclosure, setHeatLamp, setVent,
  spotClean, terraIssues, terraOf, tickTerrarium,
} from '../src/sim/terrarium';
import type { FishEntity, GameState, TankState } from '../src/sim/types';
import { buildUpTo } from './helpers/world';

function vivGame(): GameState {
  const s = newGame({ seed: 9 });
  buildUpTo(s, 6);
  s.money = 1e6;
  return s;
}

function add(s: GameState, t: TankState, speciesId: string, n = 1, sex?: 'male' | 'female'): FishEntity[] {
  const rng = new Rng(3 + n);
  return Array.from({ length: n }, () => {
    const f = createFish(s, rng, { speciesId, origin: 'dev', tankId: t.id, sex, ageDays: getSpecies(speciesId).maturityDays * 1.5, sizeFraction: 1 });
    f.hunger = 20;
    return f;
  });
}

/** Runs the enclosure climate for some hours at a fixed room temperature. */
function climate(s: GameState, t: TankState, hours: number, daylight = true): void {
  for (let h = 0; h < hours; h++) tickTerrarium(s, t, 1, { ambient: VIVARIUM_ROOM_TEMP, daylight });
}

describe('vivarium floor', () => {
  it('builds vivariums, terrariums and paludariums with their own climate', () => {
    const s = vivGame();
    expect(s.unlocks.floors).toContain('vivarium');
    expect(s.tanks.V1.habitat).toBe('vivarium');
    expect(s.tanks.T1.habitat).toBe('terrarium');
    expect(s.tanks.P1.habitat).toBe('paludarium');
    expect(isLandOnly(s.tanks.V1)).toBe(true);
    expect(isLandOnly(s.tanks.P1)).toBe(false);
    // A paludarium's water is only the pool; its land volume is the rest.
    expect(s.tanks.P1.litres + landVolume(s.tanks.P1)).toBeGreaterThan(landVolume(s.tanks.P1) / (1 - PALUDARIUM_WATER) - 3);
    expect(terraOf(s.tanks.T1).heatLamp).toBe(32);
    expect(s.tanks.V1.water.temperature).toBe(VIVARIUM_ROOM_TEMP);
  });

  it('keeps land animals out of water and fish out of dry enclosures', () => {
    const s = vivGame();
    const frog = getSpecies('dart_frog');
    const toad = getSpecies('fire_bellied_toad');
    const danio = getSpecies('zebra_danio');
    expect(habitatRefusal(frog, s.tanks.Q1)).toMatch(/land animal|enclosure|vivarium/i);
    expect(habitatRefusal(danio, s.tanks.V1)).toMatch(/water|paludarium/i);
    expect(habitatRefusal(danio, s.tanks.P1)).toBeNull();
    expect(habitatRefusal(toad, s.tanks.P1)).toBeNull();
    expect(habitatRefusal(frog, s.tanks.V1)).toBeNull();
    // Orders enforce the same rule.
    refreshSupplierStock(s, new Rng(1), 'canopy', 1);
    const st = s.suppliers.canopy.stock.find((x) => x.speciesId === 'dart_frog');
    expect(st, 'The Canopy stocks dart frogs').toBeTruthy();
    if (st) {
      st.available = 10;
      const bad = placeOrder(s, 'canopy', [{ speciesId: 'dart_frog', quantity: 2, tankId: 'Q1' }], 1);
      expect(bad.ok).toBe(false);
      const good = placeOrder(s, 'canopy', [{ speciesId: 'dart_frog', quantity: 2, tankId: 'V1' }], 1);
      expect(good.ok, good.message).toBe(true);
    }
    // Land decor stays in enclosures; aquatic plants stay out of dry ones.
    expect(addDecor(s, s.tanks.Q1, 'cork_hide', 0.5, 1).ok).toBe(false);
    expect(addDecor(s, s.tanks.V1, 'java_fern', 0.5, 1).ok).toBe(false);
    expect(addDecor(s, s.tanks.V1, 'bromeliad', 0.5, 1).ok).toBe(true);
    expect(addDecor(s, s.tanks.P1, 'java_fern', 0.8, 1).ok).toBe(true);
  });

  it('runs a climate: the mister keeps a vivarium humid, open vents dry it, a lamp warms the day', () => {
    const s = vivGame();
    const v = s.tanks.V1;
    climate(s, v, 72);
    const humid = terraOf(v).humidity;
    expect(humid).toBeGreaterThanOrEqual(75);
    expect(humid).toBeLessThanOrEqual(100);
    // Opening the vents and switching the mister off dries it out over a few days.
    setVent(s, v, 0.8);
    terraOf(v).mister = false;
    climate(s, v, 96);
    expect(terraOf(v).humidity).toBeLessThan(humid - 10);
    // The desert terrarium stays dry, and its basking spot is hot in the day only.
    const t1 = s.tanks.T1;
    climate(s, t1, 48);
    expect(terraOf(t1).humidity).toBeLessThan(50);
    t1.lightOn = true;
    expect(hotspot(t1)).toBeGreaterThanOrEqual(31);
    t1.lightOn = false;
    expect(hotspot(t1)).toBeCloseTo(terraOf(t1).airTemp, 5);
  });

  it('explains what is wrong for each animal, with damage only when it matters', () => {
    const s = vivGame();
    const v = s.tanks.V1;
    const [frog] = add(s, v, 'dart_frog');
    terraOf(v).humidity = 50;
    const dry = terraIssues(frog, v, [frog]);
    expect(dry.find((i) => i.key === 'humidity_low')?.damage).toBeGreaterThan(0);
    expect(dry.find((i) => i.key === 'humidity_low')?.text).toMatch(/75-100%/);
    terraOf(v).humidity = 85;
    expect(terraIssues(frog, v, [frog]).some((i) => i.key === 'humidity_low')).toBe(false);
    // A leopard gecko with no lamp has no basking spot; two tarantulas fight.
    const t2 = s.tanks.T2;
    const [g] = add(s, t2, 'leopard_gecko');
    terraOf(t2).heatLamp = null;
    t2.lightOn = true;
    expect(terraIssues(g, t2, [g]).some((i) => i.key === 'basking')).toBe(true);
    expect(climateWarnings(t2, getSpecies('leopard_gecko')).join(' ')).toMatch(/basking lamp/);
    const t1 = s.tanks.T1;
    const spiders = add(s, t1, 'rose_tarantula', 2);
    expect(terraIssues(spiders[0], t1, spiders).some((i) => i.key === 'rival')).toBe(true);
  });

  it('feeds the right feeder, dusts with calcium, and refuses when out of stock', () => {
    const s = vivGame();
    const v3 = s.tanks.V3;
    add(s, v3, 'crested_gecko');
    expect(enclosureFeeder(s, v3)).toBe('fruit_diet');
    s.dryGoods.gecko_diet = 2;
    const r = feedEnclosure(s, v3, 'normal');
    expect(r.ok, r.message).toBe(true);
    expect(s.dryGoods.gecko_diet).toBe(1);
    const v1 = s.tanks.V1;
    add(s, v1, 'dart_frog', 3);
    s.dryGoods.fruit_flies = 0;
    expect(feedTank(s, v1, 'normal').ok).toBe(false);
    s.dryGoods.fruit_flies = 3;
    s.dryGoods.calcium_dust = 1;
    terraOf(v1).calcium = 0.2;
    expect(feedTank(s, v1, 'normal').ok).toBe(true);
    expect(s.dryGoods.fruit_flies).toBe(2);
    expect(s.dryGoods.calcium_dust).toBe(0);
    expect(terraOf(v1).calcium).toBeGreaterThan(0.5);
  });

  it('links a paludarium pool to its amphibians, but keeps land waste out of the water', () => {
    const s = vivGame();
    const p = s.tanks.P1;
    const [toad] = add(s, p, 'fire_bellied_toad');
    p.water.ammonia = 2;
    expect(animalEnv(toad, p, [toad], 10).ammonia).toBe(2);
    // A land-only frog in a vivarium never feels water chemistry.
    const v = s.tanks.V1;
    const [frog] = add(s, v, 'dart_frog');
    v.water.ammonia = 2;
    expect(animalEnv(frog, v, [frog], 10).ammonia).toBe(0);
    // Pool fish are fed fish food; the toads get crickets.
    p.water.ammonia = 0;
    add(s, p, 'zebra_danio', 4);
    s.dryGoods.crickets = 5;
    const food = s.foodUnits;
    for (const f of fishInTank(s, p.id)) f.hunger = 80;
    const r = feedTank(s, p, 'normal');
    expect(r.ok, r.message).toBe(true);
    expect(s.dryGoods.crickets).toBe(4);
    expect(s.foodUnits).toBeLessThan(food);
  });

  it('stocks land animals by enclosure space', () => {
    const s = vivGame();
    const v = s.tanks.V1;
    const one = loadRatio(v, 'dart_frog', getSpecies('dart_frog').adultSizeCm);
    expect(one).toBeGreaterThan(0);
    // Five dart frogs fit a 120L vivarium; ten do not.
    expect(one * 5).toBeLessThanOrEqual(1);
    expect(one * 10).toBeGreaterThan(1);
  });

  it('diagnoses enclosure care, previews fixes, and staff pick the chores up', () => {
    const s = vivGame();
    const v = s.tanks.V1;
    add(s, v, 'dart_frog', 3);
    terraOf(v).humidity = 55;
    terraOf(v).dish = 0.05;
    const rep = diagnoseTank(s, v);
    expect(rep.kind).toBe('land');
    expect(rep.issues.some((i) => i.id === 'terra_humidity_low')).toBe(true);
    expect(rep.issues.some((i) => i.id === 'terra_dish')).toBe(true);
    // No aquarium issues for a dry enclosure.
    expect(rep.issues.some((i) => ['ammonia', 'nitrite', 'cover', 'cycling'].includes(i.id))).toBe(false);
    const prev = previewFix(s, v.id, 'mist');
    expect(prev.result.ok).toBe(true);
    expect(prev.changes.some((c) => c.key === 'humidity')).toBe(true);
    expect(mistEnclosure(s, v).ok).toBe(true);
    expect(terraOf(v).humidity).toBeGreaterThan(70);
    terraOf(v).waste = 0.6;
    const jobs = maintenanceJobs(s, 'maintenance');
    expect(jobs.some((j) => j.tankId === 'V1')).toBe(true);
    expect(spotClean(s, v).ok).toBe(true);
    expect(terraOf(v).waste).toBeLessThan(0.1);
    // The lamp thermostat is limited and can be removed.
    expect(setHeatLamp(s, s.tanks.T1, 30).ok).toBe(true);
    expect(terraOf(s.tanks.T1).heatLamp).toBe(30);
  });

  it('only breeds land animals where it is realistic', () => {
    const s = vivGame();
    add(s, s.tanks.V2, 'whites_tree_frog', 1, 'male');
    add(s, s.tanks.V2, 'whites_tree_frog', 1, 'female');
    expect(breedingConditions(s, s.tanks.V2, 'whites_tree_frog').factor).toBe(0);
    add(s, s.tanks.V3, 'fire_bellied_toad', 1, 'male');
    add(s, s.tanks.V3, 'fire_bellied_toad', 1, 'female');
    expect(breedingConditions(s, s.tanks.V3, 'fire_bellied_toad').reasons.join(' ')).toMatch(/paludarium/);
  });

  it('saves and loads habitats and climate', () => {
    const s = vivGame();
    terraOf(s.tanks.V1).humidity = 81.5;
    terraOf(s.tanks.V1).mould = 0.2;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, 'slot1'))));
    expect(back.tanks.V1.habitat).toBe('vivarium');
    expect(back.tanks.P1.habitat).toBe('paludarium');
    expect(back.tanks.V1.terra?.humidity).toBe(81.5);
    expect(back.tanks.V1.terra?.mould).toBe(0.2);
    expect(back.tanks.T1.terra?.heatLamp).toBe(32);
  });

  it('sandbox enclosures stay healthy for a week with staff looking after them', () => {
    const s = createSandbox();
    const ids = ['V1', 'V2', 'V3', 'T1', 'T2', 'P1', 'P2'];
    for (const id of ids) s.tanks[id].forSale = false;
    const start = new Map(ids.map((id) => [id, fishInTank(s, id).length]));
    const sim = new Simulation(s);
    sim.advance(7 * 24 * 60);
    const deaths = s.log.filter((l) => /died in Tank (V|T|P)\d/.test(l.text));
    expect(deaths.map((l) => l.text)).toEqual([]);
    for (const id of ids) expect(fishInTank(s, id).length, id).toBeGreaterThanOrEqual(start.get(id)!);
    // Presets check the habitat.
    expect(() => applyPreset(s, 'Q1', 'vivarium')).toThrow(/not a vivarium/);
    expect(() => applyPreset(s, 'V1', 'planted')).toThrow(/vivarium/);
  }, 60000);
});
