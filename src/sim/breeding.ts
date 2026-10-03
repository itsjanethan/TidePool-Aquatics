/**
 * BreedingSystem: method-specific spawning, pregnancies, egg broods, fry and
 * fry predation. Driven by species breeding data; no per-species code.
 *
 * Methods (SpeciesDef.breeding.method):
 * - livebearer: females become pregnant and later give birth to free-swimming fry.
 * - egg_scatterer: a pair scatters eggs; adults eat many unless plants hide them.
 * - adhesive_eggs: eggs stuck to glass/plants, usually after a cool water change.
 * - cave_spawner: needs a cave; the male guards the eggs, so survival is high.
 */
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { getSpecies } from '../data/species';
import { summarizeAquascape, type AquascapeSummary } from './aquascape';
import { stockingRatio } from './compat';
import { createFish, displayName, fishInTank, isMature, newId } from './fish';
import { inherit, inheritedStrain, morphFromGenes } from './genetics';
import { seasonOf } from './time';
import type { FishEntity, GameState, TankState } from './types';

/** Hard cap on fish per tank so populations and performance stay sane. */
export const MAX_FISH_PER_TANK = 70;
/** Most fry that survive hatching from one egg brood. */
export const MAX_SURVIVORS_PER_BROOD = 24;

export interface BreedingReport {
  speciesId: string;
  males: number;
  females: number;
  /** Mature, healthy, conditioned adults ready to breed. */
  readyMales: number;
  readyFemales: number;
  /** 0 = will not breed, 1 = ideal. */
  factor: number;
  /** Plain-language problems, most important first. */
  reasons: string[];
  /** Plain-language positives (for the breeding screen). */
  good: string[];
}

export function isFry(f: FishEntity): boolean {
  return f.sizeCm / f.adultSizeCm < 0.3;
}

function ready(f: FishEntity): boolean {
  return f.alive && isMature(f) && f.breedingReadiness >= 0.5 && f.health > 65 && f.stress < 50 && f.hunger < 65 && !f.pregnancy;
}

/** Evaluates how well a species in a tank can breed right now, and why not. */
export function breedingConditions(state: GameState, tank: TankState, speciesId: string, scape?: AquascapeSummary): BreedingReport {
  const sp = getSpecies(speciesId);
  const b = sp.breeding;
  const all = fishInTank(state, tank.id);
  const mine = all.filter((f) => f.speciesId === speciesId);
  const adults = mine.filter((f) => isMature(f));
  const males = adults.filter((f) => f.sex === 'male');
  const females = adults.filter((f) => f.sex === 'female');
  const report: BreedingReport = {
    speciesId,
    males: males.length,
    females: females.length,
    readyMales: males.filter(ready).length,
    readyFemales: females.filter(ready).length,
    factor: 1,
    reasons: [],
    good: [],
  };
  const fail = (r: string) => {
    report.reasons.push(r);
    report.factor = 0;
  };
  const weaken = (r: string, k: number) => {
    report.reasons.push(r);
    report.factor *= k;
  };
  if (!males.length || !females.length) fail(!adults.length ? 'No adults yet. Young fish need time to mature.' : `Needs a mature ${!males.length ? 'male' : 'female'}.`);
  else if (!report.readyMales || !report.readyFemales) weaken('Adults are not in breeding condition yet: they need good food, health and calm.', 0.15);
  else report.good.push(`${report.readyMales} male(s) and ${report.readyFemales} female(s) in condition.`);

  const w = tank.water;
  if (w.temperature < sp.temperature.min || w.temperature > sp.temperature.max) fail(`Temperature ${w.temperature.toFixed(1)}°C is outside ${sp.temperature.min}-${sp.temperature.max}°C.`);
  if (w.ph < sp.ph.min - 0.2 || w.ph > sp.ph.max + 0.2) weaken(`pH ${w.ph.toFixed(1)} is not ideal (${sp.ph.min}-${sp.ph.max}).`, 0.4);
  if (w.ammonia > 0.25 || w.nitrite > 0.25) weaken('Poor water quality is putting them off.', 0.3);

  const sc = scape ?? summarizeAquascape(tank);
  for (const need of b.needs ?? []) {
    if (need === 'soft_water' && (w.gh > 6 || w.ph > 7.1)) fail('Needs soft, slightly acidic water to spawn (hardness 6 or less, pH 7 or less).');
    if (need === 'cave' && sc.caveSlots === 0) fail('Needs a cave to spawn in.');
    if (need === 'plants' && sc.plants === 0) weaken('Prefers plants to spawn among.', 0.3);
  }
  if (b.trigger === 'water_change') {
    const last = tank.lastMaintenance.waterChange ?? -Infinity;
    if (state.minute - last > 24 * 60) weaken('Often spawns the day after a cool water change.', 0.2);
    else report.good.push('A recent water change has triggered spawning behaviour.');
  }
  if (b.trigger === 'spring') {
    if (seasonOf(state.minute) !== 'Spring') fail('Spawns in spring, as the water warms.');
    else if (w.temperature < 17 || w.temperature > 23) weaken('Spring spawning needs water around 17-23°C.', 0.3);
  }
  const ratio = stockingRatio(tank, all);
  if (ratio > 1.2) weaken('The tank is too crowded.', 0.15);
  else if (ratio > 1) weaken('The tank is getting crowded.', 0.5);
  if (all.length >= MAX_FISH_PER_TANK) fail('The tank is full.');
  return report;
}

