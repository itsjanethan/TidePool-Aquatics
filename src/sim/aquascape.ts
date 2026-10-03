/**
 * AquascapeSystem: derives gameplay values (cover, caves, beauty) from a
 * tank's decor, substrate and background.
 */
import { clamp, clamp01 } from '../core/math';
import { getBackground, getDecor, getSubstrate } from '../data/catalog';
import type { TankState } from './types';
import { floatingFryCover, floatingShade, totalFloating } from './floating';

export interface AquascapeSummary {
  cover: number; // 0..1+
  /** Number of cave objects. */
  caves: number;
  /** Fish that can claim a cave across all cave objects. */
  caveSlots: number;
  plants: number;
  plantHealth: number; // avg 0..1
  provides: Set<string>;
  nutrientUptake: number; // ppm nitrate/day
  phEffect: number;
  /** 0..1, how much open swimming space remains. */
  openSpace: number;
  /** 0..100 visual score including cleanliness. */
  beauty: number;
  /** 0..100 layout score ignoring cleanliness. */
  layout: number;
  /** 0..0.85 light blocked by floating plants. */
  shade: number;
  /** The layout score's components (they add up to `layout` before clamping). */
  parts: LayoutParts;
  /** Beauty adjustments on top of layout. */
  floatLook: number;
  dirt: number;
  /** 0..1 how full the tank looks (0.55 is the sweet spot). */
  density: number;
  /** Sum of item looks before the cap (4 = full marks). */
  looksSum: number;
}

/** Layout score components, each with its maximum. */
export interface LayoutParts {
  substrate: number;
  background: number;
  variety: number;
  count: number;
  density: number;
  spread: number;
  depth: number;
  looks: number;
}

/** What each layout component means and its ceiling (shared by the UI and tests). */
export const LAYOUT_PARTS: Record<keyof LayoutParts, { label: string; max: number; explain: string }> = {
  substrate: { label: 'Substrate', max: 14, explain: 'how good the substrate looks' },
  background: { label: 'Background', max: 14, explain: 'how good the background looks' },
  variety: { label: 'Variety', max: 24, explain: 'kinds of item (plants, rock, wood, caves): up to 4 count' },
  count: { label: 'Number of items', max: 17.6, explain: 'up to 8 items count' },
  density: { label: 'Fullness', max: 16, explain: 'best at about half full; emptier or more crowded scores less' },
  spread: { label: 'Spread', max: 10, explain: 'items spread from side to side' },
  depth: { label: 'Depth', max: 8, explain: 'using back, middle and front' },
  looks: { label: 'Item looks', max: 10, explain: 'healthy, attractive items; full marks once enough are in' },
};
/** Variety counts up to this many kinds; items up to this many. */
export const VARIETY_CAP = 4;
export const COUNT_CAP = 8;
export const DENSITY_SWEET_SPOT = 0.55;

export function summarizeAquascape(tank: TankState): AquascapeSummary {
  const provides = new Set<string>();
  let cover = 0;
  let caves = 0;
  let caveSlots = 0;
  let plants = 0;
  let plantHealthSum = 0;
  let uptake = 0;
  let ph = 0;
  let footprint = 0;
  let beautySum = 0;
  const kinds = new Set<string>();
  const sizeScale = 60 / Math.max(40, tank.lengthCm);

  for (const d of tank.decor) {
    const def = getDecor(d.defId);
    kinds.add(def.kind);
    def.provides.forEach((p) => provides.add(p));
    const isPlant = def.kind === 'plant';
    const size = isPlant ? (d.size ?? 1) : 1;
    const h = isPlant ? d.health : 1;
    cover += def.cover * h * sizeScale * Math.min(size, 1.3);
    if (def.cave) {
      caves += 1;
      caveSlots += def.caveSlots ?? 1;
    }
    if (isPlant) {
      plants += 1;
      plantHealthSum += d.health;
      uptake += def.nutrientUptake * d.health * size;
    }
    ph += def.phEffect;
    footprint += (def.width / 448) * (def.height / 200) * (isPlant ? size * size : 1);
    // Plants look best near mature size; tiny cuttings and overgrown jungles score less.
    const sizeLook = !isPlant ? 1 : size > 1.25 ? Math.max(0.3, 1 - (size - 1.25) * 1.6) : Math.min(1, 0.45 + size * 0.55);
    beautySum += def.beauty * h * sizeLook;
  }

  const sub = getSubstrate(tank.substrateId);
  sub.provides.forEach((p) => provides.add(p));
  const bg = getBackground(tank.backgroundId);

  // Layout: variety, density sweet spot, horizontal balance.
  const n = tank.decor.length;
  const density = clamp01(footprint / 0.9);
  const densityScore = n === 0 ? 0 : 1 - Math.abs(density - DENSITY_SWEET_SPOT) * 1.3;
  const xs = tank.decor.map((d) => d.x);
  const spread = n > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
  const layers = new Set(tank.decor.map((d) => d.layer)).size;
  const parts: LayoutParts = {
    substrate: sub.beauty * 14,
    background: bg.beauty * 14,
    variety: Math.min(VARIETY_CAP, kinds.size) * 6,
    count: Math.min(n, COUNT_CAP) * 2.2,
    density: clamp01(densityScore) * 16,
    spread: spread * 10,
    depth: (layers - 1) * 4,
    looks: Math.min(1, beautySum / 4) * 10,
  };
  const layout = clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100);
  // A little floating cover looks natural; a carpet hides the tank.
  const floatTotal = totalFloating(tank);
  const floatLook = floatTotal < 0.4 ? floatTotal * 10 : Math.max(-12, 4 - (floatTotal - 0.4) * 26);
  const dirt = tank.algae * 30 + tank.glassDirt * 25 + tank.water.cloudiness * 35;
  const beauty = clamp(layout + floatLook - dirt, 0, 100);
  if (floatTotal > 0.05) provides.add('plants');

  return {
    cover: cover + floatingFryCover(tank),
    caveSlots,
    shade: floatingShade(tank),
    caves,
    plants,
    plantHealth: plants ? plantHealthSum / plants : 0,
    provides,
    nutrientUptake: uptake,
    phEffect: ph,
    openSpace: clamp01(1 - density * 0.9),
    beauty,
    layout,
    parts,
    floatLook,
    dirt,
    density,
    looksSum: beautySum,
  };
}
