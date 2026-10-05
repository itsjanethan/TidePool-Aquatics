/**
 * Invertebrate sprites (shrimp, snails, hermit crabs), painted from species
 * and morph colours into small walk-cycle sheets. Pixel buffers only (no
 * DOM), so the same painter makes tank sprites and UI portraits. Side view,
 * head to the right, like the fish sheets.
 */
import type { BodyShape, ColourMorph } from '../../data/speciesTypes';

export const CRITTER_FRAMES = 4;
export type CritterKind = 'shrimp' | 'snail' | 'crab' | 'frog' | 'gecko' | 'spider';

export function isCritterShape(shape: BodyShape): shape is CritterKind {
  return shape === 'shrimp' || shape === 'snail' || shape === 'crab' || shape === 'frog' || shape === 'gecko' || shape === 'spider';
}

/** Anatomy extras from SpeciesDef.body.features: 'crest', 'fat_tail', 'toe_pads'. */
export interface CritterFeatures {
  crest?: boolean;
  fatTail?: boolean;
  toePads?: boolean;
}

/** Frames 0-1 at rest (breathing), 2 crouched, 3 mid-leap (frogs) / walk cycle (others). */
export const FROG_LEAP_FRAME = 3;

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

function patternAt(c: CritterColours, x: number, y: number, seed: number): boolean {
  const n = Math.sin(x * 0.9 + seed) * Math.sin(y * 1.1 + seed * 0.7) + Math.sin(x * 0.37 - y * 0.53 + seed);
  if (c.pattern === 'spots') return n > 1.15;
  if (c.pattern === 'blotch') return n > 0.6;
  if (c.pattern === 'stripes') return Math.sin(y * 0.9 + Math.sin(x * 0.15) * 2) > 0.55;
  if (c.pattern === 'speckle') return n > 1.4;
  return false;
}

// ---------------------------------------------------------------------------
// Soft-body painting (v0.7): anti-aliased ellipsoids and limb capsules shaded
// as solids under the tank light (wrapped diffuse, a sharp wet specular, rim
// darkening), with smooth patterns and fine skin bump. Shared by the frog,
// gecko and tarantula painters.

const LX = -0.38;
const LY = -0.74;
const LZ = 0.56;
// Half vector between the light and a viewer straight in front.
const HN = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HN;
const HY = LY / HN;
const HZ = (LZ + 1) / HN;

