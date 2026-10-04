/**
 * PlantSystem: growth of live plants, cuttings, potted plant stock and plant
 * sales. Plants are DecorItems with a `size` (1 = mature).
 */
import { idleRefusal } from './idle';
import { clamp, round } from '../core/math';
import { getDecor, getSubstrate } from '../data/catalog';
import { floatingShade } from './floating';
import { getSpecies } from '../data/species';
import { earn } from './economy';
import { fishInTank, newId } from './fish';
import type { ActionResult } from './tank';
import type { DecorItem, GameState, PottedPlant, TankState } from './types';

export type CuttingSize = 'small' | 'medium' | 'large';
export const CUTTING_AMOUNT: Record<CuttingSize, number> = { small: 0.2, medium: 0.35, large: 0.55 };
/** A plant must keep at least this much size after a cutting. */
export const MIN_REMAINING = 0.35;
/** Trade buyers pay this fraction of retail value. */
export const TRADE_RATE = 0.5;
export const OVERGROWN = 1.3;

const ok = (message: string, minutes: number): ActionResult => ({ ok: true, message, minutes });
const fail = (message: string): ActionResult => ({ ok: false, message, minutes: 0 });

export function isPlant(defId: string): boolean {
  return getDecor(defId).kind === 'plant';
}

export function sizeLabel(size: number): string {
  if (size < 0.3) return 'Cutting';
  if (size < 0.55) return 'Small';
  if (size < 0.85) return 'Medium';
  if (size < 1.1) return 'Large';
  if (size < OVERGROWN) return 'Mature';
  return 'Overgrown';
}

/**
 * Grows the plants in a tank. Growth needs light, some nitrate and health,
 * and slows as the plant approaches its maximum size.
 */
export function tickPlants(state: GameState, tank: TankState, dtHours: number): void {
  const alive = fishInTank(state, tank.id);
  const plantEaters = alive.filter((f) => !getSpecies(f.speciesId).plantSafe).length;
  // Floating plants shade the tank; nutrient-rich soils feed rooted plants.
  const lit = tank.lightOn ? 1 - floatingShade(tank) * 0.8 : 0;
  const soil = getSubstrate(tank.substrateId).plantBonus ?? 1;
  const nutrients = clamp(tank.water.nitrate / 10, 0.15, 1) * soil;
  for (const d of tank.decor) {
    const def = getDecor(d.defId);
    if (def.kind !== 'plant') continue;
    if (d.size === undefined) d.size = 1;
    const loss = plantEaters * (def.tough ? 0.002 : 0.012) * dtHours;
    const gain = 0.004 * dtHours * (tank.water.nitrate > 2 ? 1 : 0.3);
    d.health = clamp(d.health + gain - loss, 0.05, 1);
    const max = def.maxSize ?? 1.5;
    const rate = (def.growthRate ?? 0.04) / 12; // per lit hour (about 12 lit hours a day)
    const crowd = 1 - d.size / max;
    d.size = clamp(d.size + rate * lit * nutrients * d.health * Math.max(0, crowd) * dtHours * 1.4, 0.1, max);
  }
}

/** Retail value of a potted plant or a coral frag. */
export function plantValue(p: { defId: string; size: number; health: number }): number {
  const def = getDecor(p.defId);
  // Coral value climbs steeply with colony size: a frag is cheap, a large colony is not.
  if (def.kind === 'coral') return round(Math.max(1, def.cost * (0.15 + Math.min(p.size, 1.6) * 1.1) * (0.4 + 0.6 * p.health)), 2);
  return round(Math.max(0.5, def.cost * (0.35 + Math.min(p.size, 1.2) * 0.85) * (0.4 + 0.6 * p.health)), 2);
}

/** Plants and corals are living decor: they keep size and health in the stockroom. */
export function isLiving(defId: string): boolean {
  const k = getDecor(defId).kind;
  return k === 'plant' || k === 'coral';
}

export function takeCutting(state: GameState, tank: TankState, uid: string, cut: CuttingSize): ActionResult {
  if (state.idle) return idleRefusal();
  const d = tank.decor.find((x) => x.uid === uid);
  if (!d || !isPlant(d.defId)) return fail('That is not a plant.');
  const amount = CUTTING_AMOUNT[cut];
  if (d.size - amount < MIN_REMAINING) return fail(`Too small for a ${cut} cutting. Let it grow first.`);
  d.size = round(d.size - amount, 3);
  const pot: PottedPlant = { uid: newId(state, 'pp'), defId: d.defId, size: amount, health: clamp(d.health * 0.95, 0.3, 1), reservedBy: null };
  state.storage.plants.push(pot);
  const def = getDecor(d.defId);
  return ok(`Potted a ${cut} ${def.name} cutting (worth about £${plantValue(pot).toFixed(2)}).`, 6);
}

/** Cuts an overgrown plant back to mature size without keeping the trimmings. */
export function trimPlant(_state: GameState, tank: TankState, uid: string): ActionResult {
  if (_state.idle) return idleRefusal();
  const d = tank.decor.find((x) => x.uid === uid);
  if (!d || !isPlant(d.defId)) return fail('That is not a plant.');
  if (d.size <= 1) return fail('This plant does not need trimming.');
  d.size = 1;
  return ok(`Trimmed the ${getDecor(d.defId).name}.`, 4);
}

