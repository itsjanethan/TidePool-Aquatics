/**
 * FishPainter: paints a fish sprite sheet from a Phenotype. Pure (no Phaser,
 * no DOM), so the same code renders tank sprites, specimen portraits in the
 * fish card, the developer morph gallery and headless tests.
 *
 * The fish is built in layers, back to front:
 *   far pectoral -> caudal fin -> dorsal / anal / adipose fins -> body base
 *   (countershaded, lit as a rounded volume) -> pattern layers -> scales and
 *   metallic glints -> gill plate, markings (gravid spot, wen) -> eye, mouth,
 *   barbels / sucker / bristles -> near pectoral and pelvic fins -> soft
 *   silhouette (a coverage-based rim and anti-aliased alpha edge, no hard
 *   outline and no posterisation since v0.7: sheets are drawn with linear
 *   filtering at the tank view's detail scale).
 *
 * Sheet layout: SWIM_FRAMES swim-cycle frames, then TURN_FRAMES frames of the
 * fish yawing toward the viewer (used mid-turn before the sprite flips).
 * Fish face right.
 */
import type { CaudalShape } from '../../data/speciesTypes';
import type { Phenotype, RGB } from '../../sim/phenotype';

export const SWIM_FRAMES = 8;
export const TURN_FRAMES = 3;
export const SHEET_FRAMES = SWIM_FRAMES + TURN_FRAMES;
/** Yaw angles (radians) of the turn frames. */
export const TURN_YAWS = [0.55, 0.95, 1.3];

/** Tail length relative to body length, by tail shape. */
const TAIL_REL: Record<CaudalShape, number> = { fork: 0.3, round: 0.28, fan: 0.4, delta: 0.62, veil: 0.75, sword: 0.42, double_sword: 0.42, lyre: 0.48, twin: 0.5, spade: 0.36 };
/** Tail height (fully spread) relative to body height. */
const TAIL_H: Record<CaudalShape, number> = { fork: 1.0, round: 0.95, fan: 1.3, delta: 1.75, veil: 1.6, sword: 1.05, double_sword: 1.1, lyre: 1.35, twin: 1.4, spade: 1.0 };

export interface FishFrameImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export interface FishSheet {
  width: number;
  height: number;
  frames: Array<Uint8ClampedArray<ArrayBuffer>>;
  /** Body length in pixels (without tail), for gameplay hit-tests. */
  bodyLen: number;
}

// ---------------------------------------------------------------------------
// Small colour + noise helpers (allocation-light).

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (c: RGB, k: number): RGB => (k >= 1 ? mixC(c, [255, 255, 255], Math.min(1, k - 1)) : [c[0] * Math.max(0, k), c[1] * Math.max(0, k), c[2] * Math.max(0, k)]);

/** Thin-film iridescence: hue shifts with the viewing angle (teal, blue, violet, green). */
const iridescent = (h: number): RGB => {
  const a = Math.PI * 2 * h;
  return [96 + 70 * Math.cos(a + 2.2), 176 + 60 * Math.cos(a), 222 + 33 * Math.cos(a - 1.6)];
};

function h2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise 0..1. */
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s);
  const b = h2(xi + 1, yi, s);
  const c = h2(xi, yi + 1, s);
  const d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Distance to the nearest jittered cell point (Worley), for reticulated patterns. */
function cells(x: number, y: number, s: number): { d1: number; d2: number; id: number } {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox + h2(xi + ox, yi + oy, s);
      const cy = yi + oy + h2(xi + ox, yi + oy, s + 17);
      const d = Math.hypot(x - cx, y - cy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = (xi + ox) * 31 + (yi + oy);
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}

// ---------------------------------------------------------------------------
// Frame buffer with layer masks.

class Frame {
  data: Uint8ClampedArray<ArrayBuffer>;
  /** 1 = body pixel (for outlining). */
  body: Uint8Array;
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
    this.body = new Uint8Array(w * h);
  }
  set(x: number, y: number, c: RGB, a = 1, isBody = false): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0.01) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
    if (isBody) this.body[y * this.w + x] = 1;
  }
  /** Multiplies colour of an existing pixel (keeps alpha). */
  scale(x: number, y: number, k: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] *= k;
    this.data[i + 1] *= k;
    this.data[i + 2] *= k;
  }
}

// ---------------------------------------------------------------------------
// Geometry shared by all frames of a sheet.

interface Geo {
  W: number;
  H: number;
  cy: number;
  x0: number; // tail base (body start)
  bodyLen: number;
  bodyH: number;
  tailLen: number;
  tailHalf: number;
  dorsalH: number;
  analH: number;
  pivot: number;
  top: Float32Array;
  bot: Float32Array;
}

/**
 * Body outline per shape. stalk: peduncle half-height; ped: peduncle length;
 * peak: deepest point; snout: head-tip height; head: >1 pointier head;
 * topK/botK: back vs belly depth; mouth: head tip shift (+ down, - up).
 */
interface ShapeDef { stalk: number; ped: number; peak: number; snout: number; head: number; topK: number; botK: number; mouth: number }
/** Fish outlines. Invertebrates and land animals are painted by critterArt.ts instead. */
const SHAPES: Partial<Record<Phenotype['shape'], ShapeDef>> = {
  slender: { stalk: 0.3, ped: 0.1, peak: 0.52, snout: 0.2, head: 0.95, topK: 1, botK: 1, mouth: 0 },
  torpedo: { stalk: 0.3, ped: 0.08, peak: 0.52, snout: 0.18, head: 1.05, topK: 0.9, botK: 1.02, mouth: -0.18 },
  deep: { stalk: 0.34, ped: 0.08, peak: 0.47, snout: 0.24, head: 0.9, topK: 1.06, botK: 0.98, mouth: -0.05 },
  livebearer: { stalk: 0.32, ped: 0.1, peak: 0.52, snout: 0.22, head: 0.95, topK: 0.84, botK: 1.16, mouth: -0.28 },
  catfish: { stalk: 0.3, ped: 0.11, peak: 0.44, snout: 0.38, head: 0.8, topK: 1.3, botK: 0.6, mouth: 0.45 },
  pleco: { stalk: 0.18, ped: 0.08, peak: 0.72, snout: 0.5, head: 0.6, topK: 1.22, botK: 0.42, mouth: 0.6 },
  goldfish: { stalk: 0.3, ped: 0.07, peak: 0.5, snout: 0.3, head: 0.85, topK: 1.06, botK: 1.02, mouth: 0 },
};