export interface BreedingContext {
  log(text: string, kind: 'info' | 'good' | 'warn' | 'bad'): void;
}

const day = (state: GameState) => Math.floor(state.minute / 1440) + 1;

/** Creates fry from two parents into a tank. */
export function birthFry(state: GameState, rng: Rng, mother: FishEntity, father: FishEntity, tank: TankState, count: number): FishEntity[] {
  const sp = getSpecies(mother.speciesId);
  const out: FishEntity[] = [];
  const room = MAX_FISH_PER_TANK - fishInTank(state, tank.id).length;
  const n = Math.max(0, Math.min(count, room));
  for (let i = 0; i < n; i++) {
    const { genes } = inherit(sp.id, mother.genes, father.genes, rng);
    const gen = Math.max(mother.generation, father.generation) + 1;
    const childMorph = morphFromGenes(sp.id, genes.loci) ?? mother.morphId;
    const fry = createFish(state, rng, {
      speciesId: sp.id,
      morphId: childMorph,
      genes,
      ageDays: 0,
      sizeFraction: sp.birthSizeCm / sp.adultSizeCm,
      origin: 'bred',
      originDetail: `Bred in ${tank.name}`,
      tankId: tank.id,
      generation: gen,
      motherId: mother.id,
      fatherId: father.id,
      strainId: inheritedStrain(state, mother, father, childMorph, gen),
    });
    fry.hunger = 20;
    fry.health = 95;
    out.push(fry);
  }
  mother.offspringCount += n;
  father.offspringCount += n;
  state.stats.fishBred += n;
  return out;
}

function pickPair(rng: Rng, fish: FishEntity[]): [FishEntity, FishEntity] | null {
  const females = fish.filter((f) => f.sex === 'female' && ready(f));
  const males = fish.filter((f) => f.sex === 'male' && ready(f));
  if (!females.length || !males.length) return null;
  return [rng.pick(females), rng.pick(males)];
}

/**
 * Advances breeding in one tank by dtHours: pregnancies, egg broods, new
 * spawns and fry predation. Call after the tank's normal tick.
 */