/** Moves a decor item from a tank into the stockroom. */
export function removeToStorage(state: GameState, tank: TankState, uid: string): ActionResult {
  if (state.idle) return idleRefusal();
  const i = tank.decor.findIndex((x) => x.uid === uid);
  if (i < 0) return fail('Nothing to remove.');
  const d = tank.decor[i];
  tank.decor.splice(i, 1);
  const def = getDecor(d.defId);
  if (isLiving(d.defId)) {
    state.storage.plants.push({ uid: newId(state, 'pp'), defId: d.defId, size: d.size, health: d.health, reservedBy: null });
  } else {
    state.storage.decor[d.defId] = (state.storage.decor[d.defId] ?? 0) + 1;
  }
  return ok(`${def.name} moved to the stockroom.`, 3);
}

function placeItem(state: GameState, tank: TankState, item: Omit<DecorItem, 'uid'>): DecorItem {
  const d: DecorItem = { uid: newId(state, 'd'), ...item };
  tank.decor.push(d);
  for (const f of fishInTank(state, tank.id)) f.shock = Math.min(60, f.shock + 3);
  return d;
}

export const MAX_DECOR = 16;

/**
 * Why a decor item may not go in this tank (null when it may): marine-only
 * items, plants and wood in saltwater, corals outside marine tanks, and
 * catalogue items whose floor is not open yet (`buying`).
 */
export function decorRefusal(state: GameState, tank: TankState, defId: string, buying: boolean): string | null {
  const def = getDecor(defId);
  if (def.marineOnly && tank.waterType !== 'marine') return `${def.name} is for marine tanks.`;
  if (tank.waterType === 'marine' && (def.kind === 'plant' || def.kind === 'wood')) return `${def.name} does not belong in a marine tank.`;
  if (buying && (def.level ?? 1) > state.shopLevel) return `${def.name} is sold once the shop reaches level ${def.level}.`;
  if (def.land && !tank.habitat) return `${def.name} is for vivariums, terrariums and paludariums.`;
  if (!def.land && def.kind === 'plant' && (tank.habitat === 'vivarium' || tank.habitat === 'terrarium')) return `${def.name} is an aquatic plant: it would dry out in a ${tank.habitat}.`;
  return null;
}

export function plantFromStorage(state: GameState, tank: TankState, potUid: string, x: number, layer: 0 | 1 | 2): ActionResult {
  if (state.idle) return idleRefusal();
  if (tank.decor.length >= MAX_DECOR) return fail('This tank is full of decor.');
  const i = state.storage.plants.findIndex((p) => p.uid === potUid && !p.reservedBy);
  if (i < 0) return fail('That plant is no longer in stock.');
  const p = state.storage.plants[i];
  const why = decorRefusal(state, tank, p.defId, false);
  if (why) return fail(why);
  state.storage.plants.splice(i, 1);
  placeItem(state, tank, { defId: p.defId, x: clamp(x, 0, 1), layer, flip: x > 0.5, health: p.health, size: p.size });
  return ok(`${getDecor(p.defId).kind === 'coral' ? 'Placed' : 'Planted'} the ${getDecor(p.defId).name}.`, 5);
}

export function placeDecorFromStorage(state: GameState, tank: TankState, defId: string, x: number, layer: 0 | 1 | 2): ActionResult {
  if (state.idle) return idleRefusal();
  if (tank.decor.length >= MAX_DECOR) return fail('This tank is full of decor.');
  if ((state.storage.decor[defId] ?? 0) < 1) return fail('None left in the stockroom.');
  const why = decorRefusal(state, tank, defId, false);
  if (why) return fail(why);
  state.storage.decor[defId] -= 1;
  if (state.storage.decor[defId] <= 0) delete state.storage.decor[defId];
  placeItem(state, tank, { defId, x: clamp(x, 0, 1), layer, flip: x > 0.5, health: 1, size: 1 });
  return ok(`Placed ${getDecor(defId).name} from the stockroom.`, 5);
}

/** Sells potted plants to the trade buyer at a discount (always available). */
export function sellPlantsToTrade(state: GameState, uids: string[]): ActionResult {
  if (state.idle) return idleRefusal();
  let total = 0;
  let n = 0;
  for (const uid of uids) {
    const i = state.storage.plants.findIndex((p) => p.uid === uid && !p.reservedBy);
    if (i < 0) continue;
    total += plantValue(state.storage.plants[i]) * TRADE_RATE;
    state.storage.plants.splice(i, 1);
    n++;
  }
  if (!n) return fail('No plants to sell.');
  earn(state, round(total, 2), `${n} plant(s) to trade`);
  return ok(`Sold ${n} plant${n > 1 ? 's' : ''} to the trade buyer for £${total.toFixed(2)}.`, 2);
}

export function sellStoredDecor(state: GameState, defId: string): ActionResult {
  if (state.idle) return idleRefusal();
  if ((state.storage.decor[defId] ?? 0) < 1) return fail('None in the stockroom.');
  const def = getDecor(defId);
  state.storage.decor[defId] -= 1;
  if (state.storage.decor[defId] <= 0) delete state.storage.decor[defId];
  const refund = round(def.cost * 0.4, 2);
  earn(state, refund, `Resold ${def.name}`);
  return ok(`Sold the ${def.name} second-hand for £${refund.toFixed(2)}.`, 1);
}

/** Potted plants for sale on the shelf (coral frags live on the frag rack instead). */
export function availablePlants(state: GameState): PottedPlant[] {
  return state.storage.plants.filter((p) => !p.reservedBy && getDecor(p.defId).kind === 'plant');
}
