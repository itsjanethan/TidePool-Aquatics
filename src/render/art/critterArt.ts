/**
 * Invertebrate sprites (shrimp, snails, hermit crabs), painted from species
 * and morph colours into small walk-cycle sheets. Pixel buffers only (no
 * DOM), so the same painter makes tank sprites and UI portraits. Side view,
 * head to the right, like the fish sheets.
 */
import type { BodyShape, ColourMorph } from '../../data/speciesTypes';

export const CRITTER_FRAMES = 4;
export type CritterKind = 'shrimp' | 'snail' | 'crab';

export function isCritterShape(shape: BodyShape): shape is CritterKind {
  return shape === 'shrimp' || shape === 'snail' || shape === 'crab';
}

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (c: RGB, k: number): RGB => (k >= 1 ? mixC(c, [255, 255, 255], Math.min(1, k - 1)) : [c[0] * k, c[1] * k, c[2] * k]);

class Buf {
  data: Uint8ClampedArray<ArrayBuffer>;
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  }
  set(x: number, y: number, c: RGB, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1, t = 1): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      for (let dx = 0; dx < t; dx++) for (let dy = 0; dy < t; dy++) this.set(x0 + (x1 - x0) * k + dx - t / 2, y0 + (y1 - y0) * k + dy - t / 2, c, a);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, shadeFn: (nx: number, ny: number) => [RGB, number] | null): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const r = shadeFn(nx, ny);
        if (r) this.set(x, y, r[0], r[1]);
      }
    }
  }
}

export interface CritterSheet {
  width: number;
  height: number;
  /** Body length in px (for placement). */
  bodyLen: number;
  frames: Array<Uint8ClampedArray<ArrayBuffer>>;
}

export interface CritterColours {
  body: string;
  belly: string;
  fin: string;
  accent: string;
  pattern: string;
}

export function critterColours(m: ColourMorph): CritterColours {
  return { body: m.body, belly: m.belly, fin: m.fin, accent: m.accent, pattern: m.pattern };
}

