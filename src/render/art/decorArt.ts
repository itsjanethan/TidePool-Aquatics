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
          fillEllipse(ctx, cx, h - ry - 1, rx, ry, (x, y, e) => (e ? shade(base, -0.35) : y < -0.3 && x < 0.2 ? shade(base, 0.25) : base));
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
          e ? shade(base, -0.35) : y < -0.4 ? shade(base, 0.15) : (Math.abs(x * 13 + y * 7) % 3 < 0.4 ? shade(base, -0.1) : base),
        );
        for (let i = 0; i < 6; i++) {
          const hx = Math.round(w * rng.range(0.2, 0.8));
          const hy = Math.round(h * rng.range(0.3, 0.8));
          const r = rng.int(1, 3);
          fillEllipse(ctx, hx, hy, r + 1, r, () => '#3a3428');
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
          const thick0 = def.art === 'mopani' ? rng.int(4, 7) : rng.int(2, 4);
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
        fillEllipse(ctx, Math.round(w / 2), Math.round(h / 2), Math.round(w / 2) - 1, Math.round(h / 2) - 1, (_x, y, e) => (e ? shade(base, -0.4) : y < -0.3 ? shade(base, 0.2) : base));
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
  dark: number;
  phase: number;
  swayAmp: number;
  kind: 'blade' | 'ribbon' | 'oval' | 'stem';
}

export interface PlantModel {
  leaves: Leaf[];
  height: number;
  width: number;
}

export function buildPlant(def: DecorDef, scale: number, seed: number, health: number): PlantModel {
  const rng = new Rng(seed);
  const H = def.height * scale;
  const W = def.width * scale;
  const leaves: Leaf[] = [];
  const sick = (c: string) => hexToInt(mix(c, '#9a8a4a', Math.max(0, 0.75 - health) * 1.2));
  switch (def.art) {
    case 'fern':
      for (let i = 0; i < 8; i++) {
        const c = rng.pick(['#2f6b3a', '#3f8a46', '#357a3e']);
        leaves.push({ bx: rng.range(-W * 0.2, W * 0.2), length: H * rng.range(0.55, 1), width: rng.range(2.5, 4.5) * scale + 1, lean: rng.range(-0.55, 0.55), curve: rng.range(-0.3, 0.3), colour: sick(c), dark: sick(shade(c, -0.35)), phase: rng.range(0, 6), swayAmp: 1.5, kind: 'blade' });
      }
      break;
    case 'sword':
      for (let i = 0; i < 10; i++) {
        const c = rng.pick(['#4caf50', '#5cbf5a', '#3f9a45']);
        const lean = (i / 9 - 0.5) * 1.4 + rng.range(-0.1, 0.1);
        leaves.push({ bx: rng.range(-2, 2), length: H * rng.range(0.6, 1) * (1 - Math.abs(lean) * 0.3), width: rng.range(4, 7) * scale + 1, lean, curve: lean * 0.4, colour: sick(c), dark: sick(shade(c, -0.35)), phase: rng.range(0, 6), swayAmp: 1.2, kind: 'blade' });
      }
      break;
    case 'vallis':
      for (let i = 0; i < 12; i++) {
        const c = rng.pick(['#6abf4a', '#5aaf42', '#7acc58']);
        leaves.push({ bx: rng.range(-W * 0.45, W * 0.45), length: H * rng.range(0.6, 1.05), width: 2, lean: rng.range(-0.15, 0.15), curve: rng.range(-0.2, 0.2), colour: sick(c), dark: sick(shade(c, -0.3)), phase: rng.range(0, 6), swayAmp: 6, kind: 'ribbon' });
      }
      break;
    case 'hornwort':
      for (let i = 0; i < 4; i++) {
        const c = '#5aa040';
        leaves.push({ bx: rng.range(-W * 0.35, W * 0.35), length: H * rng.range(0.6, 1), width: 1, lean: rng.range(-0.2, 0.2), curve: rng.range(-0.2, 0.2), colour: sick(c), dark: sick('#3a7a2a'), phase: rng.range(0, 6), swayAmp: 3, kind: 'stem' });
      }
      break;
    case 'anubias':
      for (let i = 0; i < 6; i++) {
        const c = rng.pick(['#2e5e34', '#376c3c']);
        const lean = (i / 5 - 0.5) * 1.8;
        leaves.push({ bx: rng.range(-3, 3), length: H * rng.range(0.6, 1), width: rng.range(5, 8) * scale + 1, lean, curve: 0, colour: sick(c), dark: sick(shade(c, -0.4)), phase: rng.range(0, 6), swayAmp: 0.6, kind: 'oval' });
      }
      break;
    default:
      break;
  }
  return { leaves, height: H, width: W };
}

/** Draws a plant into a Graphics object at (x, baseY). */
export function drawPlant(g: Phaser.GameObjects.Graphics, plant: PlantModel, x: number, baseY: number, time: number, flow: number): void {
  for (const leaf of plant.leaves) {
    const segs = Math.max(4, Math.round(leaf.length));
    let lx = x + leaf.bx;
    let ly = baseY;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const sway = Math.sin(time * 1.2 + leaf.phase + t * 2.2) * leaf.swayAmp * t * t * (0.6 + flow);
      const dx = leaf.lean + leaf.curve * t * 2;
      lx += dx;
      ly -= 1 - Math.abs(dx) * 0.15;
      const px0 = Math.round(lx + sway);
      const py0 = Math.round(ly);
      let w: number;
      if (leaf.kind === 'blade') w = Math.max(1, Math.round(leaf.width * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05))));
      else if (leaf.kind === 'oval') w = t < 0.35 ? 1 : Math.max(1, Math.round(leaf.width * Math.sin(Math.PI * ((t - 0.35) / 0.65))));
      else w = 1;
      if (leaf.kind === 'stem') {
        g.fillStyle(leaf.dark, 1);
        g.fillRect(px0, py0, 1, 1);
        if (s % 3 === 0) {
          g.fillStyle(leaf.colour, 1);
          g.fillRect(px0 - 3, py0, 2, 1);
          g.fillRect(px0 + 2, py0, 2, 1);
          g.fillRect(px0 - 2, py0 - 1, 1, 1);
          g.fillRect(px0 + 2, py0 - 1, 1, 1);
        }
        continue;
      }
      g.fillStyle(leaf.colour, 1);
      g.fillRect(px0 - Math.floor(w / 2), py0, w, 1);
      if (w >= 3) {
        g.fillStyle(leaf.dark, 1);
        g.fillRect(px0, py0, 1, 1);
      }
    }
  }
}
