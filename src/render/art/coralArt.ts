/**
 * Coral textures for the tank view. Each coral is painted procedurally as a
 * short sprite sheet (polyps sway between frames): zoanthid button polyps,
 * green star polyps on their purple mat, mushroom discs, a toadstool
 * leather, hammer and torch corals with fleshy tentacles, Montipora plates
 * and branching Acropora. Colour follows the coral's health: it washes out
 * toward white as it bleaches and browns as it declines; polyps retract when
 * conditions are poor. Origin bottom-centre, like hardscape.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import type { DecorDef } from '../../data/catalog';
import type { CoralForm } from '../../data/reef';
import { hexToRgb, mix, shade } from './pixel';
import { relief } from './relief';

export const CORAL_FRAMES = 6;
/** Colonies are drawn larger than their catalogue footprint so they read as reef, not trinkets. */
export const CORAL_DISPLAY = 1.45;

export interface CoralLook {
  def: DecorDef;
  /** Decor scale (render units per reference pixel). */
  scale: number;
  size: number;
  health: number;
  bleach: number;
  /** 0..1 how far polyps are extended. */
  ext: number;
  seed: number;
}

/** Display size multiplier for a coral of this colony size. */
export function coralGrowth(size: number): number {
  return 0.35 + 0.65 * Math.min(2.2, size);
}

const q = (v: number, steps: number) => Math.round(Math.max(0, Math.min(1, v)) * steps) / steps;

export function coralKey(l: CoralLook): string {
  return `coral:${l.def.id}:${l.scale.toFixed(2)}:${Math.round(l.size * 10)}:${q(l.health, 4)}:${q(l.bleach, 4)}:${q(l.ext, 3)}:${l.seed % 5}`;
}

interface Paint {
  ctx: CanvasRenderingContext2D;
  ox: number;
  w: number;
  h: number;
  S: number;
  base: string;
  tip: string;
  ext: number;
  phase: number;
  rng: Rng;
}

function dot(p: Paint, x: number, y: number, c: string, w = 1, h = 1): void {
  if (x + w < 0 || y + h < 0 || x >= p.w || y >= p.h) return;
  p.ctx.fillStyle = c;
  // Sub-pixel rectangles: frames are painted supersampled and filtered down.
  p.ctx.fillRect(p.ox + Math.max(0, x), Math.max(0, y), Math.max(1, Math.min(w, p.w - x)), Math.max(1, h));
}

function disc(p: Paint, cx: number, cy: number, rx: number, ry: number, c: string): void {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (y / Math.max(0.5, ry)) ** 2));
    if (half < 0.3) continue;
    dot(p, cx - half, cy + y, c, half * 2, 1);
  }
}

/** Thick line in pixel steps. */
function line(p: Paint, x0: number, y0: number, x1: number, y1: number, t: number, c: string): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    dot(p, x0 + (x1 - x0) * k - t / 2, y0 + (y1 - y0) * k - t / 2, c, t, t);
  }
}

/** Little rubble/plug the coral sits on. */
function footing(p: Paint, width: number): void {
  const y = p.h - 2 * p.S;
  disc(p, p.w / 2, y, width / 2, 2 * p.S, '#5a5048');
  disc(p, p.w / 2 - p.S, y - p.S * 0.6, width / 2 - p.S, 1.2 * p.S, '#7a6e60');
}

/** Filled ellipse with a per-pixel colour (null skips): nx, ny run -1..1 across it. */
function blob(p: Paint, cx: number, cy: number, rx: number, ry: number, col: (nx: number, ny: number) => string | null): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = col(nx, ny);
      if (c) dot(p, x, y, c);
    }
  }
}

/** Rounded fleshy tentacle from (x0,y0) toward angle `ang`, waving along its length. */
function tentacle(p: Paint, x0: number, y0: number, ang: number, len: number, thick: number, col: string, wave: number): { x: number; y: number } {
  const n = Math.max(3, Math.ceil(len));
  let x = x0;
  let y = y0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = ang + Math.sin(t * 3 + wave) * 0.25 * t;
    x = x0 + Math.cos(a) * len * t;
    y = y0 + Math.sin(a) * len * t;
    const th = thick * (1 - t * 0.25);
    blob(p, x, y, th / 2, th / 2, (nx, ny) => (ny < -0.3 && nx < 0.2 ? shade(col, 0.22) : ny > 0.4 ? shade(col, -0.22) : col));
  }
  return { x, y };
}

