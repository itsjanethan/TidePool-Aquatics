/**
 * Lighting for the tank view: a coarse light map (top-down light falling off
 * with depth, shade under floating plants, plant canopies and wood, dark cave
 * mouths) that fish, plants and effects sample, and a water look (tint from
 * tannins and suspended algae) derived from the tank's state. Built for
 * blackwater later: tint comes from data, never assumed to be clear blue.
 */
import { getDecor, getFloating } from '../data/catalog';
import type { TankState } from '../sim/types';

export interface LightBox {
  x0: number;
  x1: number;
  /** Shade applies from this y down. */
  y0: number;
  y1: number;
  /** 0..1 light removed. */
  amount: number;
}

export class LightMap {
  readonly cols: number;
  readonly rows: number;
  private data: Float32Array;
  constructor(private left: number, private right: number, private top: number, private bottom: number, cols = 48) {
    this.cols = cols;
    this.rows = Math.round(cols * 0.5);
    this.data = new Float32Array(this.cols * this.rows).fill(1);
  }

  /**
   * Rebuilds the map. `surfaceShade(x)` is the fraction of light the floating
   * plants block above x; boxes are canopies, wood and caves.
   */
  rebuild(lightsOn: boolean, surfaceShade: (x: number) => number, boxes: LightBox[]): void {
    const { cols, rows } = this;
    const w = (this.right - this.left) / cols;
    const h = (this.bottom - this.top) / rows;
    for (let r = 0; r < rows; r++) {
      const y = this.top + (r + 0.5) * h;
      const depth = (y - this.top) / (this.bottom - this.top);
      for (let c = 0; c < cols; c++) {
        const x = this.left + (c + 0.5) * w;
        let l = (lightsOn ? 1 : 0.35) * (1 - depth * 0.32);
        l *= 1 - surfaceShade(x) * 0.75 * (0.75 + 0.25 * depth);
        for (const b of boxes) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) l *= 1 - b.amount;
        this.data[r * cols + c] = l;
      }
    }
    // Soften: one box-blur pass so shade edges are gentle.
    const out = new Float32Array(this.data.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let s = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        s += this.data[rr * cols + cc];
        n++;
      }
      out[r * cols + c] = s / n;
    }
    this.data = out;
  }

  /** 0..1 light at a canvas point (bilinear). */
  at(x: number, y: number): number {
    const fx = ((x - this.left) / (this.right - this.left)) * this.cols - 0.5;
    const fy = ((y - this.top) / (this.bottom - this.top)) * this.rows - 0.5;
    const c0 = Math.max(0, Math.min(this.cols - 1, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(this.rows - 1, Math.floor(fy)));
    const c1 = Math.min(this.cols - 1, c0 + 1);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const tx = Math.max(0, Math.min(1, fx - c0));
    const ty = Math.max(0, Math.min(1, fy - r0));
    const d = this.data;
    const a = d[r0 * this.cols + c0] + (d[r0 * this.cols + c1] - d[r0 * this.cols + c0]) * tx;
    const b = d[r1 * this.cols + c0] + (d[r1 * this.cols + c1] - d[r1 * this.cols + c0]) * tx;
    return a + (b - a) * ty;
  }

  /** Mean light (for caustics/ray strength). */
  mean(): number {
    let s = 0;
    for (const v of this.data) s += v;
    return s / this.data.length;
  }
}

export interface WaterLook {
  /** Tint laid over the water column. */
  tint: number;
  tintAlpha: number;
  /** Colour of the light (rays, caustics). */
  light: number;
}

/**
 * Water appearance from tank state: wood leaches tannins (amber), green water
 * from suspended algae when algae is very high. Clear healthy water has no tint.
 */
export function waterLook(tank: TankState): WaterLook {
  let wood = 0;
  for (const d of tank.decor) if (getDecor(d.defId).kind === 'wood') wood++;
  const tannin = Math.min(0.16, wood * 0.035 * (60 / Math.max(40, tank.lengthCm)));
  const green = Math.max(0, tank.algae - 0.55) * 0.35;
  // Marine: crystal-clear water under cool actinic-blue reef lighting.
  if (tank.waterType === 'marine') return green > 0.05 ? { tint: 0x4a8a3a, tintAlpha: green, light: 0xe6f4ff } : { tint: 0x1a50c8, tintAlpha: 0.07, light: 0xdcecff };
  if (green > tannin) return { tint: 0x4a8a3a, tintAlpha: green, light: 0xf4ffe0 };
  return { tint: 0x8a5418, tintAlpha: tannin, light: tannin > 0.08 ? 0xfff0cc : 0xfff8e6 };
}

/** Light blocked by floating plants above x, from per-column coverage owners. */
export function shadeFromOwners(owners: Array<string | null>, left: number, right: number): (x: number) => number {
  return (x: number) => {
    const i = Math.floor(((x - left) / (right - left)) * owners.length);
    const id = owners[Math.max(0, Math.min(owners.length - 1, i))];
    return id ? getFloating(id).shade : 0;
  };
}
