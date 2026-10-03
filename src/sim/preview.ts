/**
 * Action previews: run a real maintenance action against a cloned game state
 * and report before/after tank metrics. The UI shows these numbers, so the
 * predictions can never drift from what the action actually does.
 */
import { clamp } from '../core/math';
import { feedingNeed } from './tank';
import { cleanFilter, cleanGlass, doWaterChange, feedTank, removeDead, scrubAlgae, topOffTank, vacuumSubstrate, type ActionResult } from './tank';
import { fishInTank } from './fish';
import type { GameState, TankState } from './types';

export type FixId = 'feed' | 'water25' | 'water50' | 'glass' | 'algae' | 'vacuum' | 'filter' | 'removeDead' | 'topoff';

/** The sim function behind each fix. */
export const FIXES: Record<FixId, { label: string; run: (s: GameState, t: TankState) => ActionResult }> = {
  feed: { label: 'Feed (normal)', run: (s, t) => feedTank(s, t, 'normal') },
  water25: { label: '25% water change', run: (s, t) => doWaterChange(s, t, 0.25) },
  water50: { label: '50% water change', run: (s, t) => doWaterChange(s, t, 0.5) },
  glass: { label: 'Clean the glass', run: (s, t) => cleanGlass(s, t) },
  algae: { label: 'Scrub algae', run: (s, t) => scrubAlgae(s, t) },
  vacuum: { label: 'Vacuum the substrate', run: (s, t) => vacuumSubstrate(s, t) },
  filter: { label: 'Rinse the filter', run: (s, t) => cleanFilter(s, t) },
  removeDead: { label: 'Remove dead fish', run: (s, t) => removeDead(s, t) },
  topoff: { label: 'Top off with RO water', run: (s, t) => topOffTank(s, t) },
};

/** Player-facing tank metrics (percentages 0..100 unless noted). */
export interface TankMetrics {
  glassDirt: number;
  algae: number;
  /** Detritus as a waste level %, 100 = filthy. */
  waste: number;
  /** Uneaten food in portions. */
  food: number;
  cloudiness: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  filter: number;
  dead: number;
  /** Food in the water vs what the fish want right now, %. */
  feedCover: number;
  /** Marine salinity ppt (0 for freshwater). */
  salinity: number;
}

/** Detritus (mg/L) shown as a 0..100 waste level. */
export function wastePercent(detritus: number): number {
  return clamp(Math.round((detritus / 4) * 100), 0, 100);
}

export function tankMetrics(state: GameState, tank: TankState): TankMetrics {
  const need = feedingNeed(state, tank);
  return {
    glassDirt: Math.round(tank.glassDirt * 100),
    algae: Math.round(tank.algae * 100),
    waste: wastePercent(tank.water.detritus),
    food: Math.round(tank.food * 10) / 10,
    cloudiness: Math.round(tank.water.cloudiness * 100),
    ammonia: Math.round(tank.water.ammonia * 100) / 100,
    nitrite: Math.round(tank.water.nitrite * 100) / 100,
    nitrate: Math.round(tank.water.nitrate),
    filter: Math.round(tank.filterCondition * 100),
    dead: fishInTank(state, tank.id, true).filter((f) => !f.alive).length,
    feedCover: need > 0.05 ? Math.min(999, Math.round((tank.food / need) * 100)) : 100,
    salinity: Math.round((tank.water.salinity ?? 0) * 10) / 10,
  };
}

export interface ActionPreview {
  fix: FixId;
  result: ActionResult;
  before: TankMetrics;
  after: TankMetrics;
  /** Metrics that change, formatted "name: a → b". */
  changes: Array<{ key: keyof TankMetrics; label: string; from: string; to: string }>;
}

const LABEL: Record<keyof TankMetrics, string> = {
  glassDirt: 'Glass dirt',
  algae: 'Algae',
  waste: 'Waste',
  food: 'Uneaten food',
  cloudiness: 'Cloudiness',
  ammonia: 'Ammonia',
  nitrite: 'Nitrite',
  nitrate: 'Nitrate',
  filter: 'Filter condition',
  dead: 'Dead fish',
  feedCover: 'Food vs need',
  salinity: 'Salinity',
};

function fmt(key: keyof TankMetrics, v: number): string {
  if (key === 'ammonia' || key === 'nitrite') return `${v.toFixed(2)} ppm`;
  if (key === 'nitrate') return `${v} ppm`;
  if (key === 'food') return `${v}`;
  if (key === 'salinity') return `SG ${(1 + v * 0.000752).toFixed(3)}`;
  if (key === 'dead') return `${v}`;
  return `${v}%`;
}

/** Runs a fix on a deep copy of the state and reports what changes. */
export function previewFix(state: GameState, tankId: string, fix: FixId): ActionPreview {
  const clone: GameState = structuredClone(state);
  const t = clone.tanks[tankId];
  const before = tankMetrics(clone, t);
  const result = FIXES[fix].run(clone, t);
  const after = tankMetrics(clone, t);
  const changes: ActionPreview['changes'] = [];
  for (const k of Object.keys(LABEL) as Array<keyof TankMetrics>) {
    if (fix !== 'feed' && k === 'feedCover') continue;
    if (Math.abs(after[k] - before[k]) < (k === 'ammonia' || k === 'nitrite' ? 0.005 : k === 'salinity' ? 0.05 : 0.5)) continue;
    changes.push({ key: k, label: LABEL[k], from: fmt(k, before[k]), to: fmt(k, after[k]) });
  }
  return { fix, result, before, after, changes };
}

/** One-line summary of a preview: "Glass dirt 68% → 0% · Algae 47% → 12% · 8 min". */
export function previewLine(p: ActionPreview): string {
  if (!p.result.ok) return p.result.message;
  const parts = p.changes.map((c) => `${c.label} ${c.from} → ${c.to}`);
  if (p.result.minutes) parts.push(`${p.result.minutes} min`);
  return parts.join(' · ') || 'No change';
}
