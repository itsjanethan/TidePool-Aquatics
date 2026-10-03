/**
 * FishSystem: creation, growth, hunger, health and value of individual
 * persistent fish. The tank view renders these same entities.
 */
import { clamp, clamp01, smooth } from '../core/math';
import type { Rng } from '../core/rng';
import { getSpecies } from '../data/species';
import type { ColourMorph, SpeciesDef } from '../data/speciesTypes';
import type { FishEntity, FishGenes, FishOrigin, GameState, Sex, TankState } from './types';
import { genotypeForMorph, morphFromGenes } from './genetics';

export interface CreateFishOptions {
  speciesId: string;
  morphId?: string;
  sex?: Sex;
  ageDays?: number;
  /** Size as a fraction of adult size; derived from age when omitted. */
  sizeFraction?: number;
  quality?: number;
  origin: FishOrigin;
  originDetail?: string;
  tankId: string | null;
  purchaseCost?: number;
  generation?: number;
  motherId?: string | null;
  fatherId?: string | null;
  /** Inherited genes (fry). When omitted, a genotype matching the morph is generated. */
  genes?: FishGenes;
  strainId?: string | null;
}

export function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId.toString(36)}`;
}

export function pickMorph(species: SpeciesDef, rng: Rng): ColourMorph {
  return rng.weighted(species.morphs, (m) => m.weight);
}

export function getMorph(species: SpeciesDef, morphId: string): ColourMorph {
  return species.morphs.find((m) => m.id === morphId) ?? species.morphs[0];
}

export function createFish(state: GameState, rng: Rng, opts: CreateFishOptions): FishEntity {
  const sp = getSpecies(opts.speciesId);
  let morph = opts.morphId ? getMorph(sp, opts.morphId) : pickMorph(sp, rng);
  const loci = opts.genes?.loci ?? genotypeForMorph(sp.id, morph.id, rng);
  const geneMorph = morphFromGenes(sp.id, loci);
  if (geneMorph) morph = getMorph(sp, geneMorph);
  const sex: Sex = opts.sex ?? (rng.chance(0.5) ? 'male' : 'female');
  const sizeGene = opts.genes?.size ?? clamp(1 + rng.gaussian() * 0.05, 0.85, 1.15);
  const adult = sp.adultSizeCm * sizeGene * (sex === 'female' ? sp.femaleSizeMultiplier : 1) /
    // Normalise so the species' listed adult size is the average across sexes.
    ((1 + sp.femaleSizeMultiplier) / 2);
  const ageDays = opts.ageDays ?? sp.maturityDays * rng.range(0.6, 1.2);
  const frac = opts.sizeFraction ?? clamp(0.35 + (ageDays / sp.maturityDays) * 0.45, 0.2, 0.95);
  const qualityGene = clamp01(opts.genes?.quality ?? opts.quality ?? rng.range(0.35, 0.7));
  const day = Math.floor(state.minute / 1440) + 1;
  const fish: FishEntity = {
    id: newId(state, 'f'),
    speciesId: sp.id,
    morphId: morph.id,
    sex,
    ageDays,
    sizeCm: Math.max(sp.birthSizeCm, adult * frac),
    adultSizeCm: adult,
    health: 90 + rng.range(0, 10),
    hunger: rng.range(20, 45),
    stress: 20,
    shock: 0,
    genes: { loci, quality: qualityGene, size: sizeGene },
    quality: qualityGene,
    temperament: clamp(rng.gaussian() * 0.4, -1, 1),
    disease: null,
    breedingReadiness: ageDays >= sp.maturityDays && opts.origin !== 'bred' ? rng.range(0, 0.6) : 0,
    pregnancy: null,
    generation: opts.generation ?? 0,
    parents: { motherId: opts.motherId ?? null, fatherId: opts.fatherId ?? null },
    origin: opts.origin,
    originDetail: opts.originDetail ?? '',
    purchaseCost: opts.purchaseCost ?? 0,
    tankId: opts.tankId,
    tankHistory: opts.tankId ? [opts.tankId] : [],
    offspringCount: 0,
    bornDay: Math.round(day - ageDays),
    alive: true,
    deathDay: null,
    deathCause: null,
    reservedBy: null,
    name: null,
    strainName: opts.strainId ?? null,
  };
  state.fish[fish.id] = fish;
  return fish;
}

export function fishInTank(state: GameState, tankId: string, includeDead = false): FishEntity[] {
  const out: FishEntity[] = [];
  for (const id in state.fish) {
    const f = state.fish[id];
    if (f.tankId === tankId && (includeDead || f.alive)) out.push(f);
  }
  return out;
}

/** Food units needed to take this fish from 100 hunger to 0. */
export function appetite(f: FishEntity): number {
  return Math.max(0.08, (f.sizeCm / 4) ** 1.6);
}

/** Fish eats up to `available` units. Returns units actually consumed. */
export function eat(f: FishEntity, available: number): number {
  if (!f.alive || available <= 0 || f.hunger <= 2) return 0;
  const want = (f.hunger / 100) * appetite(f);
  const take = Math.min(want, available);
  f.hunger = clamp(f.hunger - (take / appetite(f)) * 100, 0, 100);
  return take;
}

/** Sizes for UI: juvenile / young adult / adult / large. */
export function sizeLabel(f: FishEntity): string {
  const r = f.sizeCm / f.adultSizeCm;
  if (r < 0.3) return 'Fry';
  if (r < 0.45) return 'Juvenile';
  if (r < 0.75) return 'Young';
  if (r < 0.97) return 'Adult';
  return 'Full-grown';
}

export function isMature(f: FishEntity): boolean {
  return f.ageDays >= getSpecies(f.speciesId).maturityDays;
}

/** Base retail value of an individual fish (before player pricing). */
export function fishValue(f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  const morph = getMorph(sp, f.morphId);
  const r = clamp(f.sizeCm / f.adultSizeCm, 0.2, 1.05);
  const sizeFactor = 0.45 + 0.6 * r;
  const qualityFactor = 0.7 + f.quality * 0.7;
  const healthFactor = f.health > 70 ? 1 : 0.5 + (f.health / 70) * 0.5;
  // Shop-bred fish are acclimatised and healthier; named strains carry a premium
  // that grows with the line's generations (capped so values cannot run away).
  const bredFactor = f.origin === 'bred' ? 1.1 : 1;
  const strainFactor = f.strainName ? 1 + Math.min(0.4, 0.08 * f.generation) : 1;
  return sp.retailPrice * morph.priceMultiplier * sizeFactor * qualityFactor * healthFactor * bredFactor * strainFactor;
}

export function displayName(f: FishEntity): string {
  const sp = getSpecies(f.speciesId);
  const morph = getMorph(sp, f.morphId);
  return f.name ?? `${morph.name} ${sp.commonName}`;
}

export interface FishEnv {
  temperature: number;
  ph: number;
  gh: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  oxygen: number;
  litres: number;
  stressTarget: number;
}

/** Health damage per hour from the environment. Exported for tests/UI. */
export function environmentalDamage(f: FishEntity, env: FishEnv): { damage: number; causes: string[] } {
  const sp = getSpecies(f.speciesId);
  const sens = 0.5 + sp.sensitivity;
  const causes: string[] = [];
  let dmg = 0;
  const phFactor = clamp(10 ** (env.ph - 7.4), 0.3, 4);
  // Low readings are stressful (see compat.ts) but only damaging above a threshold.
  const amm = Math.max(0, env.ammonia * phFactor - 0.1) * 3 * sens;
  if (amm > 0.1) causes.push('ammonia');
  dmg += amm;
  const nit = Math.max(0, env.nitrite - 0.15) * 3 * sens;
  if (nit > 0.1) causes.push('nitrite');
  dmg += nit;
  if (env.nitrate > 40) {
    dmg += (env.nitrate - 40) * 0.04 * sens;
    causes.push('nitrate');
  }
  const t = env.temperature;
  if (t < sp.temperature.min || t > sp.temperature.max) {
    const dev = t < sp.temperature.min ? sp.temperature.min - t : t - sp.temperature.max;
    dmg += dev * 2.2 * sens;
    causes.push(t < sp.temperature.min ? 'cold' : 'heat');
  }
  if (env.ph < sp.ph.min - 0.1 || env.ph > sp.ph.max + 0.1) {
    const dev = env.ph < sp.ph.min ? sp.ph.min - env.ph : env.ph - sp.ph.max;
    dmg += dev * 3 * sens;
    causes.push('pH');
  }
  if (env.gh < sp.hardness.min - 1 || env.gh > sp.hardness.max + 2) {
    const dev = env.gh < sp.hardness.min ? sp.hardness.min - env.gh : env.gh - sp.hardness.max;
    dmg += dev * 0.15 * sens;
    causes.push('hardness');
  }
  if (env.oxygen < 4.5) {
    dmg += (4.5 - env.oxygen) * 3;
    causes.push('oxygen');
  }
  if (f.hunger > 75) {
    dmg += (f.hunger - 75) * 0.12;
    causes.push('hunger');
  }
  if (f.stress > 70) dmg += (f.stress - 70) * 0.05;
  const lifeFrac = f.ageDays / sp.lifespanDays;
  if (lifeFrac > 1) {
    dmg += (lifeFrac - 1) * 8;
    causes.push('old age');
  }
  return { damage: dmg, causes };
}

/**
 * Background per-fish update. `dtHours` may be large (dev fast-forward);
 * callers should sub-step at <= 1 hour for stability.
 */
export function tickFish(f: FishEntity, env: FishEnv, tank: TankState, dtHours: number): { died: boolean; cause: string } {
  if (!f.alive) return { died: false, cause: '' };
  const sp = getSpecies(f.speciesId);
  const dtDays = dtHours / 24;
  f.ageDays += dtDays;

  // Metabolism scales with temperature.
  const metab = clamp(0.6 + (env.temperature - 15) * 0.04, 0.5, 1.4);
  f.hunger = clamp(f.hunger + 3.2 * metab * dtHours, 0, 100);

  // Stress follows its target, shock decays.
  f.shock = Math.max(0, f.shock - 6 * dtHours);
  f.stress = clamp(smooth(f.stress, clamp(env.stressTarget + f.shock, 0, 100), 0.5, dtHours), 0, 100);

  // Health.
  const { damage, causes } = environmentalDamage(f, env);
  if (damage > 0.35) {
    f.health -= (damage - 0.2) * dtHours;
  } else {
    const recovery = 1.6 * (1 - f.stress / 150) * (f.hunger < 70 ? 1 : 0.3);
    f.health += recovery * dtHours;
  }
  f.health = clamp(f.health, 0, 100);

  // Growth (logistic toward individual adult size).
  const tempOk = env.temperature >= sp.temperature.min && env.temperature <= sp.temperature.max ? 1 : 0.3;
  const fed = f.hunger < 70 ? 1 : 0.15;
  const space = tank.litres >= sp.minTankLitres ? 1 : 0.55;
  const cond = fed * (f.health / 100) * (1 - f.stress / 220) * tempOk * space;
  f.sizeCm += sp.growthRate * (f.adultSizeCm - f.sizeCm) * cond * dtDays;

  // Breeding readiness (consumed by Milestone 2 BreedingSystem).
  if (isMature(f) && f.health > 70 && f.hunger < 60 && f.stress < 50) {
    f.breedingReadiness = clamp01(f.breedingReadiness + 0.25 * dtDays);
  } else {
    f.breedingReadiness = clamp01(f.breedingReadiness - 0.2 * dtDays);
  }

  // Quality tracks genes with a condition component.
  f.quality = clamp01(f.genes.quality * 0.85 + (f.health / 100) * 0.15 - f.stress / 1000);

  if (f.health <= 0) {
    return { died: true, cause: causes[0] ?? 'poor condition' };
  }
  return { died: false, cause: '' };
}

export function killFish(state: GameState, f: FishEntity, cause: string): void {
  f.alive = false;
  f.health = 0;
  f.deathDay = Math.floor(state.minute / 1440) + 1;
  f.deathCause = cause;
  f.reservedBy = null;
  state.stats.fishDied += 1;
  state.today.deaths += 1;
}

export function moveFish(f: FishEntity, tankId: string): void {
  f.tankId = tankId;
  if (f.tankHistory[f.tankHistory.length - 1] !== tankId) f.tankHistory.push(tankId);
  f.shock = Math.min(60, f.shock + 25);
}
