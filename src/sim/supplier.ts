/**
 * SupplierSystem: wholesale livestock orders with delivery delays and
 * rotating stock. Dry goods are bought instantly from the stockroom.
 */
import { round } from '../core/math';
import type { Rng } from '../core/rng';
import { FOOD_TUB, getDryGood } from '../data/catalog';
import { getSpecies, SPECIES } from '../data/species';
import { spend } from './economy';
import { createFish, newId } from './fish';
import type { GameState, SupplierOrderLine, SupplierState } from './types';

export interface SupplierDef {
  id: string;
  name: string;
  blurb: string;
  deliveryDays: number;
  costMultiplier: number;
  quality: [number, number];
  /** Probability each fish arrives already weakened. */
  doaRisk: number;
  species: string[];
  stockRange: [number, number];
  /** Minimum order value in £. */
  minOrder: number;
}

export const SUPPLIERS: SupplierDef[] = [
  {
    id: 'riverside',
    name: 'Riverside Aquatic Wholesale',
    blurb: 'Cheap, big range, next-day van. Quality is hit and miss.',
    deliveryDays: 1,
    costMultiplier: 1,
    quality: [0.3, 0.62],
    doaRisk: 0.06,
    species: SPECIES.filter((s) => s.starter).map((s) => s.id),
    stockRange: [12, 40],
    minOrder: 0,
  },
  {
    id: 'highfield',
    name: 'Highfield Fish Farm',
    blurb: 'Local breeder. Healthier, better-coloured stock at a premium. Two-day delivery.',
    deliveryDays: 2,
    costMultiplier: 1.45,
    quality: [0.5, 0.82],
    doaRisk: 0.01,
    species: ['guppy', 'endler', 'platy', 'molly', 'fancy_goldfish', 'bristlenose'],
    stockRange: [6, 18],
    minOrder: 15,
  },
];

export function getSupplier(id: string): SupplierDef {
  const s = SUPPLIERS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown supplier ${id}`);
  return s;
}

export function refreshSupplierStock(state: GameState, rng: Rng, supplierId: string, day: number): SupplierState {
  const def = getSupplier(supplierId);
  const st: SupplierState = {
    id: def.id,
    lastRefreshDay: day,
    stock: def.species.map((sid) => {
      const sp = getSpecies(sid);
      const scarce = rng.chance(0.12);
      return {
        speciesId: sid,
        available: scarce ? rng.int(0, 4) : rng.int(def.stockRange[0], def.stockRange[1]),
        unitCost: round(sp.supplierCost * def.costMultiplier * rng.range(0.9, 1.12), 2),
      };
    }),
  };
  state.suppliers[def.id] = st;
  return st;
}

/** Weekly stock rotation; call daily. */
export function maybeRefreshSuppliers(state: GameState, rng: Rng, day: number): void {
  for (const def of SUPPLIERS) {
    const st = state.suppliers[def.id];
    if (!st || day - st.lastRefreshDay >= 7) refreshSupplierStock(state, rng, def.id, day);
  }
}

export interface OrderResult {
  ok: boolean;
  message: string;
}

export function placeOrder(state: GameState, supplierId: string, lines: Array<Omit<SupplierOrderLine, 'unitCost'>>, day: number): OrderResult {
  const def = getSupplier(supplierId);
  const st = state.suppliers[supplierId];
  if (!st) return { ok: false, message: 'Supplier unavailable.' };
  const priced: SupplierOrderLine[] = [];
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const s = st.stock.find((x) => x.speciesId === l.speciesId);
    if (!s || s.available < l.quantity) return { ok: false, message: `Not enough ${getSpecies(l.speciesId).commonName} in stock.` };
    if (!state.tanks[l.tankId]) return { ok: false, message: 'Pick a tank for every line.' };
    priced.push({ ...l, unitCost: s.unitCost });
  }
  if (!priced.length) return { ok: false, message: 'The order is empty.' };
  const total = round(priced.reduce((t, l) => t + l.unitCost * l.quantity, 0), 2);
  if (total < def.minOrder) return { ok: false, message: `${def.name} has a £${def.minOrder} minimum order.` };
  if (!spend(state, total, `Order from ${def.name}`)) return { ok: false, message: 'Not enough money for this order.' };
  for (const l of priced) st.stock.find((x) => x.speciesId === l.speciesId)!.available -= l.quantity;
  state.orders.push({ id: newId(state, 'o'), supplierId, lines: priced, placedDay: day, arrivalDay: day + def.deliveryDays, total });
  return { ok: true, message: `Order placed: £${total.toFixed(2)}. Arrives ${def.deliveryDays === 1 ? 'tomorrow' : `in ${def.deliveryDays} days`} at opening.` };
}

/** Delivers due orders into their target tanks. Returns summary lines. */
export function processDeliveries(state: GameState, rng: Rng, day: number): string[] {
  const out: string[] = [];
  const remaining = [];
  for (const o of state.orders) {
    if (o.arrivalDay > day) {
      remaining.push(o);
      continue;
    }
    const def = getSupplier(o.supplierId);
    for (const l of o.lines) {
      const tankId = state.tanks[l.tankId] ? l.tankId : state.tankOrder[0];
      for (let i = 0; i < l.quantity; i++) {
        const f = createFish(state, rng, {
          speciesId: l.speciesId,
          origin: 'supplier',
          originDetail: def.name,
          tankId,
          purchaseCost: l.unitCost,
          quality: rng.range(def.quality[0], def.quality[1]),
        });
        f.shock = 40;
        f.hunger = 55;
        if (rng.chance(def.doaRisk)) f.health = rng.range(25, 55);
      }
      out.push(`${l.quantity} x ${getSpecies(l.speciesId).commonName} delivered to ${state.tanks[tankId].name}.`);
    }
  }
  state.orders = remaining;
  return out;
}

export function buyFoodTub(state: GameState): OrderResult {
  if (!spend(state, FOOD_TUB.cost, 'Fish food tub')) return { ok: false, message: 'Not enough money.' };
  state.foodUnits += FOOD_TUB.units;
  return { ok: true, message: `Bought a tub of food (+${FOOD_TUB.units} portions).` };
}

export function buyDryGood(state: GameState, id: string, qty: number): OrderResult {
  const g = getDryGood(id);
  const cost = round(g.wholesale * qty, 2);
  if (!spend(state, cost, `${qty} x ${g.name}`)) return { ok: false, message: 'Not enough money.' };
  state.dryGoods[id] = (state.dryGoods[id] ?? 0) + qty;
  return { ok: true, message: `Stocked ${qty} x ${g.name}.` };
}