function hh(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const v = y - yi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hh(xi, yi, s);
  const b = hh(xi + 1, yi, s);
  const c = hh(xi, yi + 1, s);
  const d = hh(xi + 1, yi + 1, s);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

interface Skin {
  base: RGB;
  /** Belly colour, blended in where the surface faces down. */
  belly?: RGB;
  /** 0..1 strength of the wet specular highlight. */
  gloss?: number;
  /** Fine bump (granular skin, tubercles, hair) 0..1. */
  bump?: number;
  bumpScale?: number;
  seed?: number;
  /** Pattern colour and an amount function in sheet pixels (0..1, soft). */
  patCol?: RGB;
  pattern?: (x: number, y: number) => number;
}

/** Shades one surface point with normal (nx, ny, nz) in screen space. */
function shadeSkin(sk: Skin, x: number, y: number, nx: number, ny: number, nz: number): RGB {
  if (sk.bump) {
    const s = sk.bumpScale ?? 1.4;
    const seed = sk.seed ?? 1;
    const bx = vn((x + 0.5) / s, y / s, seed) - vn((x - 0.5) / s, y / s, seed);
    const by = vn(x / s, (y + 0.5) / s, seed) - vn(x / s, (y - 0.5) / s, seed);
    nx += bx * sk.bump * 1.6;
    ny += by * sk.bump * 1.6;
    const n = Math.hypot(nx, ny, nz) || 1;
    nx /= n;
    ny /= n;
    nz /= n;
  }
  let c = sk.base;
  if (sk.belly) c = mixC(c, sk.belly, Math.min(1, Math.max(0, (ny - 0.15) * 2.2)));
  if (sk.pattern && sk.patCol) {
    const p = sk.pattern(x, y);
    if (p > 0) c = mixC(c, sk.patCol, Math.min(1, p));
  }
  const d = nx * LX + ny * LY + nz * LZ;
  const wrap = Math.max(0, (d + 0.35) / 1.35);
  let col = lit(c, 0.3 + 0.82 * wrap);
  // Rim: the silhouette turns away into shadow.
  col = lit(col, 1 - Math.pow(1 - Math.max(0, nz), 3) * 0.28);
  const g = sk.gloss ?? 0;
  if (g > 0) {
    const sp = Math.pow(Math.max(0, nx * HX + ny * HY + nz * HZ), 36) * g;
    if (sp > 0.004) col = mixC(col, [255, 255, 250], Math.min(0.9, sp));
  }
  return col;
}

/** Anti-aliased ellipsoid at (cx, cy), radii rx, ry, rotated by rot. */
function blob(b: Buf, cx: number, cy: number, rx: number, ry: number, rot: number, sk: Skin, alpha = 1): void {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const m = Math.min(rx, ry);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = (dx * cs + dy * sn) / rx;
      const v = (-dx * sn + dy * cs) / ry;
      const d = Math.sqrt(u * u + v * v);
      const cover = Math.min(1, Math.max(0, (1 - d) * m + 0.5));
      if (cover <= 0) continue;
      const dd = Math.min(0.999, d);
      const nz = Math.sqrt(1 - dd * dd);
      // Local normal back to screen space.
      const lnx = u * (d > 0 ? dd / d : 0);
      const lny = v * (d > 0 ? dd / d : 0);
      const nx = lnx * cs - lny * sn;
      const ny = lnx * sn + lny * cs;
      b.set(x, y, shadeSkin(sk, x, y, nx, ny, nz), cover * alpha);
    }
  }
}

/** A tapered limb segment shaded as a cylinder, with round ends. */
function limb(b: Buf, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, sk: Skin, alpha = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const len = Math.sqrt(len2);
  const R = Math.max(w0, w1) / 2 + 1;
  const ax = dx / len;
  const ay = dy / len;
  for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const r = (w0 + (w1 - w0) * t) / 2;
      const qx = px - dx * t;
      const qy = py - dy * t;
      const d = Math.hypot(qx, qy);
      const cover = Math.min(1, Math.max(0, r - d + 0.5));
      if (cover <= 0) continue;
      const across = Math.min(0.999, d / Math.max(0.5, r));
      const nz = Math.sqrt(1 - across * across);
      // Normal points away from the axis (perpendicular part of q).
      const along = qx * ax + qy * ay;
      let nx = (qx - along * ax) / Math.max(0.001, d);
      let ny = (qy - along * ay) / Math.max(0.001, d);
      nx *= across;
      ny *= across;
      b.set(x, y, shadeSkin(sk, x, y, nx, ny, nz), cover * alpha);
    }
  }
}

/** Glossy eye: dark globe, iris tint, two reflections. */
function eyeball(b: Buf, cx: number, cy: number, r: number, iris: RGB, pupil: 'round' | 'slit' | 'h' = 'round'): void {
  blob(b, cx, cy, r, r, 0, { base: [14, 12, 12], gloss: 0.9 });
  const ir = r * 0.82;
  for (let y = Math.floor(cy - ir); y <= Math.ceil(cy + ir); y++) {
    for (let x = Math.floor(cx - ir); x <= Math.ceil(cx + ir); x++) {
      const u = (x + 0.5 - cx) / ir;
      const v = (y + 0.5 - cy) / ir;
      const d = Math.hypot(u, v);
      if (d > 1) continue;
      const inPupil = pupil === 'slit' ? Math.abs(u) < 0.16 * (1 - v * v) + 0.02 : pupil === 'h' ? Math.abs(v) < 0.22 * (1 - u * u) + 0.03 : d < 0.48;
      if (inPupil) continue;
      const vein = Math.sin(Math.atan2(v, u) * 14 + d * 6) * 0.08;
      b.set(x, y, lit(iris, 0.7 + (1 - d) * 0.4 - v * 0.2 + vein), Math.min(1, (1 - d) * ir * 0.8 + 0.3) * 0.9);
    }
  }
  const hr = Math.max(0.6, r * 0.28);
  blob(b, cx - r * 0.32, cy - r * 0.36, hr, hr * 0.8, -0.4, { base: [255, 255, 255] }, 0.92);
  if (r > 2.5) blob(b, cx + r * 0.34, cy + r * 0.3, hr * 0.45, hr * 0.35, 0, { base: [210, 225, 240] }, 0.5);
}