function profile(shape: Phenotype['shape'], t: number): { v: number; s: ShapeDef } {
  const s = SHAPES[shape] ?? SHAPES.slender!;
  let v: number;
  if (t < s.peak) {
    // Ease-in-out from the narrow peduncle to the deepest point.
    const x = clamp01((t - s.ped * 0.5) / (s.peak - s.ped * 0.5));
    v = s.stalk + (1 - s.stalk) * Math.pow((1 - Math.cos(x * Math.PI)) / 2, 0.75);
  }
  else v = s.snout + (1 - s.snout) * Math.pow(Math.cos((((t - s.peak) / (1 - s.peak)) * Math.PI) / 2), s.head);
  return { v, s };
}

function geometry(p: Phenotype, L: number): Geo {
  // L is the nominal length (body + a standard forked tail) so individuals of
  // one species share a body size whatever their tail.
  const bodyLen = Math.max(10, Math.round(L / (1 + TAIL_REL.fork)));
  const bodyH = Math.max(5, Math.round(bodyLen * p.heightRatio * 1.15));
  const cs = Math.sqrt(p.caudalSize);
  const tailLen = Math.max(3, Math.round(bodyLen * TAIL_REL[p.caudal] * p.caudalSize * (p.fry ? 0.8 : 1)));
  const tailHalf = Math.max(3, (bodyH * TAIL_H[p.caudal] * cs) / 2);
  const dorsalH = bodyH * (p.dorsalSail ? 0.62 : p.shape === 'pleco' ? 0.55 : 0.36) * p.dorsalSize * Math.sqrt(p.finSize) * (p.fry ? 0.6 : 1);
  const analH = bodyH * (p.finSize > 1.3 ? 0.42 : 0.24) * Math.sqrt(p.finSize);
  const extra = p.caudal === 'double_sword' || p.caudal === 'sword' ? bodyLen * 0.22 * p.caudalSize : p.caudal === 'lyre' ? bodyLen * 0.12 : 0;
  const droop = p.caudal === 'veil' ? tailHalf * 0.35 : 0;
  const up = Math.max(bodyH * 0.6 + dorsalH + 3, tailHalf + 2, p.telescope ? bodyH * 0.75 : 0);
  const down = Math.max(bodyH * 0.6 + analH + bodyH * 0.25 * p.gravid + 3, tailHalf + droop + extra * 0.25 + 2);
  const half = Math.ceil(Math.max(up, down));
  const H = half * 2 + 4;
  const W = Math.ceil(bodyLen + tailLen + extra + 8);
  const x0 = Math.ceil(tailLen + extra + 3);
  const top = new Float32Array(bodyLen);
  const bot = new Float32Array(bodyLen);
  for (let i = 0; i < bodyLen; i++) {
    const t = i / (bodyLen - 1);
    const { v, s } = profile(p.shape, t);
    let b = v * s.botK;
    // Gravid belly and egg-laden roundness.
    b += (p.gravid * 0.42 + p.plump * 0.22) * Math.max(0, Math.sin(clamp01((t - 0.2) / 0.5) * Math.PI));
    // Mouth position: the head tip sits higher (upturned) or lower (bottom feeders).
    const shift = s.mouth * (bodyH / 2) * 0.45 * smooth(s.peak, 1, t);
    top[i] = Math.max(1, (bodyH / 2) * v * s.topK - shift);
    bot[i] = Math.max(1, (bodyH / 2) * b + shift);
  }
  return { W, H, cy: Math.floor(H / 2), x0, bodyLen, bodyH, tailLen, tailHalf, dorsalH, analH, pivot: x0 + bodyLen * 0.5, top, bot };
}

// ---------------------------------------------------------------------------
// Painting.

export function paintFishSheet(p: Phenotype, L: number): FishSheet {
  const g = geometry(p, L);
  const frames: FishSheet['frames'] = [];
  for (let f = 0; f < SWIM_FRAMES; f++) frames.push(paint(p, g, (f / SWIM_FRAMES) * Math.PI * 2, 0).data);
  for (const yaw of TURN_YAWS) frames.push(paint(p, g, 0.6, yaw).data);
  return { width: g.W, height: g.H, frames, bodyLen: g.bodyLen };
}

/** One still frame, for portraits. */
export function paintFishPortrait(p: Phenotype, L: number, phase = 1.1): FishFrameImage {
  const g = geometry(p, L);
  const fr = paint(p, g, phase, 0);
  return { width: g.W, height: g.H, data: fr.data };
}

