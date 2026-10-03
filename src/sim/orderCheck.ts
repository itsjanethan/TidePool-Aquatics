/**
 * Order validation: checks each destination tank for an order (or any
 * planned move) and reports problems in plain language. Warnings inform the
 * player; they never block the order.
 *
 * Outstanding supplier orders count as part of each tank's future: stocking,
 * compatibility and group sizes all include livestock already on its way,
 * and ordering more of a species already incoming says so. Lines in the cart
 * being checked are never counted twice: only orders already placed come
 * from `state.orders`.
 */
import { getSpecies } from '../data/species';
import { assessSpeciesForSetup, stockingCapacity, stockingRatio } from './compat';
import { fishInTank } from './fish';
import { cycleStatus } from './water';
import { dateString, MINUTES_PER_DAY } from './time';
import type { GameState } from './types';

export interface PlannedLine {
  speciesId: string;
  quantity: number;
  tankId: string;
  /** Set for lines of orders already placed (from state.orders). */
  orderId?: string;
  arrivalDay?: number;
}

export interface LineWarning {
  severity: 'warn' | 'info';
  text: string;
}

/** Typical size of delivered fish as a fraction of adult size (young stock). */
const DELIVERED_SIZE = 0.7;

/** Livestock already ordered and not yet delivered (optionally for one tank). */
export function outstandingLines(state: GameState, tankId?: string): PlannedLine[] {
  const out: PlannedLine[] = [];
  for (const o of state.orders ?? []) {
    for (const l of o.lines) {
      if (tankId && l.tankId !== tankId) continue;
      out.push({ speciesId: l.speciesId, quantity: l.quantity, tankId: l.tankId, orderId: o.id, arrivalDay: o.arrivalDay });
    }
  }
  return out;
}

/** Planned lines plus outstanding orders, without counting an order twice. */
export function withOutstanding(state: GameState, lines: PlannedLine[]): PlannedLine[] {
  const have = new Set(lines.filter((l) => l.orderId).map((l) => `${l.orderId}|${l.speciesId}|${l.tankId}`));
  return [...lines, ...outstandingLines(state).filter((l) => !have.has(`${l.orderId}|${l.speciesId}|${l.tankId}`))];
}

function stockingOf(state: GameState, tankId: string, lines: PlannedLine[]): number {
  const tank = state.tanks[tankId];
  let extra = 0;
  for (const l of lines) {
    if (l.tankId !== tankId) continue;
    const sp = getSpecies(l.speciesId);
    extra += l.quantity * sp.adultSizeCm * DELIVERED_SIZE * Math.sqrt(sp.wasteFactor);
  }
  return extra / stockingCapacity(tank);
}

export interface StockingBreakdown {
  /** Fish in the tank now. */
  now: number;
  /** Livestock already ordered for this tank. */
  ordered: number;
  /** Lines being planned (cart, proposal, move). */
  planned: number;
  total: number;
}

/** Stocking now, from outstanding orders and from the planned lines, as ratios (1 = full). */
export function stockingBreakdown(state: GameState, tankId: string, lines: PlannedLine[], includeOrdered = true): StockingBreakdown {
  const tank = state.tanks[tankId];
  const now = stockingRatio(tank, fishInTank(state, tankId));
  const planned = stockingOf(state, tankId, lines.filter((l) => !l.orderId));
  const ordered = includeOrdered ? stockingOf(state, tankId, withOutstanding(state, lines).filter((l) => l.orderId)) : stockingOf(state, tankId, lines.filter((l) => l.orderId));
  return { now, ordered, planned, total: now + ordered + planned };
}

/** Stocking ratio a tank would reach with all planned lines and outstanding orders delivered. */
export function projectedStocking(state: GameState, tankId: string, lines: PlannedLine[], includeOrdered = true): number {
  return stockingBreakdown(state, tankId, lines, includeOrdered).total;
}

