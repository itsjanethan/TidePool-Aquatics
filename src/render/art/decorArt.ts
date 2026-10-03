/**
 * Procedural aquarium decor: static hardscape textures plus animated plants
 * described as swaying leaves drawn every frame with Graphics.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import type { DecorDef } from '../../data/catalog';
import { hexToInt, makeTexture, mix, px, shade, type Ctx } from './pixel';

function fillEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, colour: (x: number, y: number, edge: boolean) => string | null): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1) continue;
      const edge = d > 0.78;
      const c = colour(x / rx, y / ry, edge);
      if (c) px(ctx, cx + x, cy + y, c);
    }
  }
}

/** Rounded-object lighting from the top-left for pebbles, rock and clay. */
function ballShade(base: string, x: number, y: number, edge: boolean, grain: number): string {
  const nz = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const light = 0.6 * nz - 0.35 * x - 0.5 * y;
  let c = shade(base, Math.max(-0.45, Math.min(0.4, light * 0.45 - 0.08 + grain)));
  if (edge && y > -0.2) c = shade(c, -0.22);
  return c;
}

export function decorTextureKey(def: DecorDef, scale: number): string {
  return `decor:${def.art}:${scale.toFixed(2)}`;
}

/** Hardscape (non-plant) texture; origin should be bottom-centre. */
export function ensureHardscapeTexture(scene: Phaser.Scene, def: DecorDef, scale: number): { key: string; w: number; h: number } {
  const key = decorTextureKey(def, scale);
  const w = Math.round(def.width * scale);
  const h = Math.round(def.height * scale);
  if (scene.textures.exists(key)) return { key, w, h };
  const rng = new Rng(def.id.length * 977 + w);
  makeTexture(scene, key, w, h, (ctx) => {
    switch (def.art) {
      case 'stones': {
        const n = 4;
        for (let i = 0; i < n; i++) {
          const rx = Math.round(w * rng.range(0.12, 0.2));
          const ry = Math.round(rx * rng.range(0.55, 0.8));
          const cx = Math.round(w * (0.15 + (i / (n - 1)) * 0.7));
          const base = rng.pick(['#9a948a', '#7f8a8e', '#b4a890', '#8a7e70']);
          fillEllipse(ctx, cx, h - ry - 1, rx, ry, (x, y, e) => ballShade(base, x, y, e, (rng.next() - 0.5) * 0.08));
        }
        break;
      }
      case 'slate': {
        let y = h - 1;
        let layer = 0;
        while (y > h * 0.1) {
          const lh = Math.max(3, Math.round(h * rng.range(0.13, 0.2)));
          const inset = Math.round(w * (0.05 + layer * 0.06 + rng.range(0, 0.05)));
          const base = layer % 2 ? '#5a6672' : '#4c5862';
          px(ctx, inset, y - lh, shade(base, -0.3), w - inset * 2, lh);
          px(ctx, inset + 1, y - lh + 1, base, w - inset * 2 - 2, lh - 2);
          px(ctx, inset + 1, y - lh + 1, shade(base, 0.25), w - inset * 2 - 2, 1);
          if (layer === 0) px(ctx, Math.round(w * 0.4), y - lh + 1, '#14181c', Math.round(w * 0.22), lh - 1);
          y -= lh - 1;
          layer++;
        }
        break;
      }
      case 'limestone': {
        const base = '#d8d2c0';
        fillEllipse(ctx, Math.round(w / 2), Math.round(h * 0.55), Math.round(w * 0.47), Math.round(h * 0.45), (x, y, e) =>
          ballShade(base, x, y, e, (rng.next() - 0.5) * 0.12),
        );
        for (let k = 0; k < 7; k++) {
          const hx = Math.round(w * rng.range(0.2, 0.8));
          const hy = Math.round(h * rng.range(0.3, 0.8));
          const r = Math.max(1, Math.round(rng.range(1, 3) * (w / 46)));
          fillEllipse(ctx, hx, hy, r + 1, r, (_x, y) => (y < -0.3 ? '#8a8470' : '#3a3428'));
        }
        break;
      }
      case 'mopani':
      case 'spiderwood': {
        const dark = def.art === 'mopani' ? '#4a2e1c' : '#7a5a3a';
        const light = def.art === 'mopani' ? '#b8864e' : '#c8a678';
        const branches = def.art === 'mopani' ? 4 : 7;
        for (let b = 0; b < branches; b++) {
          let x = w * rng.range(0.25, 0.75);
          let y = h - 2;
          const dir = rng.range(-1.2, 1.2);
          const len = h * rng.range(def.art === 'mopani' ? 0.5 : 0.6, 1.0);
          const thick0 = (def.art === 'mopani' ? rng.int(4, 7) : rng.int(2, 4)) * Math.max(1, scale * 0.85);
          for (let s = 0; s < len; s++) {
            const t = s / len;
            const th = Math.max(1, Math.round(thick0 * (1 - t * 0.75)));
            x += dir * 0.35 + Math.sin(s * 0.3 + b) * 0.25;
            y -= 1;
            for (let k = 0; k < th; k++) {
              const c = (k + Math.floor(s / 5)) % 4 === 0 ? light : k === 0 ? shade(dark, -0.3) : mix(dark, light, (k / th) * 0.6);
              px(ctx, x + k - th / 2, y, c);
            }
          }
        }
        // root base
        px(ctx, w * 0.2, h - 4, dark, w * 0.6, 4);
        px(ctx, w * 0.22, h - 4, light, w * 0.5, 1);
        break;
      }
      case 'claycave': {
        const base = '#b85c34';
        fillEllipse(ctx, Math.round(w / 2), Math.round(h / 2), Math.round(w / 2) - 1, Math.round(h / 2) - 1, (x, y, e) => ballShade(base, x * 0.6, y, e, (rng.next() - 0.5) * 0.06));
        fillEllipse(ctx, Math.round(w * 0.82), Math.round(h / 2), Math.max(2, Math.round(h * 0.22)), Math.max(2, Math.round(h * 0.32)), () => '#2a1408');
        break;
      }
      case 'coconut': {
        const base = '#6a4226';
        for (let y = 0; y < h; y++) {
          const t = y / h;
          const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))));
          for (let x = -half; x <= half; x++) {
            const edge = Math.abs(x) >= half - 1 || y === 0;
            const fib = (x * 3 + y * 5) % 7 === 0;
            px(ctx, w / 2 + x, h - 1 - (h - 1 - y), edge ? '#3a2214' : fib ? '#8a5a36' : base);
          }
        }
        // doorway
        fillEllipse(ctx, Math.round(w / 2), h - 2, Math.max(2, Math.round(w * 0.18)), Math.max(2, Math.round(h * 0.4)), (_x, y) => (y > 0.6 ? null : '#1a0e06'));
        break;
      }
      default:
        px(ctx, 0, 0, '#888', w, h);
    }
  });
  return { key, w, h };
}