function paint(p: Phenotype, g: Geo, phase: number, yaw: number): Frame {
  const fr = new Frame(g.W, g.H);
  const { cy, x0, bodyLen, bodyH } = g;
  const seed = p.variant * 977 + 13;
  // Seen nearly head-on a fish is still as wide as its body is thick.
  const cosY = Math.max(Math.cos(yaw), (bodyH * 0.6) / bodyLen);
  const sinY = Math.sin(yaw);
  // Yaw compresses the fish toward its middle (seen turning end-on).
  const X = (x: number) => g.pivot + (x - g.pivot) * cosY;
  const put = (x: number, y: number, c: RGB, a = 1, isBody = false) => {
    if (yaw === 0) fr.set(x, y, c, a, isBody);
    else {
      // Fill the compressed span so no gaps appear.
      const xa = X(x - 0.5);
      const xb = X(x + 0.5);
      for (let xx = Math.round(xa); xx <= Math.round(xb); xx++) fr.set(xx, y, c, a, isBody);
    }
  };
  const fade = 1 - p.finClarity;

  // Swim wave: tiny vertical travel toward the tail; the tail sweeps sideways.
  const amp = Math.max(0.4, bodyH * 0.035);
  const offAt = (t: number) => amp * (1 - t) * (1 - t) * Math.sin(phase + (1 - t) * 2.4);
  const off = new Float32Array(bodyLen);
  for (let i = 0; i < bodyLen; i++) off[i] = offAt(i / (bodyLen - 1));
  const sweep = Math.sin(phase) * 0.8;

  // ---- far-side pectoral (behind the body, darker) --------------------
  const pecI = Math.round(bodyLen * (p.shape === 'pleco' ? 0.72 : 0.7));
  const pecLen = Math.max(3, bodyLen * (p.shape === 'pleco' ? 0.3 : p.shape === 'catfish' ? 0.22 : 0.15) * Math.sqrt(p.finSize));
  drawPectoral(fr, put, p, x0 + pecI + 2, cy + bodyH * 0.12 + off[pecI], pecLen, phase + 1.4, 0.55, fade);

  // ---- caudal fin -----------------------------------------------------
  drawCaudal(fr, put, p, g, phase, sweep, off[0], fade, seed);

  // ---- dorsal, adipose, anal, pelvic ----------------------------------
  drawDorsal(put, p, g, off, fade, seed, phase);
  if (p.features.includes('adipose')) {
    const ai = Math.round(bodyLen * 0.16);
    const ah = Math.max(1.5, bodyH * 0.12);
    for (let k = 0; k < Math.max(2, bodyLen * 0.06); k++) for (let y = 0; y < ah * (1 - k / (bodyLen * 0.08 + 1)); y++) put(x0 + ai + k, cy - g.top[ai] + off[ai] - y, lit(p.fin, 0.9), 0.75 * fade + 0.2);
  }
  drawAnal(put, p, g, off, fade, phase);

  // ---- body ------------------------------------------------------------
  const lightY = -0.78;
  const lightZ = 0.63;
  const scaleSize = Math.max(2, Math.round(bodyH / (p.shape === 'goldfish' ? 6 : 7)));
  const glintPos = (phase / (Math.PI * 2)) * 1.6 - 0.3; // band sweeping along the body over the cycle
  const bodyA = 1 - p.bodyClarity;
  const neon = p.patterns.some((l) => l.type === 'neon');
  for (let i = 0; i < bodyLen; i++) {
    const t = i / (bodyLen - 1); // 0 tail .. 1 snout
    const yTop = Math.round(-g.top[i] + off[i]);
    const yBot = Math.round(g.bot[i] + off[i]);
    const span = Math.max(1, yBot - yTop);
    for (let yy = yTop; yy <= yBot; yy++) {
      const v = (yy - yTop) / span; // 0 back .. 1 belly
      // Countershading.
      let c: RGB = v < 0.48 ? mixC(p.back, p.body, smooth(0, 0.44, v)) : mixC(p.body, p.belly, smooth(0.52, 0.9, v));
      // Pattern layers on the body, sampled four times per texel so every pattern
      // edge is soft (anti-aliased) rather than a hard step.
      let glow = 0;
      for (const layer of p.patterns) {
        if (layer.region !== 'body' && layer.region !== 'all') continue;
        let a = 0;
        for (const [sx, sy] of SUB) {
          const ti = (i + sx) / (bodyLen - 1);
          const vi = (yy + sy - yTop) / span;
          a += bodyPattern(layer.type, ti, vi, i + sx, yy + sy - off[i], bodyLen, bodyH, seed, phase);
        }
        a = (a / SUB.length) * layer.strength;
        if (a > 0) c = mixC(c, patternColour(layer.type, layer.colour, t, v, p), Math.min(1, a));
        // The neon stripe is structural colour: it stays bright on the shaded flank.
        if (layer.type === 'neon' && Math.abs(v - 0.42) < 0.12) glow = Math.max(glow, a * smooth(0.12, 0.02, Math.abs(v - 0.42)));
      }
      // Rounded lighting from above and in front.
      const ny = (v - 0.5) * 2;
      const nz = Math.sqrt(Math.max(0, 1 - ny * ny));
      const lambert = Math.max(0, ny * lightY + nz * lightZ); // light from above (negative y)
      // Wrapped diffuse: light bends round a wet, slightly translucent body.
      const wrap = Math.max(0, (ny * lightY + nz * lightZ + 0.3) / 1.3);
      let k = 0.44 + 0.66 * wrap;
      // Rim light along the back ridge; silvery belly sheen.
      if (v < 0.07) k += 0.05;
      k -= 0.1 * smooth(0.2, 0, v); // the dorsal ridge turns away from the viewer
      // Silvery guanine on the lower flank and belly.
      if (v > 0.6 && !p.fry) c = mixC(c, [232, 236, 232], 0.2 * smooth(0.6, 0.92, v) * (1 - p.bodyClarity));
      // Head slightly darker toward the gill, tail stalk slightly darker.
      k -= 0.06 * smooth(0.7, 0.78, t) * (1 - smooth(0.78, 0.86, t));
      k -= 0.08 * (1 - smooth(0, 0.12, t));
      // Body bend: the rear third catches more or less light as it flexes.
      k += 0.06 * Math.sin(phase + 1.2) * (1 - smooth(0, 0.4, t));
      // Turning: the far half recedes into shadow.
      if (yaw) k -= 0.22 * sinY * (1 - t);
      // Scales: arc edges and, for metallic fish, glinting scale centres.
      if (p.shape !== 'pleco' && !p.fry && bodyH >= 9 && v > 0.12 && v < 0.86 && t > 0.06 && t < 0.78) {
        const su = i / scaleSize;
        const col = Math.floor(su);
        const sv = (yy - off[i]) / scaleSize + (col % 2) * 0.5;
        const fu = su - col;
        const fv = sv - Math.floor(sv);
        const arc = Math.abs(fu - 0.15 - Math.pow(fv - 0.5, 2) * 1.2);
        // Each scale is a small cupped plate: dark at its overlapped edge, a lit crown, and
        // its own slight tilt so the flank breaks into a soft mosaic of reflections.
        const tilt = (h2(col, Math.floor(sv), seed + 31) - 0.5) * 0.06;
        if (arc < 0.12) k -= (0.04 + 0.04 * p.metallic) * (1 - arc / 0.12);
        else k += tilt + 0.03 * Math.max(0, 1 - Math.abs(fv - 0.38) * 4) * Math.max(0, 1 - Math.abs(fu - 0.45) * 3);
        if (p.metallic > 0 && arc >= 0.12) {
          const band = Math.abs(t - glintPos - (v - 0.4) * 0.3);
          const glint = Math.max(0, 1 - band * 6) * (h2(col, Math.floor(sv), seed) > 0.45 ? 1 : 0.3);
          k += p.metallic * (0.12 + 0.35 * glint) * (1 - Math.abs(v - 0.4));
        }
      }
      // Specular shine along the upper flank.
      const shine = Math.max(0, 1 - Math.abs(v - 0.26) / 0.07) * smooth(0.2, 0.35, t) * (1 - smooth(0.75, 0.86, t));
      k += shine * (0.14 + 0.25 * p.metallic);
      c = lit(c, k);
      if (glow > 0) c = mixC(c, mixC(p.patterns.find((l) => l.type === 'neon')?.colour ?? [80, 200, 255], [210, 250, 255], 0.25), Math.min(0.8, glow * 0.75));
      if (p.metallic > 0.3 && v < 0.7) c = mixC(c, [200, 230, 255], p.metallic * 0.12 * lambert);
      // Iridescence on the flank: the hue slides with the body angle through the beat,
      // so the sheen shimmers as the fish swims. Strongest on metallic and neon fish.
      const iri = (p.metallic * 0.5 + (neon ? 0.35 : 0)) * (1 - Math.abs(v - 0.36) * 1.9) * smooth(0.08, 0.3, t) * (1 - smooth(0.82, 0.95, t));
      if (iri > 0.01 && !p.fry) c = mixC(c, iridescent(t * 0.9 + v * 0.7 + Math.sin(phase) * 0.12 + yaw * 0.3), Math.min(0.55, iri * 0.6));
      // Thin tissue near the tail stalk glows a little warmer (light passing through).
      if (t < 0.12 && !p.albino) c = mixC(c, lit(c, 1.12), 0.25 * (1 - t / 0.12));
      put(x0 + i, cy + yy, c, bodyA, true);
    }
  }

  // ---- markings ---------------------------------------------------------
  if (p.gravid > 0.2) {
    // Gravid spot: dark patch above the anal fin that grows with pregnancy.
    const gi = Math.round(bodyLen * 0.36);
    const r = bodyH * 0.12 * (0.5 + p.gravid);
    const gy = cy + g.bot[gi] * 0.45 + off[gi];
    for (let y = -r; y <= r; y++) for (let x = -r * 1.3; x <= r * 1.3; x++) {
      const dd = Math.hypot(x / 1.3, y) / r;
      if (dd <= 1) put(x0 + gi + x, gy + y, [36, 30, 34], 0.55 * p.gravid * (1 - dd * 0.5));
    }
  }
  if (p.features.includes('scutes')) {
    // Armour plates: a lateral seam and plate boundaries.
    for (let i = Math.round(bodyLen * 0.08); i < bodyLen * 0.72; i++) {
      const midY = cy + (g.bot[i] - g.top[i]) * 0.5 * 0.2 + off[i];
      put(x0 + i, midY, lit(p.body, 0.62), 0.55);
      if (i % Math.max(3, Math.round(bodyH / 4)) === 0) {
        for (let y = -g.top[i] * 0.85; y < g.bot[i] * 0.8; y++) put(x0 + i - Math.abs(y) * 0.15, cy + y + off[i], lit(p.body, 0.75), 0.35);
      }
    }
  }
  if (p.wen) {
    // Oranda hood: a raspberry-textured growth over the top and sides of the head.
    const start = Math.round(bodyLen * 0.68);
    const hoodC = mixC(p.accent, p.body, 0.25);
    for (let k = 0; k < 26; k++) {
      const bi = start + h2(k, 7, seed) * (bodyLen - 2 - start);
      const ii = Math.min(bodyLen - 1, Math.round(bi));
      const along = (bi - start) / Math.max(1, bodyLen - start);
      const up = g.top[ii] * (0.45 + 0.6 * h2(k, 8, seed) * (1 - along * 0.6));
      const by = cy + off[ii] - up;
      const r = Math.max(1.2, bodyH * (0.05 + 0.05 * h2(k, 9, seed)));
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d <= 1) put(x0 + bi + x, by + y, lit(hoodC, 1.12 - d * 0.35 - (y / r) * 0.12), 1, true);
      }
    }
  }

  // ---- gill plate: a soft curved operculum edge behind the eye -------------
  const gillI = Math.round(bodyLen * (p.shape === 'pleco' ? 0.8 : p.shape === 'goldfish' ? 0.74 : 0.75));
  if (bodyH >= 8 && !p.fry) {
    const gt = g.top[gillI];
    const gb = g.bot[gillI];
    for (let yy = Math.round(-gt * 0.75); yy < gb * 0.8; yy++) {
      const rel = yy >= 0 ? yy / gb : yy / gt;
      const curve = rel * rel * bodyH * 0.12;
      const x = x0 + gillI - curve;
      put(x, cy + yy + off[gillI], lit(p.body, 0.72), 0.32);
      put(x + 1, cy + yy + off[gillI], lit(p.body, 1.14), 0.22);
    }
  }

  // ---- eye ------------------------------------------------------------------
  drawEye(put, p, g, off);

  // ---- mouth and head features -------------------------------------------
  const snoutX = x0 + bodyLen - 1;
  const sOff = off[bodyLen - 1];
  const under = p.shape === 'catfish' || p.shape === 'pleco';
  const mouthY = cy + sOff + (under ? g.bot[bodyLen - 1] * 0.8 : p.features.includes('upturned') ? -g.top[bodyLen - 1] * 0.4 : 0.5);
  put(snoutX, mouthY, lit(p.body, 0.42));
  put(snoutX - 1, mouthY, lit(p.body, 0.5), 0.8);
  if (p.features.includes('barbels')) {
    for (let k = 1; k <= Math.max(2, bodyH * 0.22); k++) {
      put(snoutX - 1 + k * 0.45, mouthY + k * 0.8, lit(p.belly, 0.85), 0.9);
      put(snoutX - 3 + k * 0.15, mouthY + k, lit(p.belly, 0.75), 0.8);
    }
  }
  if (p.features.includes('sucker')) {
    for (let k = 0; k < Math.max(3, bodyLen * 0.12); k++) put(snoutX - k, mouthY + 1, lit(p.body, 0.55), 0.9);
  }
  if (p.features.includes('bristles') && !p.fry) {
    const n = p.male && p.maturity > 0.6 ? 9 : 3;
    for (let k = 0; k < n; k++) {
      const bi = bodyLen - 2 - Math.floor(h2(k, 1, seed) * bodyLen * 0.14);
      const by = cy + off[bi] - g.top[bi] * (0.2 + h2(k, 2, seed) * 0.8);
      const len = p.male ? 1 + Math.floor(h2(k, 3, seed) * 3) : 1;
      for (let s = 0; s < len; s++) put(x0 + bi + s * 0.6, by - s, lit(mixC(p.body, p.belly, 0.6), 1.15), 1);
    }
  }
  if (p.features.includes('lateral') && !p.fry) {
    for (let i = Math.round(bodyLen * 0.12); i < bodyLen * 0.74; i++) put(x0 + i, cy + off[i] - g.top[i] * 0.05, lit(p.body, 1.25), 0.25);
  }
  if (p.features.includes('gonopodium')) {
    const gi = Math.round(bodyLen * 0.38);
    for (let k = 0; k < bodyLen * 0.2; k++) put(x0 + gi - k, cy + g.bot[gi] + off[gi] + k * 0.18, lit(p.fin, 0.85), 0.85);
  }

  // ---- near-side fins -------------------------------------------------------
  drawPectoral(fr, put, p, x0 + pecI - bodyH * 0.05, cy + bodyH * 0.2 + off[pecI], pecLen, phase, 1, fade);
  const pvI = Math.round(bodyLen * 0.5);
  const pvLen = Math.max(2, bodyH * (p.finSize > 1.3 ? 0.4 : 0.22));
  for (let k = 1; k <= pvLen; k++) put(x0 + pvI - k * 0.7, cy + g.bot[pvI] + off[pvI] + k * 0.6 - 1, mixC(p.fin, p.belly, 0.3), 0.6 * fade + 0.25);

  finish(fr, p);
  return fr;
}