/** Problems for one line, given the whole planned order (for shared tanks). */
export function lineWarnings(state: GameState, line: PlannedLine, all: PlannedLine[]): LineWarning[] {
  const out: LineWarning[] = [];
  const t = state.tanks[line.tankId];
  const sp = getSpecies(line.speciesId);
  const w = t.water;
  const tankType = t.waterType ?? 'freshwater';
  if (sp.waterType !== tankType) out.push({ severity: 'warn', text: `${t.name} is a ${tankType} tank; ${sp.commonName} is a ${sp.waterType} fish.` });

  const cyc = cycleStatus(w);
  if (cyc === 'uncycled') out.push({ severity: 'warn', text: `${t.name} is not cycled yet. New fish may be poisoned by ammonia.` });
  else if (cyc === 'cycling') out.push({ severity: 'warn', text: `${t.name} is still cycling. Add fish slowly.` });
  if (w.ammonia > 0.25 || w.nitrite > 0.25) out.push({ severity: 'warn', text: `${t.name} has ammonia or nitrite right now.` });

  const b = stockingBreakdown(state, t.id, all);
  const pct = (n: number) => Math.round(n * 100);
  const parts = `${pct(b.now)}% now${b.ordered > 0.005 ? ` + ${pct(b.ordered)}% already ordered` : ''} + ${pct(b.planned)}% in this order`;
  if (b.total > 1.05) out.push({ severity: 'warn', text: `${t.name} would be overstocked: about ${pct(b.total)}% (${parts}).` });
  else if (b.total > 0.9) out.push({ severity: 'info', text: `${t.name} would be nearly full: about ${pct(b.total)}% (${parts}).` });

  // Already on its way: say what, when and in which order; the player may still want more.
  const ordered = outstandingLines(state, t.id).filter((l) => l.speciesId === sp.id);
  if (ordered.length && !line.orderId) {
    const n = ordered.reduce((a, l) => a + l.quantity, 0);
    const inTank = fishInTank(state, t.id).filter((f) => f.speciesId === sp.id).length;
    const planned = all.filter((l) => !l.orderId && l.tankId === t.id && l.speciesId === sp.id).reduce((a, l) => a + l.quantity, 0);
    const when = [...new Set(ordered.map((l) => l.arrivalDay))].map((d) => dateString((d! - 1) * MINUTES_PER_DAY)).join(', ');
    const ids = [...new Set(ordered.map((l) => l.orderId))].join(', ');
    out.push({
      severity: 'warn',
      text: `${n} ${sp.commonName} already ordered for ${t.name} (order ${ids}, arriving ${when}). With this line: ${inTank + n + planned} ${sp.commonName} in ${t.name} after delivery.`,
    });
  }

  if (w.temperature < sp.temperature.min - 0.5 || w.temperature > sp.temperature.max + 0.5) {
    out.push({ severity: 'warn', text: `${t.name} is ${w.temperature.toFixed(0)}°C; ${sp.commonName} needs ${sp.temperature.min}-${sp.temperature.max}°C.` });
  }
  if (w.ph < sp.ph.min - 0.2 || w.ph > sp.ph.max + 0.2) out.push({ severity: 'warn', text: `pH ${w.ph.toFixed(1)} is outside ${sp.commonName}'s range (${sp.ph.min}-${sp.ph.max}).` });
  if (w.gh < sp.hardness.min - 1 || w.gh > sp.hardness.max + 1) out.push({ severity: 'info', text: `Hardness ${w.gh.toFixed(0)} dGH is outside ${sp.commonName}'s range (${sp.hardness.min}-${sp.hardness.max}).` });

  const resident = [...new Set(fishInTank(state, t.id).map((f) => f.speciesId))];
  const incoming = withOutstanding(state, all).filter((l) => l !== line && l.tankId === t.id && !(l.orderId && l.orderId === line.orderId && l.speciesId === line.speciesId)).map((l) => l.speciesId);
  const res = assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: w.temperature, residentSpecies: [...resident, ...incoming] });
  for (const issue of res.issues) {
    // Temperature is reported above with the actual reading.
    if (/heater|cooler/.test(issue)) continue;
    out.push({ severity: 'warn', text: issue });
  }

  const group = fishInTank(state, t.id).filter((f) => f.speciesId === sp.id).length + withOutstanding(state, all).filter((l) => l.tankId === t.id && l.speciesId === sp.id).reduce((n, l) => n + l.quantity, 0);
  if (group < sp.minGroupSize) out.push({ severity: 'info', text: `${sp.commonName} prefer groups of ${sp.minGroupSize}+ (this tank would have ${group}).` });
  return dedupe(out);
}

function dedupe(list: LineWarning[]): LineWarning[] {
  const seen = new Set<string>();
  return list.filter((w) => (seen.has(w.text) ? false : (seen.add(w.text), true)));
}

/** All warnings for an order, de-duplicated (tank-level warnings appear once). */
export function orderWarnings(state: GameState, lines: PlannedLine[]): LineWarning[] {
  return dedupe(lines.flatMap((l) => lineWarnings(state, l, lines)));
}