/** Smooth frog and gecko patterns from the morph's pattern name. */
function skinPattern(kind: string, L: number, seed: number): ((x: number, y: number) => number) | undefined {
  const s = L / 10;
  switch (kind) {
    case 'spots':
      return (x, y) => {
        const n = vn(x / (s * 0.9), y / (s * 0.9), seed);
        return Math.max(0, Math.min(1, (n - 0.66) * 9));
      };
    case 'blotch':
      return (x, y) => {
        const n = vn(x / (s * 1.6), y / (s * 1.3), seed) * 0.7 + vn(x / (s * 0.6), y / (s * 0.6), seed + 3) * 0.3;
        return Math.max(0, Math.min(1, (n - 0.52) * 8));
      };
    case 'stripes':
      return (x, y) => {
        const w = Math.sin((y / (s * 1.05)) * Math.PI + vn(x / (s * 2.5), y / (s * 2), seed) * 2.6);
        return Math.max(0, Math.min(1, (w - 0.25) * 3));
      };
    case 'speckle':
      return (x, y) => {
        const n = hh(Math.floor(x / Math.max(1, s * 0.35)), Math.floor(y / Math.max(1, s * 0.35)), seed);
        return n > 0.96 ? 0.85 : 0;
      };
    default:
      return undefined;
  }
}

/**
 * Frog, side view facing right: a glossy body sloping down to the rump, a
 * rounded head with a protruding eye, a folded hind leg (thigh, shin, long
 * foot), a front leg with splayed fingers, toe pads on climbers, the morph's
 * pattern in smooth patches, a paler throat that pulses, and wet highlights.
 * Frames: 0-1 sitting (breathing), 2 crouched, 3 mid-leap with legs trailing.
 */