function patternColour(type: string, colour: RGB, t: number, v: number, p: Phenotype): RGB {
  if (type === 'neon') return v > 0.45 && t < 0.55 ? (p.albino ? [236, 150, 150] : [214, 38, 52]) : colour;
  if (type === 'gradient') return mixC(p.body, colour, 1);
  return colour;
}

/** Strength 0..1 of a pattern at a body pixel. */
function bodyPattern(type: string, t: number, v: number, i: number, y: number, bodyLen: number, bodyH: number, seed: number, phase: number): number {
  switch (type) {
    case 'neon': {
      // Iridescent stripe through the upper middle; red lower rear handled by colour.
      const sv = 0.42 - 0.03 * Math.sin(t * Math.PI);
      const w = Math.max(0.07, 1.4 / Math.max(6, bodyH));
      const stripe = smooth(w, w * 0.55, Math.abs(v - sv)) * smooth(0.06, 0.14, t) * smooth(0.95, 0.85, t);
      const red = v > sv + w * 0.8 && v < 0.88 ? smooth(0.58, 0.44, t) * smooth(0.9, 0.8, v) : 0;
      return Math.max(stripe, red);
    }
    case 'stripes': {
      const n = bodyH > 14 ? 4 : 3;
      const s = Math.sin((v * n + 0.15) * Math.PI * 2 + noise(t * 4, 0, seed) * 0.6);
      return t < 0.92 && v > 0.15 && v < 0.85 && s > 0.45 ? 1 : 0;
    }
    case 'bars': {
      const n = 7;
      const s = Math.sin((t * n + noise(v * 3, t * 2, seed) * 0.5) * Math.PI * 2);
      return t > 0.06 && t < 0.8 && v > 0.08 && v < 0.9 && s > 0.35 ? 0.85 : 0;
    }
    case 'spots':
    case 'speckle': {
      const sz = type === 'spots' ? Math.max(1.6, bodyH / 6) : Math.max(1, bodyH / 10);
      const c = cells(i / sz, y / sz, seed + 5);
      const thr = type === 'spots' ? 0.28 : 0.22;
      return v < 0.88 && c.d1 < thr && h2(c.id, 3, seed) > (type === 'spots' ? 0.45 : 0.3) ? 1 : 0;
    }
    case 'blotch': {
      const n = noise(i / (bodyH * 0.5), y / (bodyH * 0.5), seed + 9);
      return n > 0.62 && v < 0.8 ? smooth(0.62, 0.7, n) * 0.85 : 0;
    }
    case 'calico': {
      const n = noise(i / (bodyH * 0.35), y / (bodyH * 0.35), seed);
      const m = noise(i / (bodyH * 0.2) + 40, y / (bodyH * 0.2), seed + 3);
      return n > 0.58 ? 0.9 : m > 0.74 ? 0.7 : 0;
    }
    case 'cobra': {
      const c = cells(i / Math.max(2, bodyH * 0.16), y / Math.max(2, bodyH * 0.12), seed + 2);
      return v < 0.75 && t < 0.85 && c.d2 - c.d1 < 0.16 ? 0.9 : 0;
    }
    case 'mosaic':
      return 0; // tail region only
    case 'tuxedo': {
      const edge = 0.52 + (noise(v * 3, 1, seed) - 0.5) * 0.18;
      return t < edge && t > 0.04 && v > 0.08 && v < 0.85 ? smooth(edge, edge - 0.05, t) : 0;
    }
    case 'tailspot': {
      const dx = (t - 0.07) * bodyLen;
      const dy = y;
      const r = bodyH * 0.24;
      const ear = Math.hypot(dx - r * 0.55, Math.abs(dy) - r * 0.95) < r * 0.45;
      return Math.hypot(dx, dy) < r || ear ? 1 : 0;
    }
    case 'clown':
    case 'clown_edge': {
      // Clownfish: head band behind the eye, a mid band bulging forward, a thin band at the tail root.
      // The edge layer is drawn first in black and slightly wider, giving the white bands their outline.
      const grow = type === 'clown_edge' ? Math.max(0.018, 0.9 / bodyLen) : 0;
      const wob = (noise(v * 3, 2, seed) - 0.5) * 0.025;
      const bands: Array<[number, number]> = [[0.75, 0.055], [0.47 + 0.05 * Math.sin(v * Math.PI), 0.06], [0.06, 0.028]];
      for (const [c, w] of bands) if (Math.abs(t - c - wob) < w + grow && v > 0.02 && v < 0.98) return 1;
      return 0;
    }
    case 'bands': {
      // Three bold vertical bars: through the eye, the front of the body and the rear (cardinals, rams).
      const wob = (noise(v * 2, 5, seed) - 0.5) * 0.02;
      const bands: Array<[number, number]> = [[0.88, 0.035], [0.6, 0.06], [0.3, 0.05]];
      for (const [c, w] of bands) if (Math.abs(t - c - wob) < w && v > 0.03 && v < 0.97) return 0.95;
      return 0;
    }
    case 'gradient':
      return smooth(0.6, 0.15, t) * 0.85;
    case 'lateral':
      return Math.abs(v - 0.45) < 0.05 && t > 0.1 && t < 0.85 ? 0.8 + 0.2 * Math.sin(phase + t * 8) : 0;
    default:
      return 0;
  }
}

