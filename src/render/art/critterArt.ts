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

function paintFrog(b: Buf, L: number, c: CritterColours, frame: number, dead: boolean, ft: CritterFeatures): void {
  const body = hex(c.body);
  const belly = hex(c.belly);
  const limb = hex(c.fin);
  const accent = hex(c.accent);
  const g = b.h - 2;
  const leap = frame === 3 && !dead;
  const crouch = frame === 2;
  const breathe = frame === 1 ? 0.04 : 0;
  // Body: a squat teardrop, rump low at the back, head up at the front.
  const cx = b.w * 0.45;
  const cy = g - L * (leap ? 0.42 : crouch ? 0.24 : 0.3);
  const rx = L * 0.42;
  const ry = L * (0.24 + breathe) * (leap ? 0.85 : 1);
  b.ellipse(cx, cy, rx, ry, (nx, ny) => {
    let col = ny > 0.35 ? belly : body;
    if (ny <= 0.35 && patternAt(c, (nx + 1) * rx, (ny + 1) * ry, 3)) col = accent;
    return [lit(col, 1.15 - ny * 0.35 - Math.abs(nx) * 0.1), 1];
  });
  // Head.
  const hx = cx + rx * 0.82;
  const hy = cy - ry * 0.25;
  b.ellipse(hx, hy, L * 0.2, L * 0.16, (_nx, ny) => [lit(ny > 0.3 ? belly : body, 1.15 - ny * 0.3), 1]);
  // Big eye with a highlight.
  b.ellipse(hx + L * 0.03, hy - L * 0.09, L * 0.075, L * 0.075, (nx, ny) => [nx < -0.2 && ny < -0.2 ? [240, 240, 230] : [12, 12, 16], 1]);
  b.line(hx + L * 0.16, hy + L * 0.03, hx + L * 0.07, hy + L * 0.06, lit(body, 0.6), 1);
  // Throat pulse.
  if (frame === 1) b.ellipse(hx - L * 0.02, hy + L * 0.12, L * 0.07, L * 0.04, () => [lit(belly, 1.1), 0.9]);
  // Hind leg: thigh, shin, long foot.
  const lc = lit(limb, 0.95);
  if (leap) {
    b.line(cx - rx * 0.6, cy + ry * 0.3, cx - rx * 1.3, cy + ry * 0.9, lc, 1, Math.max(2, L * 0.08));
    b.line(cx - rx * 1.3, cy + ry * 0.9, cx - rx * 1.9, cy + ry * 1.3, lc, 1, Math.max(1, L * 0.05));
    b.line(cx + rx * 0.5, cy + ry * 0.6, cx + rx * 1.1, cy + ry * 1.4, lc, 1, Math.max(1, L * 0.05));
  } else {
    b.ellipse(cx - rx * 0.55, cy + ry * 0.45, L * 0.16, L * 0.1, (_nx, ny) => [lit(limb, 1.05 - ny * 0.3), 1]);
    b.line(cx - rx * 0.7, g - 1, cx - rx * 0.05, g - 1, lc, 1, Math.max(1, L * 0.05));
    b.line(cx + rx * 0.55, cy + ry * 0.5, cx + rx * 0.62, g - 1, lc, 1, Math.max(1, L * 0.05));
    b.line(cx + rx * 0.62, g - 1, cx + rx * 0.85, g - 1, lc, 1, Math.max(1, L * 0.04));
  }
  if (ft.toePads) {
    b.set(cx + rx * 0.85, g - 1, lit(belly, 1.2));
    b.set(cx - rx * 0.05, g - 1, lit(belly, 1.2));
  }
  // Wet sheen.
  for (let i = 0; i < 4; i++) b.set(cx - rx * 0.2 + i * 2, cy - ry * 0.75, [255, 255, 255], 0.55);
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
