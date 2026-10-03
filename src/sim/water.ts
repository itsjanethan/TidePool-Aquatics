/**
 * WaterSystem: simplified nitrogen cycle, temperature, pH, oxygen and
 * cloudiness. All concentrations in ppm (mg/L). See GAME_DESIGN.md "Water".
 */
import { clamp, clamp01, smooth } from '../core/math';
import { getFilter, getHeater } from '../data/catalog';
import type { AquascapeSummary } from './aquascape';
import type { TankState, WaterState } from './types';

export const TAP_WATER = { ph: 7.5, gh: 10 };
/** Nitrate ppm produced per ppm ammonia fully processed (N mass ratio, simplified). */
export const NITRATE_PER_AMMONIA = 2.7;
/** Detritus mg/L produced per uneaten food unit per litre. */
export const DETRITUS_PER_FOOD_UNIT = 1.4;
/** Ammonia mg excreted per food unit eaten. */
export const AMMONIA_PER_FOOD_EATEN = 0.12;
/** Minimum bacterial maturity (there are always a few bacteria). */
export const MIN_BACTERIA = 0.02;

export function freshWater(temperature: number): WaterState {
  return {
    temperature,
    ph: TAP_WATER.ph,
    gh: TAP_WATER.gh,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    oxygen: 8,
    aob: MIN_BACTERIA,
    nob: MIN_BACTERIA,
    detritus: 0,
    cloudiness: 0,
  };
}

export function oxygenSaturation(tempC: number): number {
  return 14.6 - 0.39 * tempC + 0.007 * tempC * tempC;
}

/** Maximum ammonia (mg/hour) the filter can process when fully mature. */
export function bioCapacityMax(tank: TankState): number {
  const filter = getFilter(tank.filterId);
  const conditionFactor = 0.35 + 0.65 * tank.filterCondition;
  return filter.capacity * conditionFactor + tank.litres * 0.004;
}

export interface WaterInputs {
  /** Ammonia mg/hour excreted by fish. */
  fishAmmoniaPerHour: number;
  /** Oxygen demand (mg/L/hour equivalent) from livestock. */
  oxygenDemand: number;
  ambient: number;
  scape: AquascapeSummary;
  /** Number of algae-grazing fish. */
  grazers: number;
  daylight: boolean;
}

/** Cycling status for UI. */
export function cycleStatus(w: WaterState): 'uncycled' | 'cycling' | 'cycled' {
  if (w.aob >= 0.13 && w.nob >= 0.13 && w.ammonia < 0.1 && w.nitrite < 0.1) return 'cycled';
  if (w.aob > 0.04 || w.nitrite > 0.05 || w.ammonia > 0.05) return 'cycling';
  return 'uncycled';
}

/**
 * Advances water chemistry by dtHours. Mutates tank.water, tank.algae,
 * tank.glassDirt and tank.filterCondition. Call with dtHours <= 1.
 */