type Put = (x: number, y: number, c: RGB, a?: number, isBody?: boolean) => void;

function drawPectoral(_fr: Frame, put: Put, p: Phenotype, x: number, y: number, len: number, phase: number, k: number, fade: number): void {
  // A translucent fan of rays sweeping back from the gill, flapping with the phase.
  const flap = Math.sin(phase * 2) * 0.35;
  const base = lit(mixC(p.fin, p.belly, 0.45), k);
  const spread = 0.55;
  const rays = 5;
  for (let r = 0; r <= rays; r++) {
    const ang = 0.35 + flap + (r / rays) * spread;
    for (let s = 0; s < len; s++) {
      const a = (0.16 + 0.22 * fade) * (1 - (s / len) * 0.6) * (k < 1 ? 0.75 : 1);
      put(x - Math.cos(ang) * s, y + Math.sin(ang) * s, r % 2 === 0 ? lit(base, 0.85) : base, a);
    }
  }
}

function drawCaudal(_fr: Frame, put: Put, p: Phenotype, g: Geo, phase: number, sweep: number, stalkOff: number, fade: number, seed: number): void {
  const { cy, x0, tailLen, tailHalf } = g;
  const stalkH = g.top[0];
  const fore = 0.7 + 0.3 * Math.cos(sweep); // foreshortening as it sweeps
  const len = tailLen * fore;
  const rays = p.caudal === 'veil' || p.caudal === 'delta' ? 9 : 6;
  const mosaic = p.patterns.find((l) => (l.type === 'mosaic' || l.type === 'cobra' || l.type === 'spots') && (l.region === 'tail' || l.region === 'all'));
  const spotTail = p.patterns.find((l) => l.type === 'spots' && l.region === 'body' && p.speciesId === 'guppy');
  const lobes = p.caudal === 'twin' ? [0, 1] : [0];
  for (const lobe of lobes) {
    const hMul = lobe ? 0.78 : 1;
    for (let dx = 0; dx <= len; dx++) {
      const d = dx / Math.max(1, len);
      let half: number;
      switch (p.caudal) {
        case 'delta': half = stalkH + (tailHalf - stalkH) * Math.pow(d, 0.85); break;
        case 'veil': half = stalkH + (tailHalf - stalkH) * Math.sin(Math.min(1, d * 1.15) * Math.PI * 0.5); break;
        case 'round': half = stalkH + (tailHalf - stalkH) * Math.sin(d * Math.PI * 0.75); break;
        case 'spade': half = stalkH + (tailHalf - stalkH) * Math.sin(d * Math.PI) * 1.1; break;
        case 'fan':
        case 'twin': half = stalkH + (tailHalf - stalkH) * Math.sin(d * Math.PI * 0.62); break;
        default: half = stalkH + (tailHalf - stalkH) * Math.min(1, d * 1.4);
      }
      half *= hMul;
      const wave = Math.sin(phase - 0.9 - d * 1.6) * g.bodyH * 0.06 * d * (p.caudal === 'veil' ? 2 : 1);
      const droop = p.caudal === 'veil' ? d * d * tailHalf * 0.3 : 0;
      const yc = stalkOff + wave + droop + lobe * 1.5;
      const x = x0 - dx - lobe;
      for (let y = -Math.ceil(half); y <= Math.ceil(half); y++) {
        const ay = Math.abs(y) / Math.max(1, half);
        if (ay > 1) continue;
        // Fork notch, lyre and sword cut-outs.
        if (p.caudal === 'fork' && ay < 0.42 * smooth(0.45, 1, d) && d > 0.45) continue;
        if (p.caudal === 'lyre' && ay < 0.7 * smooth(0.3, 1, d) && d > 0.3) continue;
        if (p.caudal === 'twin' && ay < 0.25 * smooth(0.6, 1, d) && d > 0.6) continue;
        if (p.caudal === 'round' && Math.hypot(d * 1.1, ay) > 1.08) continue;
        // Membrane: richer colour near the body, clearer toward the edge; rays as
        // thin darker lines fanning from the peduncle; soft folds ripple with the beat.
        const ang = Math.atan2(y, dx + g.bodyH * 0.15);
        const rayPos = ((ang / Math.PI) * rays * 2 + 50) % 1;
        const ray = rayPos < 0.16 + 0.08 * (1 - d);
        const fold = Math.sin(ang * rays * 0.9 + phase * 1.3) * 0.08;
        let c: RGB = mixC(lit(p.fin, 0.92), p.fin, d);
        let a = (0.24 + 0.7 * fade) * (1 - smooth(0.55, 1.05, d) * (0.45 * (1 - fade) + 0.15));
        c = lit(c, 1 + fold);
        if (ray) { c = lit(c, 0.74); a = Math.min(1, a + 0.22); }
        if (mosaic) {
          const cl = cells(dx / Math.max(2, g.bodyH * 0.16), y / Math.max(2, g.bodyH * 0.16), seed + 4);
          if (cl.d2 - cl.d1 < 0.2) c = mixC(c, mosaic.colour, 0.85 * mosaic.strength);
        }
        if (spotTail && h2(Math.floor(dx / 2), Math.floor(y / 2), seed) < 0.12 * spotTail.strength) c = spotTail.colour;
        // Ragged, lighter edge on long fins; darker edge on short ones.
        const longFin = p.caudal === 'delta' || p.caudal === 'veil' || p.caudal === 'lyre';
        const rag = longFin ? (noise(y * 0.5, dx * 0.05, seed) - 0.5) * 0.12 : 0;
        if (d > 1 + rag - 0.001 && longFin) continue;
        if (ay > 0.88 || d > 0.93 + rag) { c = lit(c, longFin ? 1.12 : 0.8); a *= 0.9; }
        // The base of the tail is fleshy.
        if (d < 0.07) { c = mixC(c, p.body, 0.65); a = 1; }
        put(x, cy + y + yc, c, a);
      }
    }
  }
  // Sword extensions: long pointed rays from the top and/or bottom edge.
  if (p.caudal === 'sword' || p.caudal === 'double_sword' || p.caudal === 'lyre') {
    const swordLen = len * (p.caudal === 'lyre' ? 0.35 : 0.6) + g.bodyH * 0.2;
    const edges = p.caudal === 'sword' ? [1] : [-1, 1];
    for (const sgn of edges) {
      for (let k = 0; k < swordLen; k++) {
        const d = k / swordLen;
        const yy = cy + stalkOff + sgn * (tailHalf * 0.85 - d * tailHalf * 0.15 * (p.caudal === 'lyre' ? -1 : 1));
        const xx = x0 - len * 0.9 - k;
        const col = p.patterns.find((l) => l.type === 'mosaic')?.colour ?? lit(p.fin, 1.1);
        put(xx, yy, col, 0.95 - d * 0.3);
        if (d < 0.6) put(xx, yy - sgn, p.fin, 0.6 - d * 0.6);
      }
    }
  }
}

