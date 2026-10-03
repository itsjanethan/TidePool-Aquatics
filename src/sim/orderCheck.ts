/**
 * Order validation: checks each destination tank for an order (or any
 * planned move) and reports problems in plain language. Warnings inform the
 * player; they never block the order.
 */
import { getSpecies } from '../data/species';
import { assessSpeciesForSetup, stockingCapacity, stockingRatio } from './compat';
import { fishInTank } from './fish';
import { cycleStatus } from './water';
import type { GameState } from './types';

export interface PlannedLine {
  speciesId: string;
  quantity: number;
  tankId: string;
}

export interface LineWarning {
  severity: 'warn' | 'info';
  text: string;
}

/** Typical size of delivered fish as a fraction of adult size (young stock). */
const DELIVERED_SIZE = 0.7;

/** Stocking ratio a tank would reach with all planned lines delivered. */
export function projectedStocking(state: GameState, tankId: string, lines: PlannedLine[]): number {
  const tank = state.tanks[tankId];
  const now = stockingRatio(tank, fishInTank(state, tankId));
  let extra = 0;
  for (const l of lines) {
    if (l.tankId !== tankId) continue;
    const sp = getSpecies(l.speciesId);
    extra += l.quantity * sp.adultSizeCm * DELIVERED_SIZE * Math.sqrt(sp.wasteFactor);
  }
  return now + extra / stockingCapacity(tank);
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

  const proj = projectedStocking(state, t.id, all);
  if (proj > 1.05) out.push({ severity: 'warn', text: `${t.name} would be overstocked (about ${Math.round(proj * 100)}%).` });
  else if (proj > 0.9) out.push({ severity: 'info', text: `${t.name} would be nearly full (about ${Math.round(proj * 100)}%).` });

  if (w.temperature < sp.temperature.min - 0.5 || w.temperature > sp.temperature.max + 0.5) {
    out.push({ severity: 'warn', text: `${t.name} is ${w.temperature.toFixed(0)}°C; ${sp.commonName} needs ${sp.temperature.min}-${sp.temperature.max}°C.` });
  }
  if (w.ph < sp.ph.min - 0.2 || w.ph > sp.ph.max + 0.2) out.push({ severity: 'warn', text: `pH ${w.ph.toFixed(1)} is outside ${sp.commonName}'s range (${sp.ph.min}-${sp.ph.max}).` });
  if (w.gh < sp.hardness.min - 1 || w.gh > sp.hardness.max + 1) out.push({ severity: 'info', text: `Hardness ${w.gh.toFixed(0)} dGH is outside ${sp.commonName}'s range (${sp.hardness.min}-${sp.hardness.max}).` });

  const resident = [...new Set(fishInTank(state, t.id).map((f) => f.speciesId))];
  const incoming = all.filter((l) => l !== line && l.tankId === t.id).map((l) => l.speciesId);
  const res = assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: w.temperature, residentSpecies: [...resident, ...incoming] });
  for (const issue of res.issues) {
    // Temperature is reported above with the actual reading.
    if (/heater|cooler/.test(issue)) continue;
    out.push({ severity: 'warn', text: issue });
  }

  const group = fishInTank(state, t.id).filter((f) => f.speciesId === sp.id).length + all.filter((l) => l.tankId === t.id && l.speciesId === sp.id).reduce((n, l) => n + l.quantity, 0);
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
