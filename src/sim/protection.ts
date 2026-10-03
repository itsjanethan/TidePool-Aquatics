/**
 * "Not for sale": individual fish the player keeps (breeders, favourites).
 *
 * A protected fish can never be reserved by a customer, sold at the till (by
 * the player or staff), sold to the trade buyer, or sold automatically.
 * Enforcement lives in the sale functions themselves (`sellable`,
 * `completeSale`, `sellFishToTrade`), not only in the UI. Feeding, moving,
 * breeding and inspecting are unaffected. The flag is an optional field on
 * the fish, so it survives moves, saves and export/import, old saves load as
 * unprotected, and offspring start unprotected.
 */
import type { CustomerContext } from './customers';
import { leave } from './customers';
import type { FishEntity, GameState } from './types';

export function isProtected(f: FishEntity | undefined | null): boolean {
  return !!f?.notForSale;
}

export interface ProtectResult {
  /** Fish whose flag actually changed. */
  changed: number;
  /** Fish taken out of a customer's basket. */
  released: number;
  /** Customers who left because nothing was left in their basket. */
  customersLeft: number;
  message: string;
}

/**
 * Protects (or unprotects) fish. Protecting a reserved fish takes it out of
 * the customer's basket and clears the reservation; a customer with nothing
 * left to buy leaves (not counted as a lost sale). Pass the customer context
 * when a simulation is running so that customer can walk out.
 */
export function setNotForSale(state: GameState, ids: string[], on: boolean, ctx?: CustomerContext): ProtectResult {
  let changed = 0;
  let released = 0;
  let customersLeft = 0;
  for (const id of ids) {
    const f = state.fish[id];
    if (!f) continue;
    if (!!f.notForSale === on) continue;
    if (on) f.notForSale = true;
    else delete f.notForSale;
    changed++;
    if (on && f.reservedBy) {
      released++;
      const c = state.customers.find((x) => x.id === f.reservedBy);
      f.reservedBy = null;
      if (!c) continue;
      for (const line of c.basket) line.fishIds = line.fishIds.filter((x) => x !== id);
      c.basket = c.basket.filter((l) => l.fishIds.length > 0);
      c.thought = 'Oh, that one is not for sale?';
      c.thoughtUntil = state.minute + 8;
      c.satisfaction -= 3;
      const nothingLeft = !c.basket.length && !c.addOns.length && !(c.plantUids?.length ?? 0) && !(c.equipment?.length ?? 0);
      if (nothingLeft && ctx && (c.phase === 'to_queue' || c.phase === 'queueing')) {
        leave(state, ctx, c, 'item not for sale');
        customersLeft++;
      }
    }
  }
  const n = ids.length;
  const what = (k: number) => `${k} fish`;
  let message: string;
  if (!changed) message = on ? `${n === 1 ? 'That fish is' : 'Those fish are'} already not for sale.` : `${n === 1 ? 'That fish is' : 'Those fish are'} already for sale.`;
  else if (on) message = `Not for sale: ${what(changed)} protected.${released ? ` ${released} reserved by a customer; the reservation was released.` : ''}`;
  else message = `For sale again: ${what(changed)}. Customers and the trade buyer can buy ${changed === 1 ? 'it' : 'them'}.`;
  return { changed, released, customersLeft, message };
}

/** Protected fish among ids (for messages and UI). */
export function countProtected(state: GameState, ids: string[]): number {
  return ids.filter((id) => isProtected(state.fish[id])).length;
}
