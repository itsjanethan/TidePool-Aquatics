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

/**
 * Gecko, side view facing right: a tapered body built along a centre line
 * (fat tail on leopard geckos), shaded as a rounded solid with fine tubercle
 * bump, the morph's pattern in soft patches (tail bands, crest fringe), four
 * jointed legs stepping in diagonal pairs with splayed toes or pads, a lidded
 * eye with a slit pupil and the long smiling mouth line.
 */
function paintGecko(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean, ft: CritterFeatures): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const accent = hex(c.accent);
  const g = b.h - 2;
  const x0 = b.w * 0.04;
  const len = b.w * 0.92;
  const thick = L * (ft.fatTail ? 0.085 : 0.075);
  const sm = (a: number, z: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (z - a)));
    return t * t * (3 - 2 * t);
  };
  const radius = (sv: number): number => {
    if (sv < 0.42) {
      const u = sv / 0.42;
      if (ft.fatTail) return thick * (0.18 + 0.95 * sm(0, 0.55, u)) * (u > 0.8 ? 1 - (u - 0.8) * 0.9 : 1);
      return thick * (0.12 + 0.6 * u);
    }
    if (sv < 0.5) return thick * (0.82 + (sv - 0.42) * 2);
    if (sv < 0.76) return thick * (0.98 + Math.sin(((sv - 0.5) / 0.26) * Math.PI) * 0.14);
    if (sv < 0.81) return thick * 0.74;
    const u = (sv - 0.81) / 0.19;
    return thick * (0.86 + Math.sin(u * Math.PI * 0.7) * 0.12) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.55) / 0.45, 2) * 0.85));
  };
  const lift = thick * 1.25;
  const centre = (sv: number): number => {
    const onGround = g - radius(sv) - 1;
    const held = g - lift - thick;
    const y = onGround + (held - onGround) * sm(0.18, 0.46, sv);
    return y - (sv > 0.78 ? (sv - 0.78) * thick * 1.6 : 0) + (dead ? 0 : Math.sin((frame * Math.PI) / 2 + sv * 9) * (sv < 0.4 ? thick * 0.12 : 0));
  };
  const seed = Math.round(body[0] * 7 + body[2] + L);
  const pat = skinPattern(c.pattern === 'spots' ? 'spots' : c.pattern, L * 0.55, seed);
  const sk: Skin = { base: body, belly, gloss: ft.crest ? 0.15 : 0.22, bump: 0.7, bumpScale: Math.max(0.8, thick * 0.22), seed, patCol: accent, pattern: pat };
  const legSk: Skin = { ...sk, pattern: undefined, bump: 0.5 };
  const legAt = (sv: number, near: boolean, ph: number) => {
    const sx = x0 + sv * len;
    const sy = centre(sv) + radius(sv) * 0.45;
    const swing = dead ? 0 : (ph < 2 ? ph : 4 - ph) * thick * 0.5 - thick * 0.5;
    const hind = sv < 0.6;
    const kneeX = sx + (hind ? -thick * 0.5 : thick * 0.6) + swing * 0.5;
    const kneeY = g - thick * 0.8;
    const footX = sx + (hind ? -thick * 0.15 : thick * 0.95) + swing;
    const s2: Skin = near ? legSk : { ...legSk, base: lit(body, 0.55), belly: lit(belly, 0.55), gloss: 0 };
    const w = Math.max(2, thick * 0.6);
    limb(b, sx, sy, kneeX, kneeY, w, w * 0.75, s2);
    limb(b, kneeX, kneeY, footX, g - w * 0.25, w * 0.7, w * 0.45, s2);
    for (const d of [-1.2, -0.4, 0.4, 1.2]) {
      const tx = footX + d * thick * 0.35 + thick * 0.15;
      limb(b, footX, g - w * 0.2, tx, g - 0.5, w * 0.3, w * 0.22, s2);
      if (ft.toePads && near) blob(b, tx, g - 0.6, w * 0.22, w * 0.16, 0, { base: lit(belly, 1.05), gloss: 0.2 });
    }
  };
  legAt(0.48, false, (frame + 2) % 4);
  legAt(0.72, false, frame % 4);
  for (let i = 0; i <= Math.ceil(len); i++) {
    const sv = i / len;
    const r = radius(sv);
    if (r < 0.5) continue;
    const yc = centre(sv);
    const x = x0 + i;
    for (let y = -Math.ceil(r) - 1; y <= Math.ceil(r) + 1; y++) {
      const v = y / r;
      const cover = Math.min(1, Math.max(0, r - Math.abs(y) + 0.5));
      if (cover <= 0) continue;
      const vv = Math.max(-0.999, Math.min(0.999, v));
      const nz = Math.sqrt(1 - vv * vv);
      let skin = sk;
      // Leopard gecko tail bands; harlequin and flame crests get a pale dorsal stripe.
      if (ft.fatTail && sv < 0.42 && Math.sin(sv * 46) > 0.55 && v < 0.4) skin = { ...sk, base: mixC(body, belly, 0.55) };
      if ((c.pattern === 'blotch' || c.pattern === 'stripes') && v < -0.4 && sv > 0.35) skin = { ...sk, base: mixC(body, [250, 226, 176], c.pattern === 'blotch' ? 0.5 * (Math.sin(sv * 30) > 0 ? 1 : 0.3) : 0.6) };
      b.set(x, yc + y, shadeSkin(skin, x, yc + y, 0, vv, nz), cover);
    }
    // Crested gecko: a fringe of small soft spikes along the back.
    if (ft.crest && sv > 0.5 && sv < 0.97 && i % Math.max(2, Math.round(thick * 0.45)) === 0) limb(b, x, yc - r + 0.5, x - thick * 0.12, yc - r - thick * 0.35, thick * 0.22, thick * 0.06, { ...sk, base: lit(body, 1.15), pattern: undefined });
  }
  legAt(0.48, true, frame % 4);
  legAt(0.72, true, (frame + 2) % 4);
  // Head: lidded eye with a slit pupil, nostril, smiling mouth line.
  const he = 0.9;
  const hx = x0 + he * len;
  const hy = centre(he) - radius(he) * 0.2;
  const er = Math.max(1.4, thick * (ft.crest ? 0.42 : 0.36));
  blob(b, hx, hy, er * 1.3, er * 1.15, 0, { ...sk, pattern: undefined });
  eyeball(b, hx + er * 0.1, hy, er, ft.crest ? [176, 128, 60] : [168, 150, 120], 'slit');
  if (ft.crest) for (let k = -1; k <= 2; k++) limb(b, hx + k * er * 0.5, hy - er * 1.1, hx + k * er * 0.5 - er * 0.2, hy - er * 1.7, er * 0.35, er * 0.1, { ...sk, base: lit(body, 1.2), pattern: undefined });
  b.set(x0 + 0.985 * len, centre(0.985) - radius(0.985) * 0.2, lit(body, 0.45), 1);
  const my = centre(0.9) + radius(0.9) * 0.35;
  b.line(x0 + 0.84 * len, my + thick * 0.08, x0 + 0.99 * len, my - thick * 0.1, lit(body, 0.5), 0.8, Math.max(1, thick * 0.08));
  if (dead) for (let i = 0; i < b.data.length; i += 4) b.data[i + 3] *= 0.85;
}