function paintForm(form: CoralForm, p: Paint): void {
  const { w, h, S, base, tip, ext, phase, rng } = p;
  const sway = (i: number, amp: number) => Math.sin(phase + i * 1.7) * amp;
  switch (form) {
    case 'zoa': {
      footing(p, w * 0.95);
      // Packed button polyps in two rows over a low dome; back row darker.
      for (const row of [0, 1]) {
        const n = Math.max(4, Math.round(w / ((row ? 5 : 4.4) * S)));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5 + (row ? 0.5 : 0)) / (n + (row ? 0.5 : 0));
          const dome = Math.sin(Math.min(1, t) * Math.PI);
          const x = w * (0.06 + 0.88 * t) + rng.range(-0.8, 0.8) * S;
          const y0 = h - 3 * S - row * 2.2 * S;
          const stalk = (0.8 + dome * (h / S) * 0.22 + rng.range(0, 1)) * S * (0.4 + 0.6 * ext) + row * 1.2 * S;
          const tx = x + sway(i + row * 9, 0.7 * S * ext);
          const ty = y0 - stalk;
          const sc = row ? shade(base, -0.45) : shade(base, -0.3);
          tentacle(p, x, y0, Math.atan2(ty - y0, tx - x), stalk, 3.4 * S, sc, 0);
          const r = (3 + rng.range(0, 0.8)) * S * (0.4 + 0.6 * ext);
          const dim = row ? -0.25 : 0;
          blob(p, tx, ty, r + 0.9 * S, r * 0.72 + 0.6 * S, (_nx, ny) => (ny < -0.45 ? shade(tip, 0.25 + dim) : ny > 0.55 ? shade(tip, -0.2 + dim) : shade(tip, dim)));
          blob(p, tx, ty - 0.2 * S, r * 0.6, r * 0.46, (nx) => (Math.abs(nx) < 0.3 ? shade(base, -0.4 + dim) : shade(base, 0.1 + dim)));
          dot(p, tx - r * 0.7, ty - r * 0.45, shade(tip, 0.55), Math.max(1, S * 0.8), Math.max(1, S * 0.5));
        }
      }
      break;
    }
    case 'gsp': {
      // Purple mat hugging the rock with a dense forest of green stars.
      const matH = Math.max(3 * S, h * 0.3);
      for (let x = 0; x < w; x++) {
        const k = Math.sin((x / w) * Math.PI);
        const top = h - matH * (0.55 + 0.45 * k) - Math.sin(x * 0.6 / S) * 0.6 * S;
        for (let y = Math.floor(top); y < h; y++) dot(p, x, y, y - top < 1.5 * S ? shade(base, 0.2) : (x + y) % 5 === 0 ? shade(base, -0.2) : base);
      }
      const n = Math.round(w / (0.9 * S));
      for (let i = 0; i < n; i++) {
        const x = rng.range(1, w - 2);
        const k = Math.sin((x / w) * Math.PI);
        const y0 = h - matH * (0.55 + 0.45 * k) + S;
        const len = (h - matH) * rng.range(0.3, 1) * ext;
        if (len < S) continue;
        const bend = sway(i, 1.8 * S * ext);
        line(p, x, y0, x + bend, y0 - len, Math.max(1, S * 0.9), mix(tip, base, 0.35));
        const sx = x + bend;
        const sy = y0 - len;
        const r = 1.6 * S;
        for (let a = 0; a < 5; a++) {
          const ang = (a / 5) * Math.PI * 2 + i;
          line(p, sx, sy, sx + Math.cos(ang) * r, sy + Math.sin(ang) * r * 0.6, Math.max(1, S * 0.7), tip);
        }
        dot(p, sx, sy, shade(tip, 0.6), Math.max(1, S * 0.7), Math.max(1, S * 0.7));
      }
      break;
    }
    case 'mushroom': {
      footing(p, w * 0.85);
      const n = 4 + Math.round(rng.range(0, 2));
      const discs = Array.from({ length: n }, (_, i) => ({ t: n === 1 ? 0.5 : i / (n - 1), r: rng.range(6, 9), lift: rng.range(0, 8) * Math.sin(Math.max(0.15, n === 1 ? 0.5 : i / (n - 1)) * Math.PI) }));
      discs.sort((a, b) => b.lift - a.lift);
      for (const [i, d] of discs.entries()) {
        const cx = w * (0.16 + 0.68 * d.t);
        const rx = Math.min(w * 0.26, d.r * S);
        const ry = rx * (0.36 + 0.1 * ext) + Math.sin(phase + i) * 0.25 * S;
        const cy = h - 3 * S - ry * 0.7 - d.lift * 0.5 * S;
        line(p, cx, h - 3 * S, cx, cy + ry * 0.4, Math.max(1, 3 * S), shade(base, -0.45));
        blob(p, cx, cy, rx, ry, (nx, ny) => {
          const rr = Math.hypot(nx, ny);
          const ang = Math.atan2(ny, nx);
          const ridge = Math.sin(ang * 9) > 0.55 && rr > 0.3;
          if (rr > 0.86) return shade(tip, ny < 0 ? 0.25 : -0.1);
          if (ridge) return shade(tip, -0.15 + (1 - rr) * 0.2);
          return shade(base, (ny < 0 ? 0.18 : -0.1) - rr * 0.15);
        });
        blob(p, cx, cy - 0.3 * S, Math.max(1, rx * 0.15), Math.max(1, ry * 0.2), () => shade(tip, 0.5));
      }
      break;
    }
    case 'leather': {
      footing(p, w * 0.5);
      const stemW = w * 0.3;
      const capH = h * 0.36 * (0.85 + 0.15 * ext);
      const capY = h * 0.34 + Math.sin(phase) * 0.6 * S;
      for (let y = Math.floor(capY); y < h - 3 * S; y++) {
        const k = (y - capY) / (h - capY);
        const ww = stemW + k * 5 * S;
        for (let x = 0; x < ww; x++) {
          const v = x / ww;
          const fold = Math.sin(v * 9 + y * 0.15) > 0.7;
          dot(p, w / 2 - ww / 2 + x, y, fold ? shade(base, -0.25) : shade(base, 0.15 - Math.abs(v - 0.35) * 0.5));
        }
      }
      for (let x = 0; x < w; x++) {
        const k = (x - w / 2) / (w / 2);
        const dome = Math.sqrt(Math.max(0, 1 - k * k));
        const lobe = Math.sin(x * 0.45 / S + phase * 0.4) * 1.6 * S * (0.4 + Math.abs(k));
        const top = capY - capH * dome * 0.75;
        const bot = capY + capH * 0.25 + lobe;
        for (let y = Math.floor(top); y <= bot; y++) {
          const v = (y - top) / Math.max(1, bot - top);
          dot(p, x, y, v < 0.15 ? shade(base, 0.35) : v > 0.85 ? shade(base, -0.35) : shade(base, 0.12 - k * 0.12 - v * 0.15));
        }
      }
      // Polyp fuzz over the cap: tiny tufts that open and close.
      const fuzz = Math.round(((w * capH) / (3.5 * S * S)) * ext);
      for (let i = 0; i < fuzz; i++) {
        const x = rng.range(w * 0.06, w * 0.94);
        const k = (x - w / 2) / (w / 2);
        const top = capY - capH * Math.sqrt(Math.max(0, 1 - k * k)) * 0.75;
        const y = top + rng.range(0, capH * 0.5);
        dot(p, x, y - S * ext, tip, Math.max(1, S * 0.6), Math.max(1, S * (0.5 + ext)));
      }
      break;
    }
    case 'hammer':
    case 'torch': {
      const torch = form === 'torch';
      footing(p, w * 0.55);
      const heads = 3 + Math.round(rng.range(0, 1.5));
      // Skeleton first, then the fleshy heads from back to front.
      const hs = Array.from({ length: heads }, (_, i) => {
        const t = heads === 1 ? 0.5 : i / (heads - 1);
        return { bx: w * (0.24 + 0.52 * t), by: h - (torch ? 9 : 8) * S - rng.range(0, 4) * S, i };
      });
      for (const hd of hs) line(p, w / 2, h - 3 * S, hd.bx, hd.by + 2 * S, Math.max(1, 3 * S), '#6a6458');
      for (const hd of hs) {
        const n = torch ? 16 : 22;
        for (const back of [true, false]) {
          for (let k = 0; k < n; k++) {
            if ((k % 2 === 0) !== back) continue;
            const spread = torch ? 2.9 : 3.5;
            const ang = -Math.PI / 2 + (k / (n - 1) - 0.5) * spread + sway(hd.i * 5 + k, torch ? 0.22 : 0.12) * ext;
            const len = (torch ? rng.range(10, 17) : rng.range(6, 10)) * S * (0.45 + 0.55 * ext);
            const col = back ? shade(base, -0.25) : base;
            const end = tentacle(p, hd.bx, hd.by, ang, len, (torch ? 2.2 : 3) * S, col, phase + k);
            if (torch) blob(p, end.x, end.y, 1.6 * S, 1.6 * S, (nx, ny) => (nx < 0 && ny < 0 ? shade(tip, 0.45) : tip));
            else {
              const px2 = Math.cos(ang + Math.PI / 2) * 2.4 * S;
              const py2 = Math.sin(ang + Math.PI / 2) * 2.4 * S;
              line(p, end.x - px2, end.y - py2, end.x + px2, end.y + py2, Math.max(1, 2 * S), back ? shade(tip, -0.2) : tip);
              dot(p, end.x - px2 * 0.6, end.y - py2 * 0.6, shade(tip, 0.5), Math.max(1, S * 0.8), Math.max(1, S * 0.8));
            }
          }
        }
      }
      break;
    }
    case 'plate': {
      footing(p, w * 0.45);
      // Whorled plates like a rose: each a thick, cupped disc with a bright growing rim.
      const plates = 4 + Math.round(rng.range(0, 1.5));
      for (let i = 0; i < plates; i++) {
        const t = i / Math.max(1, plates - 1);
        const rx = w * (0.47 - t * 0.24) * rng.range(0.85, 1);
        const ry = rx * (0.24 + t * 0.12);
        const cx = w / 2 + (i % 2 ? 1 : -1) * w * 0.13 * (1 - t * 0.6);
        const cy = h - 5 * S - t * (h - 12 * S);
        const thick = 3.2 * S;
        blob(p, cx, cy + thick * 0.6, rx, ry, () => shade(base, -0.4));
        blob(p, cx, cy, rx, ry, (nx, ny) => {
          const rr = Math.hypot(nx, ny);
          if (rr > 0.88) return shade(tip, ny < 0 ? 0.3 : 0);
          const gx = Math.floor((nx + 1) * rx / (1.5 * S));
          const gy = Math.floor((ny + 1) * ry / (1.5 * S));
          const polyp = ext > 0.4 && ((gx * 7 + gy * 13 + i * 5) % 9 === 0);
          return polyp ? shade(base, 0.35) : shade(base, 0.12 - ny * 0.18 - rr * 0.1);
        });
      }
      break;
    }
    case 'acro': {
      footing(p, w * 0.5);
      const branch = (x: number, y: number, ang: number, len: number, thick: number, depth: number): void => {
        const ex = x + Math.cos(ang) * len;
        const ey = y + Math.sin(ang) * len;
        const col = mix(shade(base, -0.25), base, Math.min(1, depth / 3));
        line(p, x, y, ex, ey, Math.max(1, thick), col);
        line(p, x - thick * 0.3, y, ex - thick * 0.3, ey, Math.max(1, thick * 0.3), shade(col, 0.3));
        // Radial corallites along the branch.
        if (ext > 0.3) for (let k = 1; k < 4; k++) {
          const cxk = x + (ex - x) * (k / 4) + ((k + Math.floor(phase)) % 2 ? 1 : -1) * thick * 0.55;
          dot(p, cxk, y + (ey - y) * (k / 4), shade(base, 0.45), Math.max(1, S * 0.7), Math.max(1, S * 0.7));
        }
        if (depth >= 4 || len < 3 * S) {
          dot(p, ex - thick / 2, ey - 1.4 * S, tip, Math.max(1, thick), Math.max(1, 2.2 * S));
          dot(p, ex - S * 0.4, ey - 1.6 * S, '#ffffff', Math.max(1, S * 0.8), Math.max(1, S * 0.8));
          return;
        }
        const kids = 2 + (rng.chance(0.45) ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const spread = (k / (kids - 1 || 1) - 0.5) * 1.15 + rng.range(-0.15, 0.15);
          branch(ex, ey, ang + spread, len * rng.range(0.62, 0.8), thick * 0.8, depth + 1);
        }
      };
      const trunks = 3;
      for (let i = 0; i < trunks; i++) branch(w * (0.3 + 0.4 * (i / (trunks - 1))), h - 3 * S, -Math.PI / 2 + (i - 1) * 0.45, h * 0.3, 4 * S, 0);
      break;
    }
  }
}

