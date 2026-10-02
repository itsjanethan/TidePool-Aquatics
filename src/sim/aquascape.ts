/**
 * AquascapeSystem: derives gameplay values (cover, caves, beauty) from a
 * tank's decor, substrate and background.
 */
import { clamp, clamp01 } from '../core/math';
import { getBackground, getDecor, getSubstrate } from '../data/catalog';
import type { TankState } from './types';

export interface AquascapeSummary {
  cover: number; // 0..1+
  caves: number;
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
}

export function summarizeAquascape(tank: TankState): AquascapeSummary {
  const provides = new Set<string>();
  let cover = 0;
  let caves = 0;
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
    const h = def.kind === 'plant' ? d.health : 1;
    cover += def.cover * h * sizeScale;
    if (def.cave) caves += 1;
    if (def.kind === 'plant') {
      plants += 1;
      plantHealthSum += d.health;
      uptake += def.nutrientUptake * d.health;
    }
    ph += def.phEffect;
    footprint += (def.width / 448) * (def.height / 200);
    beautySum += def.beauty * h;
  }

  const sub = getSubstrate(tank.substrateId);
  sub.provides.forEach((p) => provides.add(p));
  const bg = getBackground(tank.backgroundId);

  // Layout: variety, density sweet spot, horizontal balance.
  const n = tank.decor.length;
  const density = clamp01(footprint / 0.9);
  const densityScore = n === 0 ? 0 : 1 - Math.abs(density - 0.55) * 1.3;
  const xs = tank.decor.map((d) => d.x);
  const spread = n > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
  const layers = new Set(tank.decor.map((d) => d.layer)).size;
  const layout = clamp(
    sub.beauty * 14 +
      bg.beauty * 14 +
      Math.min(4, kinds.size) * 6 +
      Math.min(n, 8) * 2.2 +
      clamp01(densityScore) * 16 +
      spread * 10 +
      (layers - 1) * 4 +
      Math.min(1, beautySum / 4) * 10,
    0,
    100,
  );
  const dirt = tank.algae * 30 + tank.glassDirt * 25 + tank.water.cloudiness * 35;
  const beauty = clamp(layout - dirt, 0, 100);

  return {
    cover,
    caves,
    plants,
    plantHealth: plants ? plantHealthSum / plants : 0,
    provides,
    nutrientUptake: uptake,
    phEffect: ph,
    openSpace: clamp01(1 - density * 0.9),
    beauty,
    layout,
  };
}