function paintShrimp(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const accent = hex(c.accent);
  const x0 = b.w * 0.18;
  const groundY = b.h - 2;
  const top = groundY - L * 0.42;
  // Body axis: a gentle arch from tail (left) to head (right).
  const yAt = (t: number) => top + L * 0.16 + Math.sin(t * Math.PI) * -L * 0.06 + (1 - t) * L * 0.06;
  const hAt = (t: number) => L * (t > 0.62 ? 0.15 : 0.06 + t * 0.15);
  const segs = 6;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = x0 + t * L;
    const yc = yAt(t);
    const half = hAt(t);
    const seg = Math.floor(t * 10);
    for (let y = -half; y <= half; y++) {
      const v = y / half;
      const shadeK = 1.1 - v * 0.35;
      let col = mixC(body, belly, Math.max(0, v) * 0.5);
      if (c.pattern === 'bands' && t < 0.62 && seg % 2 === 0) col = accent;
      if (c.pattern === 'bands' && t >= 0.62 && t < 0.8) col = accent;
      if (c.pattern === 'lateral' && v < -0.15) col = mixC(hex(c.fin), [200, 40, 30], 0.3);
      if (c.pattern === 'lateral' && Math.abs(v + 0.15) < 0.12) col = [250, 250, 250];
      if (c.pattern === 'spots' && (Math.round(x) + Math.round(y) * 3) % 7 === 0) col = accent;
      b.set(x, yc + y, lit(col, shadeK), dead ? 0.6 : 0.88);
    }
    // Segment joints on the abdomen.
    if (t < 0.6 && t > 0.05 && i % Math.round(60 * 0.62 / segs) === 0) b.line(x, yc - half, x, yc + half * 0.3, lit(body, 0.75), 0.3);
  }
  // Glossy highlight along the back.
  for (let i = 5; i < 58; i++) b.set(x0 + (i / 60) * L, yAt(i / 60) - hAt(i / 60) + 1, [255, 255, 255], 0.35);
  // Tail fan.
  const tx = x0;
  const ty = yAt(0);
  b.line(tx, ty, tx - L * 0.12, ty - L * 0.08, lit(hex(c.fin), 1.05), 0.85, 2);
  b.line(tx, ty, tx - L * 0.13, ty + L * 0.02, lit(hex(c.fin), 0.95), 0.85, 2);
  // Head: rostrum, eye, antennae.
  const hx = x0 + L;
  const hy = yAt(1);
  b.line(hx - 1, hy - 1, hx + L * 0.12, hy - L * 0.04, lit(body, 1.1), 0.9);
  b.set(hx - L * 0.04, hy - L * 0.03, [10, 10, 14]);
  b.set(hx - L * 0.04 + 1, hy - L * 0.03, [10, 10, 14]);
  b.set(hx - L * 0.04, hy - L * 0.03 - 1, [230, 230, 230], 0.8);
  const ant = c.pattern === 'lateral' ? 1.2 : 0.85;
  const wav = Math.sin(frame * 1.6) * L * 0.03;
  const antCol: RGB = c.pattern === 'lateral' ? [250, 250, 250] : lit(body, 1.15);
  b.line(hx, hy, hx + L * 0.35 * ant, hy - L * 0.35 * ant + wav, antCol, 0.8);
  b.line(hx, hy + 1, hx + L * 0.45 * ant, hy - L * 0.12 + wav, antCol, 0.6);
  // Walking legs (under the carapace) and swimmerets (under the abdomen).
  for (let k = 0; k < 5; k++) {
    const lx = x0 + L * (0.66 + k * 0.065);
    const ly = yAt(0.66 + k * 0.065) + hAt(0.7) * 0.6;
    const step = Math.sin(frame * (Math.PI / 2) + k * 1.3) * L * 0.035;
    if (dead) b.line(lx, ly, lx + 2, ly - L * 0.1, lit(body, 0.9), 0.5);
    else b.line(lx, ly, lx + step, groundY, lit(body, 0.95), 0.55);
  }
  for (let k = 0; k < 4; k++) {
    const lx = x0 + L * (0.15 + k * 0.11);
    const ly = yAt(0.15 + k * 0.11) + hAt(0.2) * 0.8;
    b.line(lx, ly, lx - L * 0.02 + Math.sin(frame + k) * 1, ly + L * 0.035, lit(hex(c.fin), 1), 0.45);
  }
}

function shellSpiral(b: Buf, cx: number, cy: number, r: number, c: CritterColours): void {
  const main = hex(c.body);
  const accent = hex(c.accent);
  b.ellipse(cx, cy, r, r * 0.92, (nx, ny) => {
    const d = Math.hypot(nx, ny);
    const ang = Math.atan2(ny, nx);
    // Spiral suture: whorls shrink toward the apex at upper left.
    const spiral = (ang / (Math.PI * 2) + d * 1.6) % 1;
    let col = main;
    if (c.pattern === 'stripes' && Math.sin(ang * 9 + d * 14) > 0.35) col = accent;
    if (c.pattern === 'bars' && Math.sin(ang * 6) > 0.5) col = accent;
    if (c.pattern === 'speckle' && Math.sin(nx * 31) * Math.sin(ny * 27) > 0.6) col = accent;
    const k = 1.15 - (nx * 0.25 + ny * 0.45) - d * 0.15;
    const suture = spiral < 0.06 && d > 0.25 ? 0.6 : 1;
    return [lit(col, k * suture), 1];
  });
  // Apex and a glossy highlight.
  b.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.28, r * 0.25, () => [lit(main, 1.25), 1]);
  b.set(cx - r * 0.45, cy - r * 0.5, [255, 255, 255], 0.7);
  b.set(cx - r * 0.4, cy - r * 0.55, [255, 255, 255], 0.5);
}

