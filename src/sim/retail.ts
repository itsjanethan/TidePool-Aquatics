/**
 * Equipment retail: buying stock in, stock space, prices, and what customers
 * reserve. Customers buy through the till like everything else.
 */
import { round } from '../core/math';
import { BASE_STOCK_SPACE, BASEMENT_STOCK_SPACE, getRetailItem, RETAIL_ITEMS } from '../data/retail';
import { spend } from './economy';
import { idleRefusal } from './idle';
import type { ActionResult } from './tank';
import type { GameState } from './types';

export function retailUnlocked(state: GameState): boolean {
  return state.unlocks.floors.includes('basement');
}

export function stockSpace(state: GameState): number {
  return retailUnlocked(state) ? BASEMENT_STOCK_SPACE : BASE_STOCK_SPACE;
}

export function stockSpaceUsed(state: GameState): number {
  let used = 0;
  for (const [id, n] of Object.entries(state.retail)) if (n > 0) used += getRetailItem(id).space * n;
  return used;
}

export const RETAIL_PRICE_PREFIX = '_retail:';

export function retailPrice(state: GameState, id: string): number {
  return state.prices[RETAIL_PRICE_PREFIX + id] ?? getRetailItem(id).retail;
}

/** Items held for customers in the shop (not yet paid for). */
export function reservedRetail(state: GameState, id: string): number {
  let n = 0;
  for (const c of state.customers) for (const e of c.equipment ?? []) if (e === id) n++;
  return n;
}

export function availableRetail(state: GameState, id: string): number {
  return Math.max(0, (state.retail[id] ?? 0) - reservedRetail(state, id));
}

export function buyRetailStock(state: GameState, id: string, qty: number): ActionResult {
  if (state.idle) return idleRefusal();
  if (!retailUnlocked(state)) return { ok: false, message: 'Equipment retail opens with the basement expansion.', minutes: 0 };
  const def = getRetailItem(id);
  if (stockSpaceUsed(state) + def.space * qty > stockSpace(state)) return { ok: false, message: 'Not enough stock space. Sell some stock first.', minutes: 0 };
  const cost = round(def.wholesale * qty, 2);
  if (!spend(state, cost, `Stock: ${qty} x ${def.name}`)) return { ok: false, message: 'Not enough money.', minutes: 0 };
  state.retail[id] = (state.retail[id] ?? 0) + qty;
  return { ok: true, message: `Bought ${qty} x ${def.name} for £${cost.toFixed(2)}.`, minutes: 0 };
}

/** Margin per item at current price, for the stock screen. */
export function retailMargin(state: GameState, id: string): number {
  return round(retailPrice(state, id) - getRetailItem(id).wholesale, 2);
}

/** Items the shop can stock now (marine kit only once marine is unlocked). */
export function retailItemsFor(state: GameState) {
  return RETAIL_ITEMS.filter((r) => (r.category !== 'marine' && r.id !== 'bundle_marine') || state.unlocks.marine);
}
