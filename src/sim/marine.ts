/**
 * Marine water: salinity in ppt (parts per thousand), shown to players as
 * specific gravity (SG) like a hydrometer. Evaporation removes water but not
 * salt, so salinity creeps up until topped off with RO (pure) water. Marine
 * water changes need mixed salt; tap water would dilute the tank.
 */
import { clamp } from '../core/math';
import type { TankState } from './types';

export const TARGET_SALINITY = 35;
/** Comfortable band for reef fish (ppt). */
export const MARINE_SAFE: [number, number] = [32, 36.5];
/** Evaporation raises salinity this much per day without top-off. */
export const EVAPORATION_PPT_PER_DAY = 0.22;

export function isMarine(tank: TankState): boolean {
  return tank.waterType === 'marine';
}

/** ppt → specific gravity at about 25°C. */
export function specificGravity(ppt: number): number {
  return 1 + ppt * 0.000752;
}

export function sgLabel(ppt: number): string {
  return `SG ${specificGravity(ppt).toFixed(3)} (${ppt.toFixed(1)} ppt)`;
}

/** Hourly salinity drift from evaporation, plus skimmer and live-rock effects on waste. */
export function tickMarine(tank: TankState, dtHours: number, liveRock: number): void {
  if (!isMarine(tank)) return;
  const w = tank.water;
  w.salinity = (w.salinity ?? TARGET_SALINITY) + (EVAPORATION_PPT_PER_DAY * dtHours) / 24;
  if (tank.skimmer) {
    // A skimmer pulls dissolved organics out before they rot into ammonia.
    w.detritus *= Math.exp(-0.012 * dtHours);
    w.cloudiness *= Math.exp(-0.01 * dtHours);
  }
  // Marine water is buffered: pH drifts back toward 8.2, faster with live rock.
  w.ph += (8.2 - w.ph) * (1 - Math.exp(-(0.01 + liveRock * 0.004) * dtHours));
}

/** Top-off with RO water: brings evaporated salinity back toward target. */
export function topOff(tank: TankState): number {
  const w = tank.water;
  const before = w.salinity ?? TARGET_SALINITY;
  if (before > TARGET_SALINITY) w.salinity = TARGET_SALINITY + (before - TARGET_SALINITY) * 0.1;
  return before;
}

/** Salinity after a water change of `fraction` with mixed salt water (or plain water when out of salt). */
export function salinityAfterChange(current: number, fraction: number, withSalt: boolean): number {
  return clamp(current * (1 - fraction) + (withSalt ? TARGET_SALINITY : 0) * fraction, 0, 45);
}

/** Damage per hour from salinity for a fish of the given water type. */
export function salinityDamage(fishWater: 'freshwater' | 'brackish' | 'marine', salinity: number): number {
  if (fishWater === 'marine') {
    if (salinity < MARINE_SAFE[0]) return (MARINE_SAFE[0] - salinity) * 0.9;
    if (salinity > MARINE_SAFE[1]) return (salinity - MARINE_SAFE[1]) * 0.9;
    return 0;
  }
  if (fishWater === 'freshwater') return salinity > 3 ? (salinity - 3) * 1.5 : 0;
  return 0;
}