function paintSnail(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const groundY = b.h - 2;
  const foot = hex(c.belly);
  const r = L * 0.42;
  const cx = b.w * 0.45;
  const cy = groundY - r - L * 0.12;
  if (!dead) {
    // Foot: a soft strip along the ground with a ripple, head and tentacles to the right.
    const ripple = frame % 2;
    for (let x = cx - r * 1.05; x < cx + r * 1.35; x++) {
      const t = (x - (cx - r)) / (r * 2.35);
      const hgt = L * (0.1 + Math.sin(Math.min(1, t) * Math.PI) * 0.06) + ((Math.round(x) + ripple) % 4 === 0 ? 0.6 : 0);
      for (let y = 0; y < hgt; y++) b.set(x, groundY - y, lit(foot, 1.05 - y / hgt * 0.25), 0.95);
    }
    const hx = cx + r * 1.3;
    const hy = groundY - L * 0.14;
    const wave = Math.sin(frame * 1.5) * L * 0.05;
    b.line(hx, hy, hx + L * 0.16, hy - L * 0.2 + wave, lit(foot, 0.85), 1);
    b.line(hx - 1, hy, hx + L * 0.06, hy - L * 0.24 - wave, lit(foot, 0.85), 1);
    b.set(hx + L * 0.16, hy - L * 0.2 + wave, [20, 20, 20]);
  }
  shellSpiral(b, cx, cy, r, c);
}

function paintCrab(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const groundY = b.h - 2;
  const legs = hex(c.fin);
  const tipC = hex(c.accent);
  const body = hex(c.body);
  // Borrowed shell at the back.
  const r = L * 0.36;
  const cx = b.w * 0.38;
  const cy = groundY - r - L * 0.14;
  shellSpiral(b, cx, cy, r, { ...c, body: '#c8b090', accent: '#8a7458', pattern: 'speckle' });
  // Legs (blue with orange tips) and claws in front of the shell.
  const fx = cx + r * 0.75;
  for (let k = 0; k < 3; k++) {
    const lx = fx + k * L * 0.06;
    const ly = cy + r * 0.2;
    const step = dead ? 0 : Math.sin(frame * (Math.PI / 2) + k * 2) * L * 0.05;
    const kneeX = lx + L * 0.14 + step;
    const kneeY = ly - L * 0.06;
    b.line(lx, ly, kneeX, kneeY, legs, 1, 2);
    b.line(kneeX, kneeY, kneeX + L * 0.08, groundY, legs, 1, 2);
    b.set(kneeX + L * 0.08, groundY - 1, tipC);
  }
  // Claw.
  b.ellipse(fx + L * 0.22, cy + r * 0.15, L * 0.09, L * 0.06, () => [lit(body, 1.05), 1]);
  b.set(fx + L * 0.3, cy + r * 0.12, tipC);
  // Eyes on stalks.
  b.line(fx + L * 0.05, cy - r * 0.2, fx + L * 0.12, cy - r * 0.55, lit(body, 1.1), 1);
  b.set(fx + L * 0.12, cy - r * 0.6, [15, 15, 15]);
  b.line(fx + L * 0.02, cy - r * 0.15, fx + L * 0.25, cy - r * 0.45 + Math.sin(frame) * 1.5, lit(tipC, 1.1), 0.8);
}

/** Paints a walk-cycle sheet. L is the body length in px. */
export function paintCritterSheet(kind: CritterKind, c: CritterColours, L: number, dead = false): CritterSheet {
  const Lr = Math.max(10, Math.round(L));
  const width = Math.round(Lr * (kind === 'shrimp' ? 1.75 : 1.5));
  const height = Math.round(Lr * (kind === 'shrimp' ? 0.75 : 1.1));
  const frames: Array<Uint8ClampedArray<ArrayBuffer>> = [];
  for (let f = 0; f < CRITTER_FRAMES; f++) {
    const b = new Buf(width, height);
    if (kind === 'shrimp') paintShrimp(b, Lr, c, f, dead);
    else if (kind === 'snail') paintSnail(b, Lr, c, f, dead);
    else paintCrab(b, Lr, c, f, dead);
    frames.push(b.data);
  }
  return { width, height, bodyLen: Lr, frames };
}
