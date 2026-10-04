/**
 * Compatibility, stocking and stress rules. Data driven via species fields
 * and tags so new species need no code changes.
 */
import { clamp } from '../core/math';
import { getFilter } from '../data/catalog';
import { getSpecies } from '../data/species';
import type { SpeciesDef } from '../data/speciesTypes';
import type { AquascapeSummary } from './aquascape';
import { coverPercent, habitatOf, tankNeeds } from './habitat';
import { getMorph } from './fish';
import { canEat, CLEANER_RELIEF, hasCleaner, isInvert, predationWarning } from './inverts';
import { habitatRefusal, isEnclosure, isLandAnimal, landSpace, landVolume, terraIssues } from './terrarium';
import type { FishEntity, TankState } from './types';

/** Stocking capacity in "effective cm" of fish. */
export function stockingCapacity(tank: TankState): number {
  const filter = getFilter(tank.filterId);
  const filterFactor = 0.85 + 0.15 * Math.min(2, filter.ratedLitres / tank.litres);
  return tank.litres * 0.8 * filterFactor;
}

export function fishLoad(f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  return f.sizeCm * Math.sqrt(sp.wasteFactor);
}

/**
 * Share of a tank's capacity one animal of this size uses (1 = full).
 * Water animals load the filter; land animals take enclosure space
 * (litres per adult, see data/terra.ts).
 */
export function loadRatio(tank: TankState, speciesId: string, sizeCm: number): number {
  const sp = getSpecies(speciesId);
  if (isLandAnimal(sp) && isEnclosure(tank)) return landSpace(sp, sizeCm) / landVolume(tank);
  return (sizeCm * Math.sqrt(sp.wasteFactor)) / stockingCapacity(tank);
}

/** Current stocking as a fraction of capacity (1.0 = fully stocked). */
export function stockingRatio(tank: TankState, fish: FishEntity[]): number {
  return fish.reduce((s, f) => s + (f.alive ? loadRatio(tank, f.speciesId, f.sizeCm) : 0), 0);
}

function hasLongFins(f: FishEntity, sp: SpeciesDef): boolean {
  if (sp.tags.includes('long_finned') && f.sex !== 'female') return true;
  const morph = getMorph(sp, f.morphId);
  return morph.finStyleOverride === 'long';
}

export interface StressBreakdown {
  total: number;
  reasons: Array<{ reason: string; amount: number }>;
}