// ---------------------------------------------------------------------------
// Plants

export interface Leaf {
  /** Base offset from plant origin (x px). */
  bx: number;
  length: number;
  width: number;
  /** Lean: horizontal travel per unit height. */
  lean: number;
  curve: number;
  colour: number;
  light: number;
  dark: number;
  phase: number;
  swayAmp: number;
  kind: 'blade' | 'ribbon' | 'oval' | 'stem';
}

export interface PlantModel {
  leaves: Leaf[];
  height: number;
  width: number;
  /** Pixel scale the model was built at (1 = logical pixels). */
  px: number;
}

/**
 * Builds a plant from its definition. `size` is the growth stage (1 = mature):
 * cuttings have a few short leaves, mature plants a full crown, overgrown
 * plants more and longer leaves that trail along the surface.
 */
export function buildPlant(def: DecorDef, scale: number, seed: number, health: number, size = 1): PlantModel {
  const rng = new Rng(seed);
  const growth = Math.max(0.25, Math.min(1.8, size));
  const H = def.height * scale * (0.3 + 0.7 * growth);
  const W = def.width * scale * (0.5 + 0.5 * Math.min(growth, 1.4));
  const leaves: Leaf[] = [];
  const countMul = Math.max(0.3, Math.min(1.5, growth));
  const tint = (c: string) => mix(c, '#9a8a4a', Math.max(0, 0.75 - health) * 1.2);
  const add = (base: string, l: Omit<Leaf, 'colour' | 'light' | 'dark'>) =>
    leaves.push({ ...l, colour: hexToInt(tint(base)), light: hexToInt(tint(shade(base, 0.22))), dark: hexToInt(tint(shade(base, -0.38))) });
  const n = (k: number) => Math.max(2, Math.round(k * countMul));
  switch (def.art) {
    case 'fern':
      for (let i = 0; i < n(8); i++) add(rng.pick(['#2f6b3a', '#3f8a46', '#357a3e']), { bx: rng.range(-W * 0.2, W * 0.2), length: H * rng.range(0.55, 1), width: rng.range(2.5, 4.5) * scale + 1, lean: rng.range(-0.55, 0.55), curve: rng.range(-0.3, 0.3), phase: rng.range(0, 6), swayAmp: 1.5 * scale, kind: 'blade' });
      break;
    case 'sword':
      for (let i = 0, m = n(10); i < m; i++) {
        const lean = (i / Math.max(1, m - 1) - 0.5) * 1.4 + rng.range(-0.1, 0.1);
        add(rng.pick(['#4caf50', '#5cbf5a', '#3f9a45']), { bx: rng.range(-2, 2) * scale, length: H * rng.range(0.6, 1) * (1 - Math.abs(lean) * 0.3), width: rng.range(4, 7) * scale + 1, lean, curve: lean * 0.4, phase: rng.range(0, 6), swayAmp: 1.2 * scale, kind: 'blade' });
      }
      break;
    case 'vallis':
      for (let i = 0; i < n(12); i++) add(rng.pick(['#6abf4a', '#5aaf42', '#7acc58']), { bx: rng.range(-W * 0.45, W * 0.45), length: H * rng.range(0.6, 1.05), width: 2 * scale, lean: rng.range(-0.15, 0.15), curve: rng.range(-0.2, 0.2), phase: rng.range(0, 6), swayAmp: 6 * scale, kind: 'ribbon' });
      break;
    case 'hornwort':
      for (let i = 0; i < n(4); i++) add('#5aa040', { bx: rng.range(-W * 0.35, W * 0.35), length: H * rng.range(0.6, 1), width: 1 * scale, lean: rng.range(-0.2, 0.2), curve: rng.range(-0.2, 0.2), phase: rng.range(0, 6), swayAmp: 3 * scale, kind: 'stem' });
      break;
    case 'anubias':
      for (let i = 0, m = n(6); i < m; i++) {
        const lean = (i / Math.max(1, m - 1) - 0.5) * 1.8;
        add(rng.pick(['#2e5e34', '#376c3c']), { bx: rng.range(-3, 3) * scale, length: H * rng.range(0.6, 1), width: rng.range(5, 8) * scale + 1, lean, curve: 0, phase: rng.range(0, 6), swayAmp: 0.6 * scale, kind: 'oval' });
      }
      break;
    default:
      break;
  }
  return { leaves, height: H, width: W, px: scale };
}

