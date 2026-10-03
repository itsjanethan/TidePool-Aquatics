/**
 * Incoming livestock by destination tank: what has been ordered for a tank,
 * when it arrives and what the tank will hold afterwards. Read straight from
 * `state.orders` (placed orders), so deliveries, cancellations and save/load
 * keep it right without any separate bookkeeping.
 */
import { getSpecies } from '../data/species';
import { getSupplier } from './supplier';
import { fishInTank } from './fish';
import { outstandingLines, stockingBreakdown, type PlannedLine, type StockingBreakdown } from './orderCheck';
import { dateString, dayOf, MINUTES_PER_DAY } from './time';
import type { GameState } from './types';

export interface IncomingLine {
  orderId: string;
  supplierName: string;
  speciesId: string;
  quantity: number;
  arrivalDay: number;
  placedDay: number;
}

/** "Tue 3 Spring" style label for a game day number (1-based, see time.dayOf). */
export function dayLabel(day: number): string {
  return dateString((day - 1) * MINUTES_PER_DAY);
}

/** "today", "tomorrow" or "in N days" relative to now. */
export function arrivalText(state: GameState, day: number): string {
  const d = day - dayOf(state.minute);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days (${dayLabel(day)})`;
}

export function incomingForTank(state: GameState, tankId: string): IncomingLine[] {
  const out: IncomingLine[] = [];
  for (const o of state.orders ?? []) {
    for (const l of o.lines) {
      if (l.tankId !== tankId) continue;
      out.push({ orderId: o.id, supplierName: getSupplier(o.supplierId).name, speciesId: l.speciesId, quantity: l.quantity, arrivalDay: o.arrivalDay, placedDay: o.placedDay });
    }
  }
  return out.sort((a, b) => a.arrivalDay - b.arrivalDay);
}

export function incomingCount(state: GameState, tankId: string): number {
  return incomingForTank(state, tankId).reduce((n, l) => n + l.quantity, 0);
}

export interface TankOutlook {
  incoming: IncomingLine[];
  /** Species counts in the tank now. */
  current: Array<{ speciesId: string; count: number }>;
  /** Species counts once outstanding deliveries (and any planned lines) arrive. */
  after: Array<{ speciesId: string; count: number; incoming: number }>;
  stocking: StockingBreakdown;
}

/** Current inhabitants, incoming stock and the stocking after delivery (optionally with planned lines). */
export function tankOutlook(state: GameState, tankId: string, planned: PlannedLine[] = []): TankOutlook {
  const incoming = incomingForTank(state, tankId);
  const counts = new Map<string, number>();
  for (const f of fishInTank(state, tankId)) counts.set(f.speciesId, (counts.get(f.speciesId) ?? 0) + 1);
  const current = [...counts].map(([speciesId, count]) => ({ speciesId, count }));
  const add = new Map<string, number>();
  for (const l of [...incoming, ...planned.filter((p) => p.tankId === tankId && !p.orderId)]) add.set(l.speciesId, (add.get(l.speciesId) ?? 0) + l.quantity);
  const ids = new Set([...counts.keys(), ...add.keys()]);
  const after = [...ids].map((speciesId) => ({ speciesId, count: (counts.get(speciesId) ?? 0) + (add.get(speciesId) ?? 0), incoming: add.get(speciesId) ?? 0 }));
  return { incoming, current, after, stocking: stockingBreakdown(state, tankId, planned.filter((p) => p.tankId === tankId)) };
}

/** One-line summary for badges and lists: "6 Neon Tetra tomorrow". */
export function incomingSummary(state: GameState, tankId: string): string | null {
  const inc = incomingForTank(state, tankId);
  if (!inc.length) return null;
  const by = new Map<string, number>();
  for (const l of inc) by.set(l.speciesId, (by.get(l.speciesId) ?? 0) + l.quantity);
  const first = Math.min(...inc.map((l) => l.arrivalDay));
  const what = [...by].map(([sid, n]) => `${n} ${getSpecies(sid).commonName}`).join(', ');
  return `${what} on order, ${arrivalText(state, first)}`;
}

export { outstandingLines };