/** Target stress for a fish given its tank, tank mates and aquascape. */
export function stressTarget(
  f: FishEntity,
  tank: TankState,
  mates: FishEntity[],
  scape: AquascapeSummary,
): StressBreakdown {
  const sp = getSpecies(f.speciesId);
  const w = tank.water;
  const reasons: Array<{ reason: string; amount: number }> = [];
  const add = (reason: string, amount: number) => {
    if (amount > 0.5) reasons.push({ reason, amount });
  };
  // Land animals in an enclosure: climate, hides, space and rivals (sim/terrarium.ts).
  if (isLandAnimal(sp) && isEnclosure(tank)) {
    for (const i of terraIssues(f, tank, mates)) add(i.text, i.stress);
    const coverPct = coverPercent(scape);
    const coverReq = habitatOf(sp).cover * 100;
    if (coverPct < coverReq) add('Not enough plants and cover to hide in', (0.3 + sp.behaviour.shyness) * ((coverReq - coverPct) / coverReq) * 25);
    add('Hungry', f.hunger > 60 ? (f.hunger - 60) * 0.5 : 0);
    reasons.sort((a, b) => b.amount - a.amount);
    return { total: clamp(reasons.reduce((s, r) => s + r.amount, 0) + 6, 0, 100), reasons };
  }

  // Water.
  const t = w.temperature;
  if (t < sp.temperature.min || t > sp.temperature.max) add('Wrong temperature', 25 + Math.abs(t - sp.temperature.ideal) * 3);
  else add('Temperature not ideal', Math.max(0, Math.abs(t - sp.temperature.ideal) - 2) * 4);
  if (w.ph < sp.ph.min || w.ph > sp.ph.max) add('Unsuitable pH', 12 + Math.abs(w.ph - sp.ph.ideal) * 10);
  add('Ammonia', w.ammonia > 0.1 ? 10 + w.ammonia * 30 : 0);
  add('Nitrite', w.nitrite > 0.1 ? 10 + w.nitrite * 40 : 0);
  add('High nitrate', w.nitrate > 50 ? (w.nitrate - 50) * 0.5 : 0);
  add('Low oxygen', w.oxygen < 5.5 ? (5.5 - w.oxygen) * 12 : 0);

  // Social group.
  const same = mates.filter((m) => m.alive && m.speciesId === f.speciesId).length; // includes self
  if ((sp.social === 'shoal' || sp.social === 'group') && same < sp.minGroupSize) {
    add(`Needs a group of ${sp.minGroupSize}+`, ((sp.minGroupSize - same) / sp.minGroupSize) * 40 * (sp.behaviour.schooling + 0.3));
  }

  // Space.
  if (tank.litres < sp.minTankLitres) add('Tank too small', 8 + 25 * (1 - tank.litres / sp.minTankLitres));
  if (tank.lengthCm < sp.minTankLengthCm) add('Tank too short', 8);
  const ratio = stockingRatio(tank, mates);
  if (ratio > 1) add('Overcrowded', (ratio - 1) * 45);
  // Habitat needs, measured against explicit numbers (see sim/habitat.ts).
  const hab = habitatOf(sp);
  if (hab.openSpace > 0 && scape.openSpace < hab.openSpace) add('Not enough swimming space', 4 + (hab.openSpace - scape.openSpace) * 30);
  const coverPct = coverPercent(scape);
  const coverReq = hab.cover * 100;
  if (coverPct < coverReq) add('Not enough hiding cover', (0.3 + sp.behaviour.shyness) * ((coverReq - coverPct) / coverReq) * 30);
  if (hab.caves > 0 && f.sizeCm >= f.adultSizeCm * 0.6) {
    const need = tankNeeds(mates).caveSlots;
    if (need > scape.caveSlots) add('Not enough caves', 12 * (1 - scape.caveSlots / need));
  }
  if (hab.wood && !scape.provides.has('wood')) add('Wants wood to graze', 6);
  if (hab.substrate === 'sand' && !scape.provides.has('sand')) add('Prefers sand', 6);

  // Tank mates.
  let bully = 0;
  for (const m of mates) {
    if (!m.alive || m.id === f.id) continue;
    const ms = getSpecies(m.speciesId);
    if (ms.id !== sp.id) bully += ms.aggression * (m.sizeCm / Math.max(1, f.sizeCm)) * 2;
    if (ms.behaviour.finNipper && ms.id !== sp.id && hasLongFins(f, sp)) bully += 4;
    if (ms.tags.includes('eats_tiny_fish') && f.sizeCm < m.sizeCm * 0.3) bully += 4;
    // Shrimp and snails live in fear of anything that can eat them.
    if (canEat(ms, m.sizeCm, sp, f.sizeCm)) bully += 8;
  }
  add('Harassed by tank mates', Math.min(35, bully));
  if (sp.territorial && sp.tags.includes('territorial_bottom')) {
    const rivals = mates.filter((m) => m.alive && m.id !== f.id && getSpecies(m.speciesId).territorial).length;
    if (rivals >= scape.caveSlots) add('Territory dispute', Math.min(20, (rivals + 1 - scape.caveSlots) * 8));
  }

  // Hunger.
  add('Hungry', f.hunger > 60 ? (f.hunger - 60) * 0.5 : 0);

  // A cleaner shrimp keeps parasites down, so fish (not other inverts) are calmer.
  const relief = !isInvert(sp) && hasCleaner(mates) ? CLEANER_RELIEF : 0;
  const total = clamp(reasons.reduce((s, r) => s + r.amount, 0) + 6 - relief, 0, 100);
  reasons.sort((a, b) => b.amount - a.amount);
  return { total, reasons };
}

export interface SuitabilityResult {
  score: number; // 0..1
  issues: string[];
}

/**
 * Judges whether a species suits a described tank. Used for customer advice
 * and the "add fish" warnings.
 */