export function tickWater(tank: TankState, inp: WaterInputs, dtHours: number): void {
  const w = tank.water;
  const dtDays = dtHours / 24;
  const L = tank.litres;
  const filter = getFilter(tank.filterId);

  // Temperature: heater holds setpoint if working and ambient is below it.
  let targetT = inp.ambient;
  if (tank.heaterId && !tank.heaterBroken) {
    const heater = getHeater(tank.heaterId);
    const maxLift = (heater.watts / L) * 10; // simple: ~1W per litre holds ~10C above room
    targetT = Math.max(inp.ambient, Math.min(tank.heaterSetpoint, inp.ambient + maxLift));
  }
  w.temperature = smooth(w.temperature, targetT, 0.25, dtHours);

  // Uneaten food rots into detritus.
  if (tank.food > 0) {
    const rotted = tank.food * (1 - Math.exp(-0.25 * dtHours));
    tank.food -= rotted;
    if (tank.food < 0.01) tank.food = 0;
    w.detritus += (rotted * DETRITUS_PER_FOOD_UNIT) / L;
  }

  // Detritus mineralises to ammonia; mechanical filtration traps some.
  const mineral = w.detritus * (1 - Math.exp(-0.08 * dtHours));
  w.detritus -= mineral;
  w.ammonia += mineral * 0.35;

  // Fish excretion.
  w.ammonia += (inp.fishAmmoniaPerHour * dtHours) / L;

  // Nitrification.
  const capMax = bioCapacityMax(tank); // mg/hour
  const aobCap = (capMax * w.aob * dtHours) / L; // ppm this step
  const toNitrite = Math.min(w.ammonia, aobCap);
  w.ammonia -= toNitrite;
  w.nitrite += toNitrite;
  const nobCap = (capMax * w.nob * dtHours) / L;
  const toNitrate = Math.min(w.nitrite, nobCap);
  w.nitrite -= toNitrate;
  w.nitrate += toNitrate * NITRATE_PER_AMMONIA;

  // Plants consume ammonia and nitrate.
  // Plant uptake values are ppm/day in a 20L reference volume.
  const plantUptakePpm = (inp.scape.nutrientUptake * dtDays * 20) / L;
  const ammTaken = Math.min(w.ammonia, plantUptakePpm * 0.25);
  w.ammonia -= ammTaken;
  w.nitrate = Math.max(0, w.nitrate - (plantUptakePpm - ammTaken));

  // Bacterial growth: grows toward what the bioload needs, slowly decays when starved.
  const production = inp.fishAmmoniaPerHour + (mineral * 0.35 * L) / Math.max(dtHours, 1e-6);
  const desired = clamp(1.6 * (production / Math.max(0.1, capMax)) + 0.12, 0.12, 1);
  const growthR = 0.95; // per day
  if (w.aob < desired && w.ammonia > 0.01) {
    w.aob += growthR * w.aob * (1 - w.aob) * dtDays * clamp(w.ammonia / 0.25, 0.3, 1);
  } else if (w.aob > desired + 0.05) {
    w.aob -= 0.03 * (w.aob - desired) * dtDays;
  }
  if (w.nob < desired && w.nitrite > 0.01) {
    w.nob += growthR * 0.75 * w.nob * (1 - w.nob) * dtDays * clamp(w.nitrite / 0.25, 0.3, 1);
  } else if (w.nob > desired + 0.05) {
    w.nob -= 0.03 * (w.nob - desired) * dtDays;
  }
  w.aob = clamp(w.aob, MIN_BACTERIA, 1);
  w.nob = clamp(w.nob, MIN_BACTERIA, 1);

  // pH drifts with nitrate (acid) and decor buffers; hardness with limestone.
  const phTarget = clamp(TAP_WATER.ph - w.nitrate * 0.012 + inp.scape.phEffect, 5.5, 8.8);
  w.ph = smooth(w.ph, phTarget, 0.2, dtDays);
  const ghTarget = TAP_WATER.gh + Math.max(0, inp.scape.phEffect) * 12;
  w.gh = smooth(w.gh, ghTarget, 0.1, dtDays);

  // Oxygen.
  const aeration = filter.aeration * (0.4 + 0.6 * tank.filterCondition) + (tank.airStone ? 0.25 : 0);
  const photosynthesis = inp.daylight ? Math.min(0.12, inp.scape.plants * 0.015) : -Math.min(0.05, inp.scape.plants * 0.005);
  const sat = oxygenSaturation(w.temperature);
  const o2Target = clamp(sat * (0.62 + aeration + photosynthesis) - inp.oxygenDemand, 1, sat * 1.05);
  w.oxygen = smooth(w.oxygen, o2Target, 1.5, dtHours);

  // Cloudiness: bacterial bloom and suspended detritus vs mechanical filtration.
  const bloom = w.aob < 0.45 && w.ammonia > 0.3 ? 0.25 : 0;
  const cloudIn = (w.detritus * 0.06 + bloom) * dtDays;
  const cloudOut = w.cloudiness * filter.mechanical * (0.3 + 0.7 * tank.filterCondition) * 0.8 * dtDays;
  w.cloudiness = clamp01(w.cloudiness + cloudIn - cloudOut);

  // Algae and glass.
  const lit = inp.daylight && tank.lightOn;
  const nutrients = Math.min(1.6, w.nitrate / 25 + 0.25);
  const competition = Math.min(0.8, inp.scape.nutrientUptake * 0.12);
  const growthPerHour = lit ? (0.03 * nutrients * (1 - competition) * (1 - inp.scape.shade * 0.6)) / 10 : 0;
  const grazingPerHour = (inp.grazers * 0.012 * (0.5 + tank.algae)) / 24;
  tank.algae = clamp01(tank.algae + (growthPerHour - grazingPerHour) * dtHours);
  tank.glassDirt = clamp01(tank.glassDirt + (0.035 + tank.algae * 0.04) * dtDays);

  // Filter clogs over time, faster with detritus.
  tank.filterCondition = clamp01(tank.filterCondition - (0.018 + w.detritus * 0.01) * dtDays);

  w.ammonia = Math.max(0, w.ammonia);
  w.nitrite = Math.max(0, w.nitrite);
  w.nitrate = Math.max(0, w.nitrate);
  w.detritus = Math.max(0, w.detritus);
}

/** Performs a water change of `fraction` (0..1) with temperature-matched, conditioned tap water. */
export function waterChange(tank: TankState, fraction: number): void {
  const w = tank.water;
  const f = clamp01(fraction);
  w.ammonia *= 1 - f;
  w.nitrite *= 1 - f;
  w.nitrate *= 1 - f;
  w.detritus *= 1 - f * 0.6;
  w.cloudiness *= 1 - f * 0.6;
  w.ph = w.ph * (1 - f) + TAP_WATER.ph * f;
  w.gh = w.gh * (1 - f) + TAP_WATER.gh * f;
  w.temperature -= f * 0.8; // slight cooling
  tank.food *= 1 - f;
}

/** Health rating 0..100 used by HUD and reputation. */
export function waterQualityScore(w: WaterState): number {
  let s = 100;
  s -= Math.min(50, w.ammonia * 80);
  s -= Math.min(50, w.nitrite * 80);
  s -= Math.max(0, w.nitrate - 20) * 0.6;
  s -= w.oxygen < 5.5 ? (5.5 - w.oxygen) * 15 : 0;
  s -= w.cloudiness * 20;
  return clamp(s, 0, 100);
}
