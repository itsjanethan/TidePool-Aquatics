/**
 * FloatingPlantSystem: duckweed, frogbit and red root floaters are simulated
 * as surface coverage (0..1) per species, not as individual items. Cover
 * grows logistically with light and nitrate, competes for the shared surface,
 * shades the tank (slowing submerged plants and algae), soaks up nitrate and
 * gives fry somewhere to hide. Left alone, duckweed carpets the surface.
 */
import { idleRefusal } from './idle';
import { clamp, round } from '../core/math';
import { FLOATING, FLOATING_PORTION, getFloating } from '../data/catalog';
import { canAfford, earn, spend } from './economy';
import type { ActionResult } from './tank';
import type { GameState, TankState } from './types';

const ok = (message: string, minutes: number): ActionResult => ({ ok: true, message, minutes });
const fail = (message: string): ActionResult => ({ ok: false, message, minutes: 0 });

/** Below this a floating species has died out. */
export const MIN_COVER = 0.004;

export function floatingCover(tank: TankState): Record<string, number> {
  return (tank.floating ??= {});
}

export function totalFloating(tank: TankState): number {
  return Object.values(tank.floating ?? {}).reduce((t, c) => t + c, 0);
}

/** Fraction of light blocked by floating plants (0..0.85). */
export function floatingShade(tank: TankState): number {
  let s = 0;
  for (const [id, c] of Object.entries(tank.floating ?? {})) s += getFloating(id).shade * c;
  return clamp(s, 0, 0.85);
}

/** Cover for fry and shy fish provided by floating plants. */
export function floatingFryCover(tank: TankState): number {
  let s = 0;
  for (const [id, c] of Object.entries(tank.floating ?? {})) s += getFloating(id).cover * c;
  return s;
}

/** Surface fraction one portion covers in this tank (bigger tanks need more). */
export function portionCover(tank: TankState): number {
  return (FLOATING_PORTION * 60) / Math.max(30, tank.lengthCm);
}

/** Grows floating plants and lets them take up nitrate. */
export function tickFloating(tank: TankState, dtHours: number): void {
  const cover = tank.floating;
  if (!cover) return;
  const ids = Object.keys(cover);
  if (!ids.length) return;
  const lit = tank.lightOn ? 1 : 0.15;
  const nutrients = clamp(tank.water.nitrate / 8, 0.15, 1);
  const total = totalFloating(tank);
  let uptake = 0;
  for (const id of ids) {
    const def = getFloating(id);
    const c = cover[id];
    // Logistic growth into the free surface; a little die-back when starved or crowded.
    const grow = (def.growthRate / 24) * c * Math.max(0, 1 - total) * lit * nutrients;
    const dieBack = (0.01 / 24) * c * (nutrients < 0.15 ? 3 : 0) + (total > 1 ? (total - 1) * 0.1 : 0);
    cover[id] = clamp(c + (grow - dieBack) * dtHours, 0, 1);
    uptake += (def.uptake / 24) * c * lit * dtHours;
    if (cover[id] < MIN_COVER) delete cover[id];
  }
  tank.water.nitrate = Math.max(0, tank.water.nitrate - uptake);
}

export function addFloatingCover(tank: TankState, id: string, amount: number): void {
  const cover = floatingCover(tank);
  const room = Math.max(0, 1 - totalFloating(tank));
  cover[id] = round((cover[id] ?? 0) + Math.min(amount, room), 4);
}

/** Buys one portion straight into a tank. */
export function buyFloating(state: GameState, tank: TankState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const def = getFloating(id);
  if (totalFloating(tank) >= 0.98) return fail('The surface is already covered.');
  if (!canAfford(state, def.cost)) return fail(`You need £${def.cost.toFixed(2)}.`);
  spend(state, def.cost, def.name);
  addFloatingCover(tank, id, portionCover(tank));
  return ok(`Added a portion of ${def.name} to ${tank.name}.`, 2);
}

/** Moves one stored portion into a tank. */
export function plantFloatingFromStorage(state: GameState, tank: TankState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const store = (state.storage.floating ??= {});
  if (!store[id]) return fail('None in the stockroom.');
  if (totalFloating(tank) >= 0.98) return fail('The surface is already covered.');
  store[id] -= 1;
  if (store[id] <= 0) delete store[id];
  addFloatingCover(tank, id, portionCover(tank));
  return ok(`Floated a portion of ${getFloating(id).name} in ${tank.name}.`, 1);
}

/**
 * Scoops a fraction of a floating species out of a tank. Kept scoops go to
 * the stockroom as portions (to move to another tank or sell); otherwise
 * they are thrown away.
 */
export function scoopFloating(state: GameState, tank: TankState, id: string, fraction: number, keep: boolean): ActionResult {
  if (state.idle) return idleRefusal();
  const cover = floatingCover(tank);
  const c = cover[id] ?? 0;
  if (c < MIN_COVER) return fail('There is nothing to scoop.');
  const removed = fraction >= 1 ? c : c * fraction;
  cover[id] = round(c - removed, 4);
  if (cover[id] < MIN_COVER) delete cover[id];
  const def = getFloating(id);
  if (!keep) return ok(`Scooped out ${Math.round(removed * 100)}% cover of ${def.name} and binned it.`, 3);
  const portions = Math.max(1, Math.floor(removed / portionCover(tank)));
  const store = (state.storage.floating ??= {});
  store[id] = (store[id] ?? 0) + portions;
  return ok(`Scooped ${portions} portion${portions === 1 ? '' : 's'} of ${def.name} into the stockroom.`, 4);
}

/** Sells stored portions to the trade buyer. */
export function sellFloatingToTrade(state: GameState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const store = state.storage.floating ?? {};
  const n = store[id] ?? 0;
  if (!n) return fail('None in the stockroom.');
  const def = getFloating(id);
  const total = round(n * def.tradeValue, 2);
  delete store[id];
  earn(state, total, `${n} portions of ${def.name} (trade)`);
  state.stats.plantsSold = (state.stats.plantsSold ?? 0) + n;
  return ok(`Sold ${n} portions of ${def.name} to the trade buyer for £${total.toFixed(2)}.`, 2);
}

export function floatingIds(): string[] {
  return FLOATING.map((f) => f.id);
}

/** Plain-language coverage label. */
export function coverLabel(c: number): string {
  if (c < 0.1) return 'A few leaves';
  if (c < 0.35) return 'Patches';
  if (c < 0.65) return 'Half covered';
  if (c < 0.9) return 'Mostly covered';
  return 'Carpeted';
}