function paintFrog(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean, ft: CritterFeatures): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const limbC = hex(c.fin);
  const accent = hex(c.accent);
  const g = b.h - 2;
  const leap = frame === 3 && !dead;
  const crouch = frame === 2;
  const breathe = frame === 1 ? 1 : 0;
  const seed = Math.round(body[0] + body[1] * 3 + L);
  const pat = skinPattern(c.pattern, L, seed);
  const toad = !ft.toePads && c.pattern === 'spots' && belly[0] > 180; // warty fire-bellied toads
  const sk: Skin = { base: body, belly, gloss: toad ? 0.35 : 0.75, bump: toad ? 0.9 : 0.15, bumpScale: L / 22, seed, patCol: accent, pattern: pat };
  const legSk: Skin = { ...sk, base: limbC, belly: mixC(limbC, belly, 0.3), pattern: c.pattern === 'speckle' ? pat : undefined };
  const padC = mixC(limbC, [255, 236, 200], 0.25);
  const cx = b.w * 0.44;
  const lift = leap ? L * 0.16 : crouch ? -L * 0.03 : 0;
  const cy = g - L * 0.25 - lift;
  const tilt = leap ? -0.42 : crouch ? -0.12 : -0.24;
  // Far legs, darker, peeking out behind.
  const farSk: Skin = { ...legSk, base: lit(limbC, 0.6), gloss: 0.2 };
  if (!leap) {
    limb(b, cx + L * 0.16, cy + L * 0.08, cx + L * 0.34, g - L * 0.02, L * 0.06, L * 0.045, farSk);
    limb(b, cx - L * 0.24, cy + L * 0.04, cx - L * 0.36, g - L * 0.04, L * 0.08, L * 0.05, farSk);
  }
  // Body and head.
  blob(b, cx, cy, L * 0.37, L * 0.21 * (crouch ? 0.9 : 1), tilt, sk);
  const hx = cx + L * 0.3;
  const hy = cy - L * (leap ? 0.13 : 0.07);
  blob(b, hx, hy, L * 0.18, L * 0.135, tilt * 0.4, sk);
  blob(b, hx + L * 0.13, hy + L * 0.025, L * 0.08, L * 0.065, 0.2, sk);
  // Throat pouch: paler, swelling as the frog breathes.
  blob(b, hx + L * 0.02, hy + L * 0.1, L * (0.09 + breathe * 0.02), L * (0.045 + breathe * 0.018), 0, { ...sk, base: mixC(belly, body, 0.3), pattern: undefined }, 0.95);
  // Mouth line and nostril.
  b.line(hx + L * 0.2, hy + L * 0.035, hx - L * 0.02, hy + L * 0.05, lit(body, 0.42), 0.55, Math.max(1, L * 0.012));
  b.set(hx + L * 0.19, hy - L * 0.01, lit(body, 0.4), 0.8);
  // Tympanum behind the eye.
  blob(b, hx - L * 0.07, hy - L * 0.005, L * 0.035, L * 0.035, 0, { ...sk, base: lit(body, 0.8), pattern: undefined }, 0.7);
  // Eye, raised above the head line.
  const er = L * (ft.toePads ? 0.075 : 0.065);
  blob(b, hx + L * 0.04, hy - L * 0.07, er * 1.25, er * 1.05, 0, { ...sk, pattern: undefined });
  eyeball(b, hx + L * 0.045, hy - L * 0.085, er, ft.toePads ? [190, 120, 30] : toad ? [190, 90, 30] : [36, 30, 30], ft.toePads ? 'h' : 'round');
  // Hind leg.
  if (leap) {
    const hip = [cx - L * 0.3, cy + L * 0.04];
    const knee = [cx - L * 0.56, cy + L * 0.16];
    const heel = [cx - L * 0.78, cy + L * 0.26];
    const toes = [cx - L * 0.98, cy + L * 0.34];
    limb(b, hip[0], hip[1], knee[0], knee[1], L * 0.15, L * 0.1, legSk);
    limb(b, knee[0], knee[1], heel[0], heel[1], L * 0.09, L * 0.06, legSk);
    limb(b, heel[0], heel[1], toes[0], toes[1], L * 0.05, L * 0.03, legSk);
    limb(b, cx + L * 0.26, cy + L * 0.12, cx + L * 0.4, cy + L * 0.3, L * 0.06, L * 0.04, legSk);
  } else {
    const hip = [cx - L * 0.27, cy + L * 0.02];
    const knee = [cx + L * 0.02, cy + L * 0.13];
    const heel = [cx - L * 0.27, g - L * 0.05];
    const toe = [cx + L * 0.16, g - L * 0.015];
    limb(b, heel[0], heel[1], toe[0], toe[1], L * 0.055, L * 0.03, legSk);
    for (const k of [-1, 0, 1]) limb(b, toe[0] - L * 0.05, toe[1], toe[0] + L * 0.04, toe[1] + k * L * 0.018, L * 0.022, L * 0.016, legSk);
    if (ft.toePads) for (const k of [-1, 0, 1]) blob(b, toe[0] + L * 0.045, toe[1] + k * L * 0.018, L * 0.02, L * 0.018, 0, { base: padC, gloss: 0.4 });
    limb(b, knee[0], knee[1], heel[0], heel[1], L * 0.1, L * 0.07, legSk);
    limb(b, hip[0], hip[1], knee[0], knee[1], L * 0.17, L * 0.11, legSk);
    // Front leg and splayed fingers.
    const sh = [cx + L * 0.2, cy + L * 0.08];
    const el = [cx + L * 0.25, g - L * 0.1];
    const wr = [cx + L * 0.31, g - L * 0.015];
    limb(b, sh[0], sh[1], el[0], el[1], L * 0.07, L * 0.05, legSk);
    limb(b, el[0], el[1], wr[0], wr[1], L * 0.05, L * 0.035, legSk);
    for (const k of [-0.6, 0, 0.6]) {
      const fx = wr[0] + L * 0.06 * Math.cos(k);
      const fy = g - L * 0.012 + Math.sin(k) * L * 0.01;
      limb(b, wr[0], wr[1], fx, fy, L * 0.02, L * 0.014, legSk);
      if (ft.toePads) blob(b, fx, fy, L * 0.018, L * 0.016, 0, { base: padC, gloss: 0.4 });
    }
  }
  if (dead) for (let i = 0; i < b.data.length; i += 4) b.data[i + 3] *= 0.85;
}