function drawDorsal(put: Put, p: Phenotype, g: Geo, off: Float32Array, fade: number, seed: number, phase: number): void {
  const { cy, x0, bodyLen, dorsalH } = g;
  const dStart = Math.round(bodyLen * (p.dorsalSail ? 0.22 : p.shape === 'pleco' ? 0.4 : 0.36));
  const dEnd = Math.round(bodyLen * (p.dorsalSail ? 0.82 : p.shape === 'pleco' ? 0.76 : 0.6));
  const mosaic = p.patterns.find((l) => l.type === 'mosaic' || l.type === 'cobra');
  for (let i = dStart; i < dEnd; i++) {
    const t = (i - dStart) / Math.max(1, dEnd - dStart);
    let hgt = dorsalH * (p.dorsalSail ? Math.sin(t * Math.PI * 0.95) * (0.7 + 0.3 * t) : p.finSize > 1.3 ? 1 - t * 0.45 : 1 - t * 0.85) + 1;
    hgt += Math.sin(phase + t * 3) * dorsalH * 0.04;
    const top = cy - g.top[i] + off[i];
    const spacing = Math.max(2.5, g.bodyH * 0.12);
    for (let y = 1; y <= hgt; y++) {
      const ray = ((i + y * (p.dorsalSail ? 0.35 : 0.55)) % spacing) < 1;
      let c = mixC(p.fin, p.body, p.dorsalSail ? 0.15 : 0.3 * (1 - y / hgt));
      if (ray) c = lit(c, 0.78);
      if (mosaic && h2(i >> 1, y >> 1, seed) < 0.3) c = mixC(c, mosaic.colour, 0.8);
      if (p.dorsalSail && y > hgt * 0.75) c = lit(c, 1.15);
      let a = y >= hgt - 1 ? 0.45 : (0.24 + 0.7 * fade);
      if (ray) a = Math.min(1, a + 0.2);
      put(x0 + i - y * (p.dorsalSail ? 0.15 : 0.3), top - y + 0.5, c, a);
    }
  }
}

