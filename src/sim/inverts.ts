/**
 * Invertebrate care rules (shrimp, snails, hermit crabs), read from species
 * tags so new inverts need no code:
 *
 * - Predation: fish tagged `eats_inverts` eat shrimp and crabs small enough
 *   to swallow (under 45% of the fish's length). Snails are safe in their
 *   shells from fish, but hermit crabs (`shell_thief`) sometimes kill snails
 *   smaller than themselves for a new shell. Cover lowers the risk.
 * - Clean-up crew: algae grazers keep algae down by body size; scavengers
 *   clear leftover food and settled waste.
 * - Cleaners pick parasites off fish, lowering fish stress.
 * - Minerals: shell builders lose shell and moulting shrimp fail moults in
 *   water softer than their range (the hardness damage in fish.ts names it).
 */
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { getSpecies } from '../data/species';
import type { SpeciesDef } from '../data/speciesTypes';
import { summarizeAquascape } from './aquascape';
import { coverPercent } from './habitat';
import { fishInTank, killFish } from './fish';
import type { FishEntity, GameState, TankState } from './types';

export function isInvert(sp: SpeciesDef): boolean {
  return sp.tags.includes('invertebrate');
}

/** Fraction of the predator's length a prey must be under to be eaten. */
export const SWALLOW_RATIO = 0.45;

/** Would a predator of this size eat a prey of this size? */
export function canEat(predator: SpeciesDef, predatorCm: number, prey: SpeciesDef, preyCm: number): boolean {
  if (predator.id === prey.id) return false;
  if (predator.tags.includes('eats_inverts') && (prey.tags.includes('shrimp') || prey.tags.includes('crab'))) return preyCm < predatorCm * SWALLOW_RATIO;
  if (predator.tags.includes('shell_thief') && prey.tags.includes('snail')) return preyCm < predatorCm * 1.1;
  return false;
}

/** Plain-language predation warning between two species at adult size (or null). */
export function predationWarning(a: SpeciesDef, b: SpeciesDef): string | null {
  for (const [pred, prey] of [[a, b], [b, a]] as const) {
    if (!canEat(pred, pred.adultSizeCm, prey, prey.adultSizeCm)) continue;
    if (pred.tags.includes('shell_thief')) return `${pred.commonName} may kill ${prey.commonName} for their shells.`;
    return `${pred.commonName} will eat ${prey.commonName}.`;
  }
  return null;
}

/** Algae-grazing strength of one animal (a pleco counts 1; small inverts much less). */
export function grazeWeight(f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  if (!sp.behaviour.grazer && !sp.tags.includes('grazer_algae')) return 0;
  if (!isInvert(sp)) return 1;
  return clamp(f.sizeCm / (sp.tags.includes('snail') ? 7 : 14), 0.03, 0.8);
}

/** Scavenging strength: how much leftover food and settled waste an animal clears. */
export function scavengeWeight(f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  return sp.tags.includes('scavenger') ? clamp(f.sizeCm / 10, 0.05, 0.6) : 0;
}

/** Hourly clean-up crew work in a tank: eats rotting leftovers and waste. Deterministic. */
export function tickCleanupCrew(tank: TankState, alive: FishEntity[], dtHours: number): void {
  const scav = alive.reduce((s, f) => s + scavengeWeight(f), 0);
  if (scav <= 0) return;
  const rate = (scav * 0.25 * 60) / Math.max(20, tank.litres);
  tank.water.detritus *= Math.exp(-rate * 0.05 * dtHours);
  tank.food = Math.max(0, tank.food - scav * 0.01 * dtHours);
}

/** True when a tank has a cleaner (fish are calmer: parasites are kept down). */
export function hasCleaner(mates: FishEntity[]): boolean {
  return mates.some((m) => m.alive && getSpecies(m.speciesId).tags.includes('cleaner'));
}

/** Stress taken off fish by a cleaner in the tank. */
export const CLEANER_RELIEF = 4;

/**
 * Predation between tank mates (random; call with the simulation's RNG).
 * Returns what was eaten for the log.
 */
export function tickPredation(state: GameState, tank: TankState, dtHours: number, rng: Rng, log: (text: string) => void): void {
  const alive = fishInTank(state, tank.id);
  const prey = alive.filter((f) => isInvert(getSpecies(f.speciesId)));
  if (!prey.length) return;
  const hunters = alive.filter((f) => {
    const t = getSpecies(f.speciesId).tags;
    return t.includes('eats_inverts') || t.includes('shell_thief');
  });
  if (!hunters.length) return;
  const cover = coverPercent(summarizeAquascape(tank)) / 100;
  for (const p of prey) {
    const psp = getSpecies(p.speciesId);
    for (const h of hunters) {
      const hsp = getSpecies(h.speciesId);
      if (!p.alive || !canEat(hsp, h.sizeCm, psp, p.sizeCm)) continue;
      const thief = hsp.tags.includes('shell_thief');
      // Hungry fish hunt harder; cover and big groups of hiding places help prey.
      const hunger = 0.4 + h.hunger / 100;
      const risk = (thief ? 0.0015 : 0.02) * hunger * (1 - Math.min(0.8, cover)) * dtHours;
      if (!rng.chance(risk)) continue;
      if (thief) {
        killFish(state, p, `killed by a ${hsp.commonName} for its shell`);
        log(`A ${hsp.commonName} killed a ${psp.commonName} in ${tank.name} to take its shell.`);
      } else {
        killFish(state, p, `eaten by a ${hsp.commonName}`);
        // Nothing is left behind to rot.
        p.tankId = null;
        h.hunger = Math.max(0, h.hunger - 25);
        log(`A ${hsp.commonName} ate a ${psp.commonName} in ${tank.name}.`);
      }
      break;
    }
  }
}