export function tickBreeding(state: GameState, tank: TankState, dtHours: number, rng: Rng, ctx: BreedingContext): void {
  const dtDays = dtHours / 24;
  const alive = fishInTank(state, tank.id);
  if (!alive.length && !(tank.broods ?? []).length) return;
  const scape = summarizeAquascape(tank);

  // Pregnancies.
  for (const f of alive) {
    if (!f.pregnancy) continue;
    f.pregnancy.daysRemaining -= dtDays;
    if (f.pregnancy.daysRemaining <= 0) {
      const father = (f.pregnancy.fatherId && state.fish[f.pregnancy.fatherId]) || f;
      const born = birthFry(state, rng, f, father, tank, f.pregnancy.fryCount);
      f.pregnancy = null;
      f.breedingReadiness = 0;
      if (born.length) ctx.log(`${born.length} ${getSpecies(f.speciesId).commonName} fry born in ${tank.name}!`, 'good');
    }
  }

  // Egg broods hatch.
  const broods = (tank.broods ??= []);
  for (let i = broods.length - 1; i >= 0; i--) {
    const br = broods[i];
    br.daysLeft -= dtDays;
    if (br.daysLeft > 0) continue;
    broods.splice(i, 1);
    const sp = getSpecies(br.speciesId);
    const mother = state.fish[br.motherId];
    const father = state.fish[br.fatherId];
    if (!mother || !father) continue;
    const adultsPresent = alive.filter((f) => !isFry(f)).length;
    const pressure = Math.min(1, adultsPresent / 6);
    const coverShield = Math.min(0.8, scape.cover * 1.5);
    const w = tank.water;
    const waterOk = w.ammonia > 0.3 || w.nitrite > 0.3 ? 0.4 : 1;
    const survival = clamp((0.45 * (1 - sp.breeding.eggPredation * pressure * (1 - coverShield)) + sp.breeding.parentalCare * 0.4) * waterOk, 0.02, 0.9);
    const survivors = Math.min(MAX_SURVIVORS_PER_BROOD, Math.round(br.count * survival * rng.range(0.7, 1.1)));
    const born = birthFry(state, rng, mother, father, tank, survivors);
    ctx.log(
      born.length
        ? `${born.length} ${sp.commonName} fry hatched in ${tank.name} (from about ${br.count} eggs).`
        : `The ${sp.commonName} eggs in ${tank.name} did not survive. More plant cover or a separate tank would help.`,
      born.length ? 'good' : 'warn',
    );
  }

  // New spawns, at most one check per species per tick.
  const species = [...new Set(alive.map((f) => f.speciesId))];
  for (const sid of species) {
    const sp = getSpecies(sid);
    const rep = breedingConditions(state, tank, sid, scape);
    if (rep.factor <= 0 || !rep.readyFemales || !rep.readyMales) continue;
    const mine = alive.filter((f) => f.speciesId === sid);
    if (sp.breeding.method === 'livebearer') {
      for (const female of mine.filter((f) => f.sex === 'female' && ready(f))) {
        if (!rng.chance((0.3 * rep.factor * dtHours) / 24)) continue;
        const male = rng.pick(mine.filter((f) => f.sex === 'male' && ready(f)));
        const sizeK = clamp(female.sizeCm / female.adultSizeCm, 0.6, 1.1);
        female.pregnancy = {
          daysRemaining: sp.breeding.incubationDays * rng.range(0.85, 1.15),
          fryCount: Math.max(1, Math.round(rng.range(sp.breeding.clutch[0], sp.breeding.clutch[1]) * sizeK)),
          fatherId: male.id,
        };
        male.breedingReadiness = 0.2;
      }
    } else {
      const chance = (0.25 * rep.factor * (1 - sp.breeding.difficulty * 0.5) * dtHours) / 24;
      if (!rng.chance(chance)) continue;
      const pair = pickPair(rng, mine);
      if (!pair) continue;
      const [mother, father] = pair;
      const count = rng.int(sp.breeding.clutch[0], sp.breeding.clutch[1]);
      broods.push({ id: newId(state, 'b'), speciesId: sid, motherId: mother.id, fatherId: father.id, count, daysLeft: sp.breeding.incubationDays, laidDay: day(state) });
      mother.breedingReadiness = 0;
      father.breedingReadiness = 0;
      const where = sp.breeding.method === 'cave_spawner' ? 'in a cave' : sp.breeding.method === 'adhesive_eggs' ? 'on the glass' : 'among the plants';
      ctx.log(`${displayName(mother)} spawned ${where} in ${tank.name} (about ${count} eggs).`, 'info');
    }
  }

  // Fry predation: bigger fish eat small fry unless there is cover.
  const fry = alive.filter((f) => isFry(f) && f.sizeCm < 1.8);
  if (fry.length) {
    const coverShield = Math.min(0.85, scape.cover * 1.4);
    for (const f of fry) {
      let pressure = 0;
      for (const p of alive) {
        if (p === f || isFry(p) || p.sizeCm < f.sizeCm * 2.5) continue;
        pressure += getSpecies(p.speciesId).breeding.eggPredation;
      }
      pressure = Math.min(1, pressure / 4);
      const risk = 0.012 * pressure * (1 - coverShield) * dtHours;
      if (risk > 0 && rng.chance(risk)) {
        delete state.fish[f.id];
        state.stats.fryEaten = (state.stats.fryEaten ?? 0) + 1;
      }
    }
  }
}

/** Life stage label for the fish card. */
export function lifeStage(f: FishEntity): string {
  const sp = getSpecies(f.speciesId);
  if (isFry(f)) return 'Fry';
  if (!isMature(f)) return 'Juvenile';
  if (f.ageDays > sp.lifespanDays * 0.8) return 'Elderly';
  return 'Adult';
}