function drawAnal(put: Put, p: Phenotype, g: Geo, off: Float32Array, fade: number, phase: number): void {
  const { cy, x0, bodyLen, analH } = g;
  const aStart = Math.round(bodyLen * 0.18);
  const aEnd = Math.round(bodyLen * (p.finSize > 1.3 ? 0.46 : 0.4));
  for (let i = aStart; i < aEnd; i++) {
    const t = (i - aStart) / Math.max(1, aEnd - aStart);
    const hgt = analH * (1 - Math.abs(t - 0.35) * 1.1) + Math.sin(phase + t * 3) * analH * 0.05;
    const bot = cy + g.bot[i] + off[i];
    const spacing = Math.max(2.5, g.bodyH * 0.12);
    for (let y = 1; y <= hgt; y++) {
      const ray = ((i + y * 0.5) % spacing) < 1;
      put(x0 + i - y * 0.3, bot + y - 0.5, ray ? lit(p.fin, 0.8) : mixC(p.fin, p.belly, 0.2 * (1 - y / hgt)), (ray ? 0.42 : 0.2) + 0.62 * fade * (1 - (y / hgt) * 0.3));
    }
  }
}

function drawEye(put: Put, p: Phenotype, g: Geo, off: Float32Array): void {
  const { cy, x0, bodyLen, bodyH } = g;
  const eyeI = Math.round(bodyLen * (p.shape === 'catfish' ? 0.83 : p.shape === 'goldfish' ? 0.84 : p.shape === 'pleco' ? 0.86 : 0.875));
  const under = p.shape === 'pleco' || p.shape === 'catfish';
  let er = Math.max(1.2, bodyH * (p.shape === 'goldfish' ? 0.11 : under ? 0.1 : 0.125)) * (p.fry ? 1.7 : 1);
  let ey = cy + off[eyeI] - g.top[eyeI] * (under ? 0.6 : 0.3);
  const ex = x0 + eyeI;
  if (p.telescope) {
    er *= 1.4;
    ey = cy + off[eyeI] - g.top[eyeI] * 0.7;
    for (let y = -er * 1.15; y <= er * 1.15; y++) for (let x = -er * 1.15; x <= er * 1.15; x++) {
      const d = Math.hypot(x, y) / (er * 1.15);
      if (d <= 1) put(ex + x, ey + y, lit(p.body, 1.05 - 0.3 * d - (y / er) * 0.1), 1, true);
    }
  }
  const R = Math.ceil(er + 1);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d > er + 0.7) continue;
      if (d > er) { put(ex + x, ey + y, lit(p.body, 0.5), 0.5 * (1 - (d - er) / 0.7)); continue; }
      // Iris lit from above with a darker limbal ring; the pupil has a soft edge.
      let c: RGB = lit(p.iris, 1.08 - (y / er) * 0.32 - (d / er) * 0.2);
      if (p.speciesId === 'neon_tetra' && y < 0) c = mixC(c, [90, 200, 235], 0.55);
      c = mixC(c, lit(p.iris, 0.45), smooth(0.78, 1, d / er) * 0.7);
      const pupil = p.albino ? ([110, 18, 28] as RGB) : ([6, 6, 12] as RGB);
      c = mixC(c, pupil, smooth(0.58, 0.44, d / er));
      put(ex + x, ey + y, c, 1, true);
    }
  }
  // Wet cornea: a bright window reflection and a faint second one.
  const hr = Math.max(0.6, er * 0.26);
  for (let y = -hr; y <= hr; y++) for (let x = -hr; x <= hr; x++) {
    const d = Math.hypot(x, y) / hr;
    if (d <= 1) put(ex - er * 0.28 + x, ey - er * 0.34 + y, [255, 255, 255], (er > 1.8 ? 0.95 : 0.75) * (1 - d * d * 0.6));
  }
  if (er > 2.5) put(ex + er * 0.3, ey + er * 0.32, [220, 235, 255], 0.35);
}