/** Fine hairs: short soft strokes leaning back from a surface. */
function hairs(b: Buf, x: number, y: number, n: number, len: number, col: RGB, seed: number, ang = -1.9): void {
  for (let i = 0; i < n; i++) {
    const a = ang + (hh(i, seed, 3) - 0.5) * 1.4;
    const l = len * (0.5 + hh(i, seed, 5) * 0.8);
    b.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, lit(col, 0.8 + hh(i, seed, 7) * 0.5), 0.5, 1);
  }
}

/**
 * Tarantula, side view facing right: a velvety hairy abdomen and a domed
 * carapace with a radial pattern, eight segmented legs (far pair darker)
 * stepping in alternation with pale knee bands and long setae, pedipalps,
 * chelicerae and the eye tubercle.
 */
function paintSpider(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const limbC = hex(c.fin);
  const hair = hex(c.accent);
  const g = b.h - 2;
  const cx = b.w * 0.5;
  const cy = g - L * 0.22;
  const seed = Math.round(body[0] + L);
  const fur: Skin = { base: body, belly, bump: 1, bumpScale: Math.max(0.6, L / 90), seed, gloss: 0 };
  const legSk = (far: boolean): Skin => ({ base: far ? lit(limbC, 0.55) : limbC, bump: 0.9, bumpScale: Math.max(0.6, L / 110), seed: seed + 1, gloss: 0.05 });
  const leg = (k: number) => {
    const far = k < 4;
    const i = k % 4;
    const baseX = cx + L * (0.02 + i * 0.045);
    const lifted = dead ? -L * 0.18 : (((frame + i + (far ? 2 : 0)) % 4) < 2 ? -L * 0.035 : 0);
    const spread = (i - 1.6) * L * 0.21 + (far ? L * 0.03 : 0);
    const kneeX = baseX + spread * 0.62;
    const kneeY = cy - L * 0.11 + lifted;
    const footX = baseX + spread * 1.08;
    const footY = g + (dead ? -L * 0.25 : 0);
    const midX = kneeX + (footX - kneeX) * 0.5;
    const midY = kneeY + (footY - kneeY) * 0.45;
    const w = Math.max(2, L * 0.07);
    const sk = legSk(far);
    limb(b, baseX, cy, kneeX, kneeY, w, w * 0.85, sk);
    limb(b, kneeX, kneeY, midX, midY, w * 0.85, w * 0.7, sk);
    limb(b, midX, midY, footX, footY - 0.5, w * 0.7, w * 0.45, sk);
    // Pale bands at the joints (the "knees" of a rose hair).
    blob(b, kneeX, kneeY, w * 0.5, w * 0.42, 0, { base: lit(hair, far ? 0.6 : 0.95), bump: 0.6, seed }, 0.85);
    blob(b, midX, midY, w * 0.4, w * 0.35, 0, { base: lit(hair, far ? 0.55 : 0.9), bump: 0.6, seed }, 0.7);
    if (!far) {
      hairs(b, (baseX + kneeX) / 2, (cy + kneeY) / 2 - w * 0.3, 5, w * 0.9, hair, seed + k);
      hairs(b, (kneeX + midX) / 2, (kneeY + midY) / 2 - w * 0.2, 5, w * 0.9, hair, seed + k + 9, -1.4);
    }
  };
  for (let k = 0; k < 4; k++) leg(k);
  // Abdomen: velvety, with long pale setae.
  const ax = cx - L * 0.2;
  const ay = cy - L * 0.02;
  blob(b, ax, ay, L * 0.2, L * 0.16, -0.15, fur);
  for (let k = 0; k < 26; k++) {
    const ang = Math.PI * (0.85 + hh(k, seed, 1) * 1.1);
    hairs(b, ax + Math.cos(ang) * L * 0.18, ay + Math.sin(ang) * L * 0.14, 1, L * 0.05, hair, seed + k * 3, ang);
  }
  // Carapace: domed, with dark radial lines from the fovea.
  const tx = cx + L * 0.09;
  const ty = cy - L * 0.03;
  blob(b, tx, ty, L * 0.16, L * 0.11, 0, { ...fur, gloss: 0.12, bump: 0.6, pattern: (x, y) => {
    const a = Math.atan2(y - ty, x - tx);
    return Math.max(0, Math.cos(a * 8) - 0.85) * 3;
  }, patCol: lit(body, 0.55) });
  for (let k = 4; k < 8; k++) leg(k);
  // Pedipalps and chelicerae.
  limb(b, cx + L * 0.2, cy, cx + L * 0.28, cy + L * 0.06, L * 0.05, L * 0.04, legSk(false));
  limb(b, cx + L * 0.28, cy + L * 0.06, cx + L * 0.32, g - L * 0.04, L * 0.04, L * 0.03, legSk(false));
  blob(b, cx + L * 0.22, cy + L * 0.03, L * 0.05, L * 0.06, 0.2, { base: lit(body, 0.45), gloss: 0.25 });
  // Eye tubercle with tiny glossy eyes.
  blob(b, tx + L * 0.04, ty - L * 0.1, L * 0.022, L * 0.016, 0, { base: [24, 22, 20], gloss: 0.9 });
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

/**
 * Shrimp, side view facing right: a translucent arched abdomen of six
 * overlapping segments, a smooth carapace, a fanned tail, a serrated rostrum,
 * a stalked glossy eye, long antennae, walking legs and beating swimmerets.
 * Colour from the morph (cherry red, crystal bands, amano dashes, cleaner
 * stripe) with saturation concentrated on the back and a glassy belly.
 */
function paintShrimp(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const accent = hex(c.accent);
  const finC = hex(c.fin);
  const x0 = b.w * 0.18;
  const groundY = b.h - 2;
  const top = groundY - L * 0.42;
  const yAt = (t: number) => top + L * 0.16 + Math.sin(t * Math.PI) * -L * 0.06 + (1 - t) * L * 0.06;
  const hAt = (t: number) => L * (t > 0.62 ? 0.15 : 0.06 + t * 0.15);
  const alpha = dead ? 0.55 : 0.9;
  const seed = Math.round(body[0] + L);
  const skinFor = (t: number): Skin => {
    let base = body;
    if (c.pattern === 'bands') base = Math.floor(t * 10) % 2 === 0 && t < 0.62 ? accent : t >= 0.62 && t < 0.8 ? accent : body;
    return { base, belly: mixC(belly, [235, 235, 230], 0.4), gloss: 0.7, seed, pattern: c.pattern === 'spots' ? (x, y) => (hh(Math.floor(x / 2), Math.floor(y / 2), seed) > 0.9 ? 1 : 0) : undefined, patCol: accent };
  };
  // Swimmerets under the abdomen, beating.
  for (let k = 0; k < 4; k++) {
    const t = 0.15 + k * 0.11;
    const lx = x0 + L * t;
    const ly = yAt(t) + hAt(t) * 0.7;
    const beat = dead ? 0 : Math.sin(frame * 1.6 + k * 0.9) * L * 0.025;
    limb(b, lx, ly, lx - L * 0.02 + beat, ly + L * 0.06, L * 0.022, L * 0.01, { base: finC, gloss: 0.3 }, 0.7);
  }
  // Abdomen segments, tail to head, each a shaded overlapping plate.
  for (let k = 0; k < 6; k++) {
    const t = 0.06 + k * 0.1;
    blob(b, x0 + L * t, yAt(t), L * 0.07, hAt(t) * 1.02, -0.15 + k * 0.05, skinFor(t), alpha);
  }
  // Carapace.
  blob(b, x0 + L * 0.8, yAt(0.8) - L * 0.005, L * 0.21, hAt(0.8) * 1.05, 0.04, skinFor(0.8), alpha);
  // Lateral stripe (cleaner shrimp) and back highlight line.
  if (c.pattern === 'lateral') for (let i = 4; i < 98; i++) { const t = i / 100; b.set(x0 + L * t, yAt(t) - hAt(t) * 0.25, [250, 250, 250], 0.85); b.set(x0 + L * t, yAt(t) - hAt(t) * 0.6, [200, 40, 30], 0.6); }
  // Tail fan.
  const ty = yAt(0);
  for (const [dy, k] of [[-0.09, 1.05], [-0.03, 1], [0.03, 0.9]] as Array<[number, number]>) limb(b, x0, ty, x0 - L * 0.13, ty + L * dy, L * 0.04, L * 0.06, { base: lit(finC, k), gloss: 0.5 }, 0.8);
  // Rostrum, eye, antennae.
  const hx = x0 + L;
  const hy = yAt(1);
  limb(b, hx - L * 0.04, hy - L * 0.02, hx + L * 0.12, hy - L * 0.05, L * 0.03, L * 0.008, skinFor(1), alpha);
  limb(b, hx - L * 0.05, hy - L * 0.02, hx - L * 0.01, hy - L * 0.045, L * 0.025, L * 0.025, skinFor(1));
  eyeball(b, hx - L * 0.005, hy - L * 0.05, Math.max(1, L * 0.03), [40, 30, 30]);
  const ant = c.pattern === 'lateral' ? 1.2 : 0.85;
  const wav = Math.sin(frame * 1.6) * L * 0.03;
  const antCol: RGB = c.pattern === 'lateral' ? [250, 250, 250] : lit(body, 1.1);
  b.line(hx, hy, hx + L * 0.35 * ant, hy - L * 0.35 * ant + wav, antCol, 0.75);
  b.line(hx, hy + 1, hx + L * 0.45 * ant, hy - L * 0.12 + wav, antCol, 0.55);
  // Walking legs.
  for (let k = 0; k < 5; k++) {
    const t = 0.66 + k * 0.065;
    const lx = x0 + L * t;
    const ly = yAt(t) + hAt(0.7) * 0.6;
    const step = Math.sin(frame * (Math.PI / 2) + k * 1.3) * L * 0.035;
    const kneeX = lx + L * 0.03 + step * 0.5;
    const kneeY = (ly + groundY) / 2 - L * 0.02;
    const legSk: Skin = { base: lit(body, 0.95), gloss: 0.3 };
    if (dead) limb(b, lx, ly, lx + 2, ly - L * 0.1, L * 0.015, L * 0.01, legSk, 0.5);
    else {
      limb(b, lx, ly, kneeX, kneeY, L * 0.016, L * 0.013, legSk, 0.75);
      limb(b, kneeX, kneeY, lx + step, groundY, L * 0.013, L * 0.008, legSk, 0.75);
    }
  }
}

/**
 * A gastropod shell: a glossy body whorl coiling to an apex at upper left,
 * suture lines between whorls, fine growth lines across them, the morph's
 * bands or speckle, an aperture lip and a wet highlight.
 */
function shellSpiral(b: Buf, cx: number, cy: number, r: number, c: CritterColours): void {
  const main = hex(c.body);
  const accent = hex(c.accent);
  const seed = Math.round(main[0] + r);
  blob(b, cx, cy, r, r * 0.92, -0.15, {
    base: main,
    gloss: 0.55,
    bump: 0.25,
    bumpScale: Math.max(0.8, r / 18),
    seed,
    patCol: accent,
    pattern: (x, y) => {
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const d = Math.hypot(nx + 0.3, ny + 0.35);
      const ang = Math.atan2(ny + 0.35, nx + 0.3);
      const spiral = (ang / (Math.PI * 2) + d * 1.7 + 10) % 1;
      // Suture: a thin dark seam between whorls.
      let a = spiral < 0.05 && d > 0.12 ? 0.6 : 0;
      // Growth lines across the whorl.
      a = Math.max(a, Math.max(0, Math.sin(ang * 38) - 0.9) * 2.5 * 0.35);
      if (c.pattern === 'stripes') a = Math.max(a, Math.sin(spiral * Math.PI * 6) > 0.45 ? 0.85 : 0);
      if (c.pattern === 'bars') a = Math.max(a, Math.sin(ang * 6 + d * 3) > 0.5 ? 0.85 : 0);
      if (c.pattern === 'speckle') a = Math.max(a, hh(Math.floor(x / 1.5), Math.floor(y / 1.5), seed) > 0.86 ? 0.8 : 0);
      return a;
    },
  });
  // Apex whorls.
  blob(b, cx - r * 0.32, cy - r * 0.36, r * 0.3, r * 0.26, -0.3, { base: lit(main, 1.12), gloss: 0.5 }, 0.95);
  blob(b, cx - r * 0.42, cy - r * 0.48, r * 0.13, r * 0.11, -0.3, { base: lit(main, 1.2), gloss: 0.5 }, 0.95);
}

/**
 * Snail: shell as above over a soft, slightly translucent foot that ripples
 * along the ground, with a head, two tentacles with eye tips and the mantle
 * edge at the aperture.
 */
function paintSnail(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const groundY = b.h - 2;
  const foot = hex(c.belly);
  const r = L * 0.42;
  const cx = b.w * 0.45;
  const cy = groundY - r - L * 0.12;
  if (!dead) {
    const ripple = frame * 0.8;
    const footSk: Skin = { base: foot, gloss: 0.45, bump: 0.5, bumpScale: Math.max(0.8, L / 40), seed: 9 };
    blob(b, cx + r * 0.15, groundY - L * 0.08, r * 1.25, L * 0.09, 0, footSk, 0.95);
    for (let k = 0; k < 6; k++) b.line(cx - r * 0.8 + k * r * 0.35 + Math.sin(ripple + k) * 1, groundY - L * 0.02, cx - r * 0.75 + k * r * 0.35, groundY - L * 0.12, lit(foot, 0.85), 0.25);
    const hx = cx + r * 1.3;
    const hy = groundY - L * 0.12;
    blob(b, hx, hy, L * 0.1, L * 0.075, 0.2, footSk, 0.95);
    const wave = Math.sin(frame * 1.5) * L * 0.05;
    limb(b, hx + L * 0.04, hy - L * 0.04, hx + L * 0.16, hy - L * 0.22 + wave, L * 0.03, L * 0.018, footSk);
    limb(b, hx, hy - L * 0.04, hx + L * 0.06, hy - L * 0.25 - wave, L * 0.03, L * 0.018, footSk);
    blob(b, hx + L * 0.16, hy - L * 0.22 + wave, L * 0.018, L * 0.018, 0, { base: [20, 18, 18], gloss: 0.8 });
  }
  shellSpiral(b, cx, cy, r, c);
}

/**
 * Hermit crab: a borrowed pale shell behind, banded jointed walking legs with
 * dark tips, a larger claw in front, eyes on stalks and twitching antennae.
 */
function paintCrab(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean): void {
  const groundY = b.h - 2;
  const legs = hex(c.fin);
  const tipC = hex(c.accent);
  const body = hex(c.body);
  const r = L * 0.36;
  const cx = b.w * 0.38;
  const cy = groundY - r - L * 0.14;
  shellSpiral(b, cx, cy, r, { ...c, body: '#c8b090', accent: '#8a7458', pattern: 'speckle' });
  const fx = cx + r * 0.75;
  const legSk: Skin = { base: legs, gloss: 0.4, bump: 0.3, seed: 4 };
  for (let k = 0; k < 3; k++) {
    const lx = fx + k * L * 0.06;
    const ly = cy + r * 0.2;
    const step = dead ? 0 : Math.sin(frame * (Math.PI / 2) + k * 2) * L * 0.05;
    const kneeX = lx + L * 0.14 + step;
    const kneeY = ly - L * 0.06;
    const w = Math.max(2, L * 0.05);
    limb(b, lx, ly, kneeX, kneeY, w, w * 0.85, legSk);
    limb(b, kneeX, kneeY, kneeX + L * 0.08, groundY - 0.5, w * 0.8, w * 0.4, legSk);
    blob(b, kneeX, kneeY, w * 0.45, w * 0.4, 0, { base: lit(tipC, 1.1), gloss: 0.4 }, 0.8);
    limb(b, kneeX + L * 0.06, groundY - L * 0.04, kneeX + L * 0.08, groundY - 0.5, w * 0.4, w * 0.25, { base: lit(tipC, 0.7), gloss: 0.3 });
  }
  // Claw: palm and fingers.
  blob(b, fx + L * 0.22, cy + r * 0.15, L * 0.1, L * 0.065, 0.1, { base: body, gloss: 0.5, bump: 0.6, bumpScale: Math.max(0.8, L / 50), seed: 7 });
  limb(b, fx + L * 0.28, cy + r * 0.1, fx + L * 0.36, cy + r * 0.13, L * 0.035, L * 0.015, { base: lit(tipC, 0.9), gloss: 0.5 });
  // Eyes on stalks and antennae.
  limb(b, fx + L * 0.05, cy - r * 0.2, fx + L * 0.12, cy - r * 0.55, L * 0.03, L * 0.025, { base: lit(body, 1.05), gloss: 0.3 });
  blob(b, fx + L * 0.12, cy - r * 0.6, L * 0.03, L * 0.028, 0, { base: [15, 15, 15], gloss: 0.9 });
  b.line(fx + L * 0.02, cy - r * 0.15, fx + L * 0.25, cy - r * 0.45 + Math.sin(frame) * 1.5, lit(tipC, 1.1), 0.75);
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