export function assessSpeciesForSetup(
  speciesId: string,
  setup: { litres: number; lengthCm?: number; heated: boolean; temperature?: number; residentSpecies?: string[]; waterType?: 'freshwater' | 'brackish' | 'marine'; habitat?: TankState['habitat'] },
): SuitabilityResult {
  const sp = getSpecies(speciesId);
  const issues: string[] = [];
  let score = 1;
  const wrongHabitat = habitatRefusal(sp, { habitat: setup.habitat, name: 'this', waterType: setup.waterType });
  if (wrongHabitat) {
    issues.push(wrongHabitat);
    score -= 1;
  }
  const wt = setup.waterType ?? 'freshwater';
  if (sp.waterType !== wt && !isLandAnimal(sp) && setup.habitat !== 'vivarium' && setup.habitat !== 'terrarium') {
    issues.push(`${sp.commonName} is a ${sp.waterType} fish; this is a ${wt} tank.`);
    score -= 1;
  }
  if (isLandAnimal(sp) && setup.habitat && sp.terra) {
    // Humid planted vivarium versus dry terrarium, and a basking lamp for baskers.
    if (setup.habitat === 'terrarium' && sp.terra.humidity[0] >= 60) {
      issues.push(`${sp.commonName} needs a humid, planted vivarium (${sp.terra.humidity[0]}%+ humidity), not a dry terrarium.`);
      score -= 0.5;
    }
    if (setup.habitat === 'vivarium' && sp.terra.humidity[1] <= 55) {
      issues.push(`${sp.commonName} needs a dry terrarium (under ${sp.terra.humidity[1]}% humidity).`);
      score -= 0.5;
    }
    if (sp.terra.basking && !setup.heated) {
      issues.push(`${sp.commonName} needs a basking lamp (about ${sp.terra.basking}°C).`);
      score -= 0.3;
    }
  }
  if (isLandAnimal(sp) && setup.habitat) {
    // Enclosure space is judged by the enclosure, not water volume.
    if (setup.litres < sp.minTankLitres) {
      issues.push(`${sp.commonName} needs an enclosure of at least ${sp.minTankLitres}L.`);
      score -= 0.4;
    }
  } else if (setup.litres < sp.minTankLitres) {
    issues.push(`${sp.commonName} needs at least ${sp.minTankLitres}L.`);
    score -= setup.litres < sp.minTankLitres * 0.6 ? 0.7 : 0.4;
  }
  if (setup.lengthCm && setup.lengthCm < sp.minTankLengthCm) {
    issues.push(`${sp.commonName} needs a tank ${sp.minTankLengthCm}cm long.`);
    score -= 0.2;
  }
  const temp = setup.temperature ?? (setup.heated ? 25 : 19);
  if (!isLandAnimal(sp) && (temp < sp.temperature.min || temp > sp.temperature.max)) {
    issues.push(setup.heated ? `${sp.commonName} prefers cooler, unheated water.` : `${sp.commonName} needs a heater.`);
    score -= 0.6;
  }
  for (const other of setup.residentSpecies ?? []) {
    if (other === speciesId) continue;
    const os = getSpecies(other);
    const tOverlap = Math.min(sp.temperature.max, os.temperature.max) - Math.max(sp.temperature.min, os.temperature.min);
    if (tOverlap < 1) {
      issues.push(`${sp.commonName} and ${os.commonName} need different temperatures.`);
      score -= 0.4;
    }
    if (os.behaviour.finNipper && sp.tags.includes('long_finned')) {
      issues.push(`${os.commonName} may nip ${sp.commonName} fins.`);
      score -= 0.25;
    }
    if (sp.behaviour.finNipper && os.tags.includes('long_finned')) {
      issues.push(`${sp.commonName} may nip ${os.commonName} fins.`);
      score -= 0.25;
    }
    if ((os.tags.includes('eats_tiny_fish') && sp.adultSizeCm < 3.5) || (sp.tags.includes('eats_tiny_fish') && os.adultSizeCm < 3.5)) {
      issues.push('Big goldfish will eat very small fish.');
      score -= 0.3;
    }
    const eats = predationWarning(sp, os);
    if (eats) {
      issues.push(eats);
      score -= 0.5;
    }
  }
  return { score: clamp(score, 0, 1), issues };
}