/**
 * Soft silhouette: the body gets a gentle darker rim where its coverage falls
 * off (a rounded edge in shadow, not a drawn outline), then every edge in the
 * frame (body and fins) gets one texel of anti-aliasing so sheets drawn with
 * linear filtering have clean, natural edges.
 */
function finish(fr: Frame, p: Phenotype): void {
  const { w, h, data, body } = fr;
  const rimK = p.fry ? 0.12 : 0.3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!body[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && body[yy * w + xx]) n++;
      }
      if (n === 9) continue;
      const k = 1 - rimK * smooth(0, 0.6, 1 - n / 9);
      const j = i * 4;
      data[j] *= k;
      data[j + 1] *= k;
      data[j + 2] *= k;
      if (data[j + 3] < 235 && !p.fry) data[j + 3] = 235;
    }
  }
  // One-texel alpha ramp on every edge; newly covered texels take their neighbours' colour.
  const src = data.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const a0 = src[j + 3];
      let an = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of NEIGH) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = (yy * w + xx) * 4;
        const a = src[k + 3];
        an += a;
        r += src[k] * a;
        g += src[k + 1] * a;
        b += src[k + 2] * a;
      }
      const a1 = (a0 * 4 + an) / 8;
      if (Math.abs(a1 - a0) < 10) continue;
      if (a0 === 0 && an > 0) {
        data[j] = r / an;
        data[j + 1] = g / an;
        data[j + 2] = b / an;
      }
      data[j + 3] = a1;
    }
  }
}

const NEIGH: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Sub-texel sample offsets for anti-aliased patterns. */
const SUB: Array<[number, number]> = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