function paintGecko(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean, ft: CritterFeatures): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const accent = hex(c.accent);
  const g = b.h - 2;
  const x0 = b.w * 0.04;
  const len = b.w * 0.92;
  const thick = L * (ft.fatTail ? 0.085 : 0.075);
  const smooth = (a: number, z: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (z - a)));
    return t * t * (3 - 2 * t);
  };
  // Radius along the animal from tail tip (0) to snout (1).
  const radius = (sv: number): number => {
    if (sv < 0.42) {
      const u = sv / 0.42;
      if (ft.fatTail) return thick * (0.18 + 0.95 * smooth(0, 0.55, u)) * (u > 0.8 ? 1 - (u - 0.8) * 0.9 : 1);
      return thick * (0.12 + 0.6 * u);
    }
    if (sv < 0.5) return thick * (0.82 + (sv - 0.42) * 2);
    if (sv < 0.76) return thick * (0.98 + Math.sin(((sv - 0.5) / 0.26) * Math.PI) * 0.14);
    if (sv < 0.81) return thick * 0.74;
    const u = (sv - 0.81) / 0.19;
    return thick * (0.86 + Math.sin(u * Math.PI * 0.7) * 0.12) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.55) / 0.45, 2) * 0.85));
  };
  // Centre line: the tail rests on the ground, the body is held up on the legs, head a little raised.
  const lift = thick * 1.25;
  const centre = (sv: number): number => {
    const onGround = g - radius(sv) - 1;
    const held = g - lift - thick;
    const y = onGround + (held - onGround) * smooth(0.18, 0.46, sv);
    return y - (sv > 0.78 ? (sv - 0.78) * thick * 1.6 : 0) + (dead ? 0 : Math.sin((frame * Math.PI) / 2 + sv * 9) * (sv < 0.4 ? thick * 0.12 : 0));
  };
  // Far-side legs first (darker), then the body, then the near legs.
  const legAt = (sv: number, near: boolean, ph: number) => {
    const sx = x0 + sv * len;
    const sy = centre(sv) + radius(sv) * 0.55;
    const swing = dead ? 0 : (ph < 2 ? ph : 4 - ph) * thick * 0.5 - thick * 0.5;
    const hind = sv < 0.6;
    const kneeX = sx + (hind ? -thick * 0.5 : thick * 0.6) + swing * 0.5;
    const kneeY = g - thick * 0.75;
    const footX = sx + (hind ? -thick * 0.15 : thick * 0.95) + swing;
    const col = near ? lit(body, 0.98) : lit(body, 0.62);
    const w = Math.max(2, thick * 0.55);
    b.line(sx, sy, kneeX, kneeY, col, 1, w);
    b.line(kneeX, kneeY, footX, g - 1, col, 1, Math.max(1, w * 0.7));
    // Splayed toes.
    for (const d of [-1, 0, 1]) b.set(footX + d * Math.max(1, thick * 0.25), g, near ? (ft.toePads ? lit(belly, 1.15) : lit(body, 0.9)) : lit(body, 0.55), 1);
  };
  legAt(0.48, false, (frame + 2) % 4);
  legAt(0.72, false, frame % 4);
  for (let i = 0; i <= Math.ceil(len); i++) {
    const sv = i / len;
    const r = radius(sv);
    if (r < 0.6) continue;
    const yc = centre(sv);
    const x = x0 + i;
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      const v = y / r;
      if (Math.abs(v) > 1.02) continue;
      let col = v > 0.5 ? belly : body;
      if (v <= 0.5) {
        if (ft.fatTail && sv < 0.42 && Math.floor(sv * 26) % 3 === 0) col = mixC(body, accent, 0.35);
        if (patternAt(c, x * 0.8, (yc + y) * 0.8, 5)) col = accent;
        if (c.pattern === 'blotch' && v < -0.35 && Math.floor(x / Math.max(3, thick)) % 2 === 0) col = mixC(body, [255, 236, 190], 0.45);
        if (c.pattern === 'stripes' && Math.abs(v + 0.55) < 0.18 && sv > 0.4) col = mixC(body, [255, 236, 190], 0.55);
      }
      // Rounded shading, a lit back and a soft rim below.
      let k = 1.18 - (v + 1) * 0.2;
      if (Math.abs(v) > 0.85) k *= 0.82;
      // Bumpy skin.
      if (((x * 7 + (yc + y) * 13) % 11) === 0) k *= 0.92;
      b.set(x, yc + y, lit(col, k), 1);
    }
    // Crested gecko: a fringe of small spikes along the back and over the eyes.
    if (ft.crest && sv > 0.5 && sv < 0.97 && i % 3 === 0) b.set(x, yc - r - 1, lit(body, 1.25), 1);
  }
  legAt(0.48, true, frame % 4);
  legAt(0.72, true, (frame + 2) % 4);
  // Head details: a big lidded eye, nostril, and the long smiling mouth line.
  const he = 0.9;
  const hx = x0 + he * len;
  const hy = centre(he) - radius(he) * 0.2;
  const er = Math.max(1.5, thick * 0.38);
  b.ellipse(hx, hy, er, er, (nx, ny) => {
    if (nx * nx + ny * ny > 0.6) return [ft.crest ? [190, 140, 70] : lit(body, 0.7), 1];
    return [nx < -0.15 && ny < -0.15 ? [235, 225, 205] : ft.crest ? [120, 80, 30] : [18, 18, 22], 1];
  });
  if (ft.crest) for (let k = -1; k <= 2; k++) b.set(hx + k, hy - er - 1 - (k === 0 ? 1 : 0), lit(body, 1.3), 1);
  b.set(x0 + 0.985 * len, centre(0.985) - radius(0.985) * 0.2, lit(body, 0.45), 1);
  const my = centre(0.9) + radius(0.9) * 0.35;
  b.line(x0 + 0.84 * len, my + thick * 0.08, x0 + 0.99 * len, my - thick * 0.1, lit(body, 0.55), 1);
  if (dead) for (let i = 0; i < b.data.length; i += 4) b.data[i + 3] *= 0.85;
}