/**
 * Draws a plant into a Graphics object at (x, baseY). Leaves are shaded (lit
 * edge, darker edge and midrib) and sway with the water flow. Leaves that
 * reach `surfaceY` trail along the surface like an overgrown plant.
 */
export function drawPlant(
  g: Phaser.GameObjects.Graphics, plant: PlantModel, x: number, baseY: number, time: number, flow: number, alpha = 1, surfaceY = -Infinity,
): void {
  const step = Math.max(1, Math.round(plant.px));
  for (const leaf of plant.leaves) {
    const segs = Math.max(4, Math.round(leaf.length / step));
    let lx = x + leaf.bx;
    let ly = baseY;
    let trailing = false;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const sway = Math.sin(time * 1.2 + leaf.phase + t * 2.2) * leaf.swayAmp * t * t * (0.6 + flow);
      const dx = (leaf.lean + leaf.curve * t * 2) * step;
      if (!trailing) {
        lx += dx;
        ly -= step * (1 - Math.abs(dx / step) * 0.15);
        if (ly <= surfaceY + 2 * step) trailing = true;
      } else {
        lx += Math.sign(leaf.lean || 1) * step;
      }
      const px0 = Math.round(lx + (trailing ? 0 : sway));
      const py0 = Math.round(trailing ? surfaceY + 2 * step + Math.sin(time + s) * step * 0.5 : ly);
      let w: number;
      if (leaf.kind === 'blade') w = Math.max(step, Math.round(leaf.width * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05))));
      else if (leaf.kind === 'oval') w = t < 0.35 ? step : Math.max(step, Math.round(leaf.width * Math.sin(Math.PI * ((t - 0.35) / 0.65))));
      else w = leaf.width;
      if (leaf.kind === 'stem') {
        g.fillStyle(leaf.dark, alpha).fillRect(px0, py0, step, step);
        if (s % 3 === 0) {
          const nl = 3 * step;
          g.fillStyle(leaf.colour, alpha);
          g.fillRect(px0 - nl, py0, nl - step, step);
          g.fillRect(px0 + 2 * step, py0, nl - step, step);
          g.fillStyle(leaf.light, alpha);
          g.fillRect(px0 - nl + step, py0 - step, step, step);
          g.fillRect(px0 + nl, py0 - step, step, step);
        }
        continue;
      }
      const left = px0 - Math.floor(w / 2);
      g.fillStyle(leaf.colour, alpha).fillRect(left, py0, w, step);
      if (w >= 3 * step) {
        // Lit upper edge, shadowed lower edge, midrib.
        g.fillStyle(leaf.light, alpha).fillRect(left, py0, Math.max(step, Math.floor(w * 0.35)), step);
        g.fillStyle(leaf.dark, alpha).fillRect(left + w - step, py0, step, step);
        g.fillStyle(leaf.dark, alpha * 0.8).fillRect(px0, py0, step, step);
      } else if (leaf.kind === 'ribbon' && s % 2 === 0) {
        g.fillStyle(leaf.light, alpha).fillRect(left, py0, step, step);
      }
    }
  }
}