/** Supersampling factor for coral frames (painted large, filtered down). */
const SS = 2;

/**
 * Builds (or reuses) the sheet for a coral's current look. Frames are painted
 * at SS times the size and filtered down (soft, anti-aliased tissue), then
 * relit as micro-relief so polyps, ridges and skeleton read as solid living
 * tissue; drawn with linear filtering. `w`/`h` are in texture pixels.
 */
export function ensureCoralTexture(scene: Phaser.Scene, look: CoralLook): { key: string; w: number; h: number } {
  const key = `${coralKey(look)}:v2`;
  const g = coralGrowth(look.size);
  const w = Math.max(6, Math.round(look.def.width * look.scale * g * CORAL_DISPLAY));
  const h = Math.max(6, Math.round(look.def.height * look.scale * g * CORAL_DISPLAY));
  if (scene.textures.exists(key)) return { key, w, h };
  const t = look.def.coral!;
  const ill = (c: string) => mix(mix(c, '#f4f2ee', look.bleach * 0.85), '#7a6a4a', (1 - look.health) * 0.45);
  const fw = w + 1;
  const tex = scene.textures.createCanvas(key, fw * CORAL_FRAMES, h)!;
  const ctx = tex.getContext();
  const big = document.createElement('canvas');
  big.width = w * SS;
  big.height = h * SS;
  const bctx = big.getContext('2d')!;
  // Detail scale: canvas pixels per reference pixel, a little smaller on young colonies.
  const S = Math.max(1, (w / look.def.width) * 0.9) * SS;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let f = 0; f < CORAL_FRAMES; f++) {
    bctx.clearRect(0, 0, big.width, big.height);
    paintForm(t.form, {
      ctx: bctx, ox: 0, w: w * SS, h: h * SS, S,
      base: ill(t.colours.base), tip: ill(t.colours.tip), ext: look.ext,
      phase: (f / CORAL_FRAMES) * Math.PI * 2, rng: new Rng(look.seed * 31 + 7),
    });
    ctx.drawImage(big, 0, 0, big.width, big.height, f * fw, 0, w, h);
  }
  const img = ctx.getImageData(0, 0, fw * CORAL_FRAMES, h);
  relief({ w: fw * CORAL_FRAMES, h, data: img.data }, 0.45, look.seed, look.scale / 2);
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (let f = 0; f < CORAL_FRAMES; f++) tex.add(String(f), 0, f * fw, 0, w, h);
  return { key, w, h };
}

/** The coral's fluorescent colour under actinic light. */
export function coralGlow(def: DecorDef): number {
  const [r, g, b] = hexToRgb(def.coral?.colours.glow ?? '#ffffff');
  return (r << 16) | (g << 8) | b;
}
