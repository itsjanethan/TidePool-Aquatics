/**
 * Trade buyer: the wholesaler will take surplus fish at a fraction of their
 * value (adjusted by demand). A safety valve for overpopulated tanks, never
 * as profitable as selling to customers.
 */
import { idleRefusal } from './idle';
import { round } from '../core/math';
import { demandFor, earn, noteSold } from './economy';
import { fishValue } from './fish';
import type { ActionResult } from './tank';
import type { GameState } from './types';

export const FISH_TRADE_RATE = 0.35;

export function tradeValue(state: GameState, fishId: string): number {
  const f = state.fish[fishId];
  if (!f || !f.alive) return 0;
  // Fry are not worth much to a wholesaler.
  const frySale = f.sizeCm / f.adultSizeCm < 0.3 ? 0.3 : 1;
  return round(fishValue(f) * FISH_TRADE_RATE * demandFor(state, f.speciesId) * frySale, 2);
}

export function sellFishToTrade(state: GameState, ids: string[]): ActionResult {
  if (state.idle) return idleRefusal();
  let total = 0;
  let n = 0;
  for (const id of ids) {
    const f = state.fish[id];
    if (!f || !f.alive || f.reservedBy) continue;
    total += tradeValue(state, id);
    noteSold(state, f.speciesId, 1);
    if (f.offspringCount > 0) {
      f.tankId = null;
      f.originDetail += ' (sold to trade)';
    } else delete state.fish[id];
    n++;
  }
  if (!n) return { ok: false, message: 'No fish to sell.', minutes: 0 };
  earn(state, round(total, 2), `${n} fish to trade`);
  state.stats.totalFishSold += n;
  return { ok: true, message: `Sold ${n} fish to the trade buyer for £${total.toFixed(2)}.`, minutes: 3 + n };
}
