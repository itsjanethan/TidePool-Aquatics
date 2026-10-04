/**
 * SupplierSystem: wholesale livestock orders with delivery delays and
 * rotating stock. Dry goods are bought instantly from the stockroom.
 */
import { idleRefusal } from './idle';
import { round } from '../core/math';
import type { Rng } from '../core/rng';
import { FOOD_TUB, getDryGood } from '../data/catalog';
import { getSpecies, SPECIES } from '../data/species';
import { earn, spend } from './economy';
import { createFish, newId } from './fish';
import { habitatRefusal, isLandAnimal } from './terrarium';
import type { GameState, SupplierOrder, SupplierOrderLine, SupplierState } from './types';

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
  /** Shop level needed before this supplier will deal with you (default 1). */
  level?: number;
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
  {
    id: 'northern',
    name: 'Northern Temperate Fisheries',
    blurb: 'Coldwater and temperate specialists. Hardy, unheated species. Two-day delivery.',
    deliveryDays: 2,
    costMultiplier: 1.1,
    quality: [0.45, 0.75],
    doaRisk: 0.03,
    species: ['medaka', 'rosy_barb', 'hillstream_loach', 'paradise_fish', 'white_cloud', 'zebra_danio', 'fancy_goldfish'],
    stockRange: [6, 24],
    minOrder: 20,
    level: 2,
  },
  {
    id: 'coralcoast',
    name: 'Coral Coast Imports',
    blurb: 'Tank-bred marine fish and specialist soft-water tropicals. Careful packing, three-day delivery.',
    deliveryDays: 3,
    costMultiplier: 1,
    quality: [0.55, 0.85],
    doaRisk: 0.04,
    species: ['german_blue_ram', 'clownfish', 'royal_gramma', 'banggai_cardinal'],
    stockRange: [3, 12],
    minOrder: 40,
    level: 3,
  },
  {
    id: 'reefworks',
    name: 'Reefworks Invertebrates',
    blurb: 'Shrimp and snail breeders plus a marine clean-up crew. Packed in breather bags, two-day delivery.',
    deliveryDays: 2,
    costMultiplier: 1,
    quality: [0.5, 0.85],
    doaRisk: 0.03,
    species: ['cherry_shrimp', 'crystal_shrimp', 'amano_shrimp', 'nerite_snail', 'mystery_snail', 'cleaner_shrimp', 'hermit_crab', 'turbo_snail'],
    stockRange: [6, 30],
    minOrder: 20,
    level: 5,
  },
  {
    id: 'canopy',
    name: 'Canopy Captive Breeders',
    blurb: 'Captive-bred frogs, geckos and tarantulas from a licensed breeder. Small batches, shipped warm, two-day delivery.',
    deliveryDays: 2,
    costMultiplier: 1,
    quality: [0.55, 0.88],
    doaRisk: 0.02,
    species: ['dart_frog', 'whites_tree_frog', 'fire_bellied_toad', 'rose_tarantula', 'leopard_gecko', 'crested_gecko'],
    stockRange: [2, 10],
    minOrder: 30,
    level: 6,
  },
];

/** Suppliers that trade with a shop of this level. */
export function suppliersFor(state: GameState): SupplierDef[] {
  return SUPPLIERS.filter((s) => (s.level ?? 1) <= state.shopLevel);
}

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
  for (const def of suppliersFor(state)) {
    const st = state.suppliers[def.id];
    if (!st || day - st.lastRefreshDay >= 7) refreshSupplierStock(state, rng, def.id, day);
  }
}

export interface OrderResult {
  ok: boolean;
  message: string;
}

export function placeOrder(state: GameState, supplierId: string, lines: Array<Omit<SupplierOrderLine, 'unitCost'>>, day: number): OrderResult {
  if (state.idle) return idleRefusal();
  const def = getSupplier(supplierId);
  const st = state.suppliers[supplierId];
  if (!st) return { ok: false, message: 'Supplier unavailable.' };
  const priced: SupplierOrderLine[] = [];
  const wanted = new Map<string, number>();
  for (const l of lines) if (l.quantity > 0) wanted.set(l.speciesId, (wanted.get(l.speciesId) ?? 0) + l.quantity);
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const s = st.stock.find((x) => x.speciesId === l.speciesId);
    if (!s || s.available < (wanted.get(l.speciesId) ?? 0)) return { ok: false, message: `Not enough ${getSpecies(l.speciesId).commonName} in stock.` };
    if (!state.tanks[l.tankId]) return { ok: false, message: 'Pick a tank for every line.' };
    const sp = getSpecies(l.speciesId);
    const tw = state.tanks[l.tankId].waterType ?? 'freshwater';
    const wrong = habitatRefusal(sp, state.tanks[l.tankId]);
    if (wrong) return { ok: false, message: wrong };
    if (!isLandAnimal(sp) && sp.waterType !== tw) return { ok: false, message: `${sp.commonName} is a ${sp.waterType} fish and cannot go in ${state.tanks[l.tankId].name} (${tw}).` };
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

/** Refund when cancelling: in full on the day the order was placed, 75% after that. */
export function cancelRefund(order: SupplierOrder, day: number): number {
  return round(order.total * (day <= order.placedDay ? 1 : 0.75), 2);
}

/** Cancels an undelivered order: refunds it and returns the fish to the supplier's list. */
export function cancelOrder(state: GameState, orderId: string, day: number): OrderResult {
  if (state.idle) return idleRefusal();
  const i = state.orders.findIndex((o) => o.id === orderId);
  if (i < 0) return { ok: false, message: 'That order has already arrived or was cancelled.' };
  const o = state.orders[i];
  const refund = cancelRefund(o, day);
  state.orders.splice(i, 1);
  const st = state.suppliers[o.supplierId];
  for (const l of o.lines) {
    const s = st?.stock.find((x) => x.speciesId === l.speciesId);
    if (s) s.available += l.quantity;
  }
  earn(state, refund, `Cancelled order ${o.id}`);
  return { ok: true, message: `Order ${o.id} cancelled. Refunded £${refund.toFixed(2)}${refund < o.total ? ' (75%: it had already been dispatched)' : ''}.` };
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
  if (state.idle) return idleRefusal();
  if (!spend(state, FOOD_TUB.cost, 'Fish food tub')) return { ok: false, message: 'Not enough money.' };
  state.foodUnits += FOOD_TUB.units;
  return { ok: true, message: `Bought a tub of food (+${FOOD_TUB.units} portions).` };
}

export function buyDryGood(state: GameState, id: string, qty: number): OrderResult {
  if (state.idle) return idleRefusal();
  const g = getDryGood(id);
  const cost = round(g.wholesale * qty, 2);
  if (!spend(state, cost, `${qty} x ${g.name}`)) return { ok: false, message: 'Not enough money.' };
  state.dryGoods[id] = (state.dryGoods[id] ?? 0) + qty;
  return { ok: true, message: `Stocked ${qty} x ${g.name}.` };
}