function paintSpider(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const limb = hex(c.fin);
  const hair = hex(c.accent);
  const g = b.h - 2;
  const cx = b.w * 0.5;
  const cy = g - L * 0.22;
  const hash = (x: number, y: number) => ((Math.imul(Math.round(x) * 73856093 ^ Math.round(y) * 19349663, 83492791) >>> 0) % 1000) / 1000;
  // Eight thick, hairy legs: four each side seen from the side, jointed, stepping in pairs.
  const leg = (k: number) => {
    const far = k < 4;
    const i = k % 4;
    const baseX = cx + L * (0.02 + i * 0.045);
    const lift = dead ? -L * 0.18 : (((frame + i + (far ? 2 : 0)) % 4) < 2 ? -L * 0.035 : 0);
    const spread = (i - 1.6) * L * 0.21 + (far ? L * 0.03 : 0);
    const kneeX = baseX + spread * 0.62;
    const kneeY = cy - L * 0.1 + lift;
    const footX = baseX + spread * 1.08;
    const col = far ? lit(limb, 0.62) : lit(limb, 1.05);
    const w = Math.max(2, L * 0.075);
    b.line(baseX, cy, kneeX, kneeY, col, 1, w);
    b.line(kneeX, kneeY, footX, g + (dead ? -L * 0.25 : 0), col, 1, Math.max(2, w * 0.8));
    // Pale knee bands and bristles along the leg.
    b.set(kneeX, kneeY - 1, lit(hair, far ? 0.8 : 1.05), 1);
    b.set(kneeX + 1, kneeY - 1, lit(hair, far ? 0.75 : 1), 0.8);
    for (let s = 0.15; s < 1; s += 0.22) b.set(kneeX + (footX - kneeX) * s - 1, kneeY + (g - kneeY) * s, lit(hair, far ? 0.7 : 0.95), 0.7);
  };
  for (let k = 0; k < 4; k++) leg(k);
  // Abdomen (back, left): round and covered in fine pale hairs; cephalothorax (front, right).
  b.ellipse(cx - L * 0.2, cy - L * 0.02, L * 0.2, L * 0.16, (nx, ny) => {
    const h = hash((nx + 1) * 40, (ny + 1) * 40);
    const base = lit(body, 1.08 - ny * 0.35 - Math.abs(nx) * 0.1);
    return [h > 0.82 ? mixC(base, hair, 0.7) : h < 0.08 ? lit(base, 0.75) : base, 1];
  });
  b.ellipse(cx + L * 0.09, cy - L * 0.03, L * 0.16, L * 0.115, (nx, ny) => {
    const h = hash((nx + 1) * 30 + 7, (ny + 1) * 30);
    const base = lit(ny > 0.35 ? belly : body, 1.12 - ny * 0.3);
    return [h > 0.88 ? mixC(base, hair, 0.5) : base, 1];
  });
  for (let k = 4; k < 8; k++) leg(k);
  // Pedipalps and chelicerae.
  b.line(cx + L * 0.2, cy, cx + L * 0.3, cy + L * 0.09, lit(limb, 0.9), 1, Math.max(2, L * 0.04));
  b.ellipse(cx + L * 0.22, cy + L * 0.03, L * 0.04, L * 0.05, () => [lit(body, 0.55), 1]);
  // Eye cluster on the carapace.
  b.set(cx + L * 0.12, cy - L * 0.12, [16, 16, 16]);
  b.set(cx + L * 0.14, cy - L * 0.12, [16, 16, 16]);
  b.set(cx + L * 0.13, cy - L * 0.13, [200, 200, 200], 0.8);
  if (dead) for (let i = 0; i < b.data.length; i += 4) b.data[i + 3] *= 0.85;
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
const SHEET_SIZE: Record<CritterKind, [number, number]> = { shrimp: [1.75, 0.75], snail: [1.5, 1.1], crab: [1.5, 1.1], frog: [1.6, 0.95], gecko: [1.1, 0.36], spider: [1.25, 0.62] };

export function paintCritterSheet(kind: CritterKind, c: CritterColours, L: number, dead = false, ft: CritterFeatures = {}): CritterSheet {
  const Lr = Math.max(10, Math.round(L));
  const width = Math.round(Lr * SHEET_SIZE[kind][0]);
  const height = Math.round(Lr * SHEET_SIZE[kind][1]);
  const frames: Array<Uint8ClampedArray<ArrayBuffer>> = [];
  for (let f = 0; f < CRITTER_FRAMES; f++) {
    const b = new Buf(width, height);
    if (kind === 'shrimp') paintShrimp(b, Lr, c, f, dead);
    else if (kind === 'snail') paintSnail(b, Lr, c, f, dead);
    else if (kind === 'frog') paintFrog(b, Lr, c, f, dead, ft);
    else if (kind === 'gecko') paintGecko(b, Lr, c, f, dead, ft);
    else if (kind === 'spider') paintSpider(b, Lr, c, f, dead);
    else paintCrab(b, Lr, c, f, dead);
    frames.push(b.data);
  }
  return { width, height, bodyLen: Lr, frames };
}
