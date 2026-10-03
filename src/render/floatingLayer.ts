/**
 * Floating plants in the tank view. Coverage (from the sim) is turned into
 * covered surface columns: each column has a stable random rank from smooth
 * noise, and the lowest-ranked columns are covered first, so mats grow from
 * patches and spread until they carpet the surface. Species share the
 * surface in order. Each covered column draws fronds straddling the
 * waterline (visible from the side and from the air gap above) and roots
 * hanging into the water.
 */
import type Phaser from 'phaser';
import { FLOATING, getFloating } from '../data/catalog';
import type { TankState } from '../sim/types';

const COL_PX = 3; // logical pixels per surface column

function h2(x: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(s | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothNoise(x: number, s: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h2(i, s) + (h2(i + 1, s) - h2(i, s)) * u;
}

export class FloatingLayer {
  /** Species id covering each column, or null. */
  owners: Array<string | null> = [];
  /** Total surface coverage (0..1). */
  private density = 0;
  private key = '';
  private cols: number;
  private ranks: number[];
  private mat: Phaser.GameObjects.Graphics;
  private roots: Phaser.GameObjects.Graphics;
  private shade: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private left: number, right: number, private surface: number, private res: number, seed: number) {
    this.cols = Math.floor((right - left) / (COL_PX * res));
    // Smooth noise ranks: neighbouring columns have similar ranks, so cover clumps.
    const vals = Array.from({ length: this.cols }, (_, i) => ({ i, v: smoothNoise(i / 9, seed) * 0.75 + smoothNoise(i / 2.5, seed + 3) * 0.25 }));
    vals.sort((a, b) => a.v - b.v);
    this.ranks = new Array(this.cols);
    vals.forEach((o, r) => (this.ranks[o.i] = r));
    this.shade = scene.add.graphics().setDepth(9);
    this.roots = scene.add.graphics().setDepth(24);
    this.mat = scene.add.graphics().setDepth(27.5);
  }

  /** Recomputes which columns are covered (cheap; call when cover may have changed). */
  sync(tank: TankState, preview: string | null, previewAmount: number): boolean {
    const cover: Record<string, number> = { ...(tank.floating ?? {}) };
    if (preview) cover[preview] = (cover[preview] ?? 0) + previewAmount;
    const ids = FLOATING.map((f) => f.id).filter((id) => (cover[id] ?? 0) > 0.002);
    const key = ids.map((id) => `${id}:${Math.round(cover[id] * 200)}`).join('|') + `|${preview}`;
    if (key === this.key) return false;
    this.key = key;
    this.owners = new Array(this.cols).fill(null);
    this.density = Math.min(1, ids.reduce((t, id) => t + cover[id], 0));
    let start = 0;
    for (const id of ids) {
      const n = Math.round(Math.min(1, cover[id]) * this.cols);
      for (let c = 0; c < this.cols; c++) if (this.ranks[c] >= start && this.ranks[c] < start + n) this.owners[c] = id;
      start += n;
    }
    return true;
  }

  /** Light blocked at x by the mat above it. */
  shadeAt(x: number): number {
    const i = Math.floor((x - this.left) / (COL_PX * this.res));
    const id = this.owners[Math.max(0, Math.min(this.cols - 1, i))];
    return id ? getFloating(id).shade : 0;
  }

  draw(time: number, flow: number, lightsOn: boolean, rootDetail: number, previewId: string | null): void {
    const R = this.res;
    const step = COL_PX * R;
    this.mat.clear();
    this.roots.clear();
    this.shade.clear();
    const y0 = this.surface - 3 * R;
    const k = lightsOn ? 1 : 0.55;
    for (let c = 0; c < this.cols; c++) {
      const id = this.owners[c];
      if (!id) continue;
      const def = getFloating(id);
      const x = this.left + c * step;
      const drift = Math.sin(time * 0.4 + c * 0.13) * R * flow;
      const bob = Math.sin(time * 1.6 + c * 0.7) * R * 0.5;
      const pv = previewId === id && this.isPreviewColumn(c) ? 0.55 + Math.sin(time * 5) * 0.15 : 1;
      // Shade band under the mat (darkens the water and background behind fish).
      for (let k2 = 0; k2 < 6; k2++) this.shade.fillStyle(0x08121a, 0.05 * def.shade * (1 - k2 / 6)).fillRect(x - step, this.surface + k2 * 9 * R, step * 3, 9 * R);
      const r = h2(c, 99);
      if (def.art === 'duckweed') {
        // Two or three overlapping rows of tiny oval fronds, lit on top.
        // Mat seen edge-on: undersides below the waterline, sunlit tops above it.
        // Dense mats pile up into a thicker, darker ceiling.
        const pile = this.density;
        const rows = [
          ...(pile > 0.6 ? [{ dy: 6, col: 0x2a5a20, w: 1.2 }, { dy: 4.5, col: 0x346a26, w: 1.3 }] : []),
          { dy: 3, col: 0x3a7a28, w: 1.3 },
          { dy: 1.5, col: 0x5aa834, w: 1.4 },
          { dy: 0, col: 0x7cc444, w: 1.3 },
          { dy: -1.5, col: 0x9ad85a, w: 1.1 },
        ];
        for (const [ri, row] of rows.entries()) {
          const fx = x + drift + (ri % 2) * step * 0.5 + (h2(c, ri) - 0.5) * R;
          const fy = y0 + bob + row.dy * R;
          this.mat.fillStyle(scaleCol(row.col, k), pv).fillEllipse(fx + step / 2, fy + 2 * R, step * row.w, 2.6 * R);
          if (h2(c + ri * 31, 5) > 0.55) this.mat.fillStyle(scaleCol(0xc8f890, k), pv).fillRect(fx + step * 0.3, fy + 1.2 * R, R, R);
        }
        if (h2(c, 7) < 0.5 * rootDetail) {
          const len = (3 + r * 7) * R;
          const sway = Math.sin(time * 1.2 + c) * R * 1.2 * flow;
          this.roots.lineStyle(R, scaleCol(0xd8e6d0, k), 0.55 * pv).lineBetween(x + step / 2 + drift, y0 + 4 * R, x + step / 2 + drift + sway, y0 + 4 * R + len);
        }
      } else {
        // Rosettes of round leaves every few columns, with long trailing roots.
        const every = def.art === 'frogbit' ? 5 : 4;
        if (c % every !== 0) {
          this.mat.fillStyle(scaleCol(def.art === 'frogbit' ? 0x3e8a34 : 0x5a8a34, k), 0.85 * pv).fillRect(x, y0 + 2 * R + bob, step, R);
          continue;
        }
        const leafW = (def.art === 'frogbit' ? 15 : 11) * R;
        const cx = x + drift;
        for (let l = 0; l < 3; l++) {
          const lx = cx + (l - 1) * leafW * 0.55 + (h2(c + l, 3) - 0.5) * 3 * R;
          const tilt = (l - 1) * R;
          const base = def.art === 'frogbit' ? 0x3f8f36 : 0x5a9a3a;
          // Leaf seen slightly from below: a pale spongy underside and a glossy top edge.
          this.mat.fillStyle(scaleCol(base, k * 0.7), pv).fillEllipse(lx, y0 + 3 * R + bob + tilt * 0.2, leafW, 4.5 * R);
          this.mat.fillStyle(scaleCol(def.art === 'redroot' ? 0xa84a3a : 0x6aa85a, k), pv).fillEllipse(lx, y0 + 3.8 * R + bob, leafW * 0.7, 2 * R);
          this.mat.fillStyle(scaleCol(base, k * 1.25), pv).fillEllipse(lx - R, y0 + 1.2 * R + bob, leafW * 0.85, 2 * R);
        }
        const rootCol = def.art === 'redroot' ? 0xb84a3a : 0xc8c8b0;
        const nRoots = Math.max(2, Math.round(6 * rootDetail));
        for (let rr = 0; rr < nRoots; rr++) {
          const len = (def.art === 'frogbit' ? 18 + h2(c + rr, 11) * 34 : 10 + h2(c + rr, 11) * 20) * R;
          const rx = cx + (rr - nRoots / 2) * 2 * R;
          let px = rx;
          let py = y0 + 4 * R;
          const segs = 6;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const nx = rx + Math.sin(time * 0.9 + c + rr + t * 2) * R * 3 * t * flow;
            const ny = y0 + 4 * R + len * t;
            this.roots.lineStyle(R, scaleCol(rootCol, k), 0.7 * (1 - t * 0.4) * pv).lineBetween(px, py, nx, ny);
            if (rootDetail > 0.6 && s % 2 === 0) this.roots.lineStyle(R, scaleCol(rootCol, k), 0.3 * pv).lineBetween(nx, ny, nx + (rr % 2 ? 2 : -2) * R, ny + 2 * R);
            px = nx;
            py = ny;
          }
        }
      }
    }
  }

  private previewCols = new Set<number>();
  /** Marks which columns belong to the preview portion (for pulsing). */
  markPreview(tank: TankState, preview: string | null): void {
    this.previewCols.clear();
    if (!preview) return;
    // Columns owned by the previewed species beyond its real cover.
    const real = Math.round(Math.min(1, tank.floating?.[preview] ?? 0) * this.cols);
    let seen = 0;
    const order = [...this.owners.keys()].filter((c) => this.owners[c] === preview).sort((a, b) => this.ranks[a] - this.ranks[b]);
    for (const c of order) {
      if (seen >= real) this.previewCols.add(c);
      seen++;
    }
  }

  private isPreviewColumn(c: number): boolean {
    return this.previewCols.has(c);
  }

  destroy(): void {
    this.mat.destroy();
    this.roots.destroy();
    this.shade.destroy();
  }
}

function scaleCol(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}
