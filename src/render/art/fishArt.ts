/**
 * Procedural high-detail fish sprites for the aquarium view.
 *
 * Each species/morph/sex/size gets an 8-frame swim cycle drawn into a pixel
 * buffer: rounded shading, a shine streak, subtle scale texture, translucent
 * rayed fins, a beating tail (foreshortened as it sweeps toward and away from
 * the viewer), fluttering pectoral fins, a detailed eye and species touches.
 * Fish face right in the texture.
 */
import Phaser from 'phaser';
import { getSpecies } from '../../data/species';
import type { ColourMorph, FinStyle, PatternType, SpeciesDef } from '../../data/speciesTypes';
import { getMorph } from '../../sim/fish';
import type { Sex } from '../../sim/types';
import { hexToRgb, mix } from './pixel';

export const FISH_FRAMES = 8;

interface Look {
  body: string;
  belly: string;
  fin: string;
  accent: string;
  pattern: PatternType;
  fins: FinStyle;
}

export function lookFor(sp: SpeciesDef, morph: ColourMorph, sex: Sex): Look {
  const female = sex === 'female' && morph.female;
  const base = female ? { ...morph, ...morph.female } : morph;
  let fins: FinStyle = morph.finStyleOverride ?? sp.body.fins;
  if (sex === 'female' && sp.tags.includes('livebearer') && (fins === 'delta' || fins === 'sail')) fins = 'short';
  return { body: base.body, belly: base.belly, fin: base.fin, accent: base.accent, pattern: (base.pattern ?? morph.pattern) as PatternType, fins };
}

const TAIL_FRAC: Record<FinStyle, number> = { short: 0.22, fan: 0.28, delta: 0.42, long: 0.36, sail: 0.24, twin: 0.36 };
const TAIL_HEIGHT: Record<FinStyle, number> = { short: 0.95, fan: 1.25, delta: 1.8, long: 1.45, sail: 1.0, twin: 1.4 };

function profile(shape: SpeciesDef['body']['shape'], t: number): { top: number; bottom: number } {
  const hump = (stalk: number, peakAt: number, snout: number, sharp = 0.7) =>
    t < peakAt
      ? stalk + (1 - stalk) * Math.sin(((t / peakAt) * Math.PI) / 2)
      : snout + (1 - snout) * Math.pow(Math.cos((((t - peakAt) / (1 - peakAt)) * Math.PI) / 2), sharp);
  switch (shape) {
    case 'deep': { const v = hump(0.42, 0.5, 0.3); return { top: v, bottom: v }; }
    case 'livebearer': { const v = hump(0.36, 0.55, 0.28); return { top: v * 0.88, bottom: v * 1.12 }; }
    case 'catfish': { const v = hump(0.36, 0.55, 0.55, 0.5); return { top: v * 1.25, bottom: v * 0.65 }; }
    case 'pleco': { const v = hump(0.22, 0.78, 0.55, 0.5); return { top: v * 1.2, bottom: v * 0.45 }; }
    case 'goldfish': { const v = hump(0.42, 0.5, 0.5, 0.5); return { top: v * 1.02, bottom: v }; }
    case 'torpedo': { const v = hump(0.38, 0.5, 0.33, 0.8); return { top: v * 0.95, bottom: v }; }
    default: { const v = hump(0.34, 0.52, 0.3); return { top: v, bottom: v }; }
  }
}

// ---------------------------------------------------------------------------
// Pixel buffer with alpha compositing.

type RGB = [number, number, number];

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
    if (oa <= 0) return;
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
}

const rgb = (hex: string): RGB => hexToRgb(hex);
const lerpC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const bright = (c: RGB, k: number): RGB => (k >= 1 ? lerpC(c, [255, 255, 255], Math.min(1, k - 1)) : lerpC([0, 0, 0], c, Math.max(0, k)));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface FishTextureInfo {
  key: string;
  width: number;
  height: number;
}

export function fishTextureKey(speciesId: string, morphId: string, sex: Sex, length: number): string {
  return `fishhd:${speciesId}:${morphId}:${sex}:${length}`;
}

/** Quantise display length so textures are shared and regenerated rarely. */
export function quantiseLength(px: number): number {
  const L = Math.max(14, Math.round(px));
  return L < 40 ? L - (L % 2) : L - (L % 4);
}

export function ensureFishTexture(scene: Phaser.Scene, speciesId: string, morphId: string, sex: Sex, length: number): FishTextureInfo {
  const L = quantiseLength(length);
  const key = fishTextureKey(speciesId, morphId, sex, L);
  if (scene.textures.exists(key)) {
    const f = scene.textures.getFrame(key, '0');
    return { key, width: f.width, height: f.height };
  }
  const sp = getSpecies(speciesId);
  const look = lookFor(sp, getMorph(sp, morphId), sex);
  const tailFrac = TAIL_FRAC[look.fins];
  const bodyLen = Math.max(8, Math.round(L * (1 - tailFrac)));
  const bodyH = Math.max(5, Math.round(bodyLen * sp.body.heightRatio * 1.15));
  const tailH = Math.max(5, Math.round(bodyH * TAIL_HEIGHT[look.fins]));
  const dorsalH = Math.round(bodyH * (look.fins === 'sail' ? 0.85 : look.fins === 'long' ? 0.6 : 0.38));
  const H = Math.max(bodyH + dorsalH * 2, tailH) + 8;
  const W = L + 6;
  const canvas = scene.textures.createCanvas(key, W * FISH_FRAMES, H)!;
  const ctx = canvas.getContext();
  for (let f = 0; f < FISH_FRAMES; f++) {
    const buf = new Buf(W, H);
    drawFish(buf, sp, look, morphId, sex, L, bodyLen, bodyH, tailH, dorsalH, (f / FISH_FRAMES) * Math.PI * 2);
    ctx.putImageData(new ImageData(buf.data, W, H), f * W, 0);
  }
  canvas.refresh();
  for (let f = 0; f < FISH_FRAMES; f++) canvas.add(String(f), 0, f * W, 0, W, H);
  return { key, width: W, height: H };
}

function drawFish(
  b: Buf, sp: SpeciesDef, look: Look, morphId: string, sex: Sex,
  L: number, bodyLen: number, bodyH: number, tailH: number, dorsalH: number, phase: number,
): void {
  const cy = Math.floor(b.h / 2);
  const x0 = 3 + (L - bodyLen); // body start (tail base)
  const shape = sp.body.shape;
  const body = rgb(look.body);
  const belly = rgb(look.belly);
  const fin = rgb(look.fin);
  const accent = rgb(look.accent);
  const bodyDark = bright(body, 0.62);
  const seed = hash(`${sp.id}${morphId}${sex}`);

  // Swim wave: small vertical travel toward the tail.
  const amp = Math.max(0.6, bodyH * 0.05);
  const yOff = (t: number) => amp * (1 - t) * (1 - t) * Math.sin(phase + (1 - t) * 2.4);

  const cols: Array<{ top: number; bottom: number; off: number }> = [];
  for (let i = 0; i < bodyLen; i++) {
    const t = i / (bodyLen - 1);
    const p = profile(shape, t);
    cols.push({ top: Math.max(1, (bodyH / 2) * p.top), bottom: Math.max(1, (bodyH / 2) * p.bottom), off: yOff(t) });
  }
  const stalk = cols[0];

  // --- Caudal fin (behind body) -----------------------------------------
  const sweep = Math.sin(phase) * 0.75;
  const tailScale = Math.cos(sweep); // foreshortening as the tail sweeps
  const tailLen = (x0 - 3) * (0.72 + 0.28 * tailScale);
  const finAlpha = look.fins === 'delta' || look.fins === 'long' || look.fins === 'twin' ? 0.82 : 0.88;
  const drawTail = (lobeOffset: number, heightMul: number) => {
    for (let dx = 0; dx <= tailLen; dx++) {
      const d = dx / Math.max(1, tailLen); // 0 base .. 1 tip
      let half: number;
      if (look.fins === 'delta' || look.fins === 'long') half = stalk.top + (tailH / 2 - stalk.top) * Math.pow(d, 0.8);
      else if (look.fins === 'fan' || look.fins === 'twin') half = stalk.top + (tailH / 2 - stalk.top) * Math.sin(d * Math.PI * 0.62);
      else half = stalk.top + (tailH / 2 - stalk.top) * Math.min(1, d * 1.35);
      half *= heightMul;
      const x = x0 - dx;
      const off = stalk.off + Math.sin(phase - 0.9) * amp * 1.6 * d + lobeOffset;
      for (let y = -Math.ceil(half); y <= Math.ceil(half); y++) {
        const ay = Math.abs(y) / Math.max(1, half);
        if (ay > 1) continue;
        if (look.fins === 'short' && ay < 0.38 && d > 0.55) continue; // forked tail
        let c = fin;
        // Fin rays fanning from the stalk.
        const ang = Math.atan2(y, dx + 2);
        if (Math.abs(((ang * 9) % 1 + 1) % 1 - 0.5) > 0.4) c = bright(c, 0.78);
        if (look.pattern === 'mosaic' && ((dx * 3 + y * 5 + seed) % 7 === 0 || (dx + y * 2) % 9 === 0)) c = accent;
        if (look.pattern === 'tailspot' && d < 0.25 && ay < 0.6) c = accent;
        const edge = ay > 0.86 || d > 0.94;
        if (edge) c = bright(c, look.fins === 'delta' ? 1.12 : 0.75);
        const a = finAlpha * (1 - d * 0.25) * (edge ? 0.9 : 1);
        b.set(x, cy + y + off, c, a);
      }
    }
  };
  drawTail(0, 1);
  if (look.fins === 'twin') drawTail(1, 0.75);

  // --- Dorsal fin -----------------------------------------------------------
  const dStart = Math.round(bodyLen * (shape === 'pleco' ? 0.4 : 0.35));
  const dEnd = Math.round(bodyLen * (look.fins === 'sail' ? 0.86 : shape === 'pleco' ? 0.78 : 0.6));
  for (let i = dStart; i < dEnd; i++) {
    const t = (i - dStart) / Math.max(1, dEnd - dStart);
    const hgt = dorsalH * (look.fins === 'sail' ? Math.sin(t * Math.PI * 0.92) : look.fins === 'long' ? 1 - t * 0.5 : 1 - t) + 1;
    const top = cy - cols[i].top + cols[i].off;
    for (let y = 1; y <= hgt; y++) {
      let c = lerpC(fin, body, 0.3);
      if ((i + y) % 3 === 0) c = bright(c, 0.8);
      if (look.pattern === 'mosaic' && (i * 7 + y * 3) % 6 === 0) c = accent;
      b.set(x0 + i - y * 0.25, top - y + 0.5, y >= hgt - 1 ? bright(c, 1.15) : c, 0.85);
    }
  }

  // --- Anal and pelvic fins ---------------------------------------------
  const aStart = Math.round(bodyLen * 0.2);
  const aEnd = Math.round(bodyLen * 0.42);
  const analH = bodyH * (look.fins === 'long' ? 0.5 : 0.24);
  for (let i = aStart; i < aEnd; i++) {
    const t = (i - aStart) / Math.max(1, aEnd - aStart);
    const hgt = analH * (1 - Math.abs(t - 0.35) * 1.2);
    const bot = cy + cols[i].bottom + cols[i].off;
    for (let y = 1; y <= hgt; y++) b.set(x0 + i - y * 0.3, bot + y - 0.5, (i + y) % 3 === 0 ? bright(fin, 0.8) : fin, 0.8);
  }
  const pvI = Math.round(bodyLen * 0.55);
  for (let k = 1; k <= Math.max(2, bodyH * 0.22); k++) b.set(x0 + pvI - k * 0.6, cy + cols[pvI].bottom + cols[pvI].off + k * 0.7, fin, 0.7);

  // --- Body ---------------------------------------------------------------
  for (let i = 0; i < bodyLen; i++) {
    const { top, bottom, off } = cols[i];
    const t = i / (bodyLen - 1);
    const y0 = Math.round(-top + off);
    const y1 = Math.round(bottom + off);
    for (let yy = y0; yy <= y1; yy++) {
      const v = (yy - y0) / Math.max(1, y1 - y0); // 0 top .. 1 bottom
      // Base colour: darker back, body, pale belly.
      let c = v < 0.5 ? lerpC(bodyDark, body, smooth(0, 0.42, v)) : lerpC(body, belly, smooth(0.5, 0.86, v));
      // Patterns.
      switch (look.pattern) {
        case 'neon': {
          const sv = 0.4;
          const thick = Math.max(0.09, 1.6 / Math.max(6, y1 - y0));
          if (Math.abs(v - sv) < thick && t > 0.08 && t < 0.9) c = bright(accent, 1.1 + 0.15 * Math.sin(t * 9 + phase));
          else if (v > sv + thick && t < 0.56) c = lerpC([216, 40, 58], belly, smooth(0.4, 0.62, t));
          break;
        }
        case 'stripes': {
          const span = y1 - y0;
          const rows = span > 14 ? [0.3, 0.48, 0.66] : [0.35, 0.62];
          if (rows.some((r) => Math.abs(v - r) < 0.9 / Math.max(6, span)) && t < 0.9) c = accent;
          break;
        }
        case 'bars':
          if (t > 0.08 && t < 0.78 && Math.floor(t * 10) % 2 === 0 && v > 0.12 && v < 0.88) c = lerpC(c, accent, 0.75);
          break;
        case 'spots':
        case 'speckle': {
          const n = hash(`${Math.floor(i / 2)},${Math.floor(yy / 2)},${morphId}`) % 100;
          if (n < (look.pattern === 'spots' ? 10 : 14) && v < 0.86) c = accent;
          break;
        }
        case 'calico': {
          const n = hash(`${Math.floor(i / 5)},${Math.floor((yy + 40) / 5)}`) % 100;
          if (n < 34) c = lerpC(c, accent, 0.85);
          else if (n < 44) c = [30, 28, 36];
          break;
        }
        case 'tailspot':
          if (t < 0.14 && Math.abs(yy - off) < top * 0.8) c = accent;
          break;
        default:
          break;
      }
      // Rounded lighting: bright upper flank, shadowed lower edge.
      let k = 1 + 0.18 * Math.max(0, 1 - Math.abs(v - 0.3) / 0.35);
      k -= 0.22 * smooth(0.82, 1, v);
      k -= 0.12 * (1 - smooth(0, 0.12, v));
      // Shine streak along the back half.
      if (v > 0.16 && v < 0.27 && t > 0.25 && t < 0.82) k += 0.18;
      // Subtle scale lattice.
      if ((i + yy * 2) % 5 === 0 && v > 0.15 && v < 0.82 && shape !== 'pleco') k -= 0.06;
      c = bright(c, k);
      const edge = yy === y0 || yy === y1 || i === bodyLen - 1;
      if (edge) c = bright(c, 0.62);
      b.set(x0 + i, cy + yy, c, 1);
    }
  }

  // Red cap / oranda wen on the head.
  if (morphId === 'redcap' || (shape === 'goldfish' && morphId === 'oranda')) {
    for (let i = Math.round(bodyLen * 0.74); i < bodyLen - 1; i++) {
      const { top, off } = cols[i];
      const capH = Math.max(2, top * (morphId === 'redcap' ? 0.7 : 0.35));
      for (let y = 0; y < capH; y++) {
        const bump = (i + y * 3) % 4 === 0 ? 0.85 : 1.05;
        b.set(x0 + i, cy - top + off + y + (morphId === 'oranda' ? -1 : 0), bright(accent, bump), 1);
      }
    }
  }

  // Gill cover.
  const gillI = Math.round(bodyLen * 0.76);
  if (bodyH >= 7) {
    const g = cols[gillI];
    for (let yy = Math.round(-g.top + 2); yy < g.bottom - 1; yy++) {
      const curve = Math.round(Math.pow(Math.abs(yy) / Math.max(1, g.top), 2) * 2);
      b.set(x0 + gillI - curve, cy + yy + g.off, bright(body, 0.7), 0.7);
    }
  }

  // Pectoral fin (flutters).
  const pecX = x0 + Math.round(bodyLen * 0.7);
  const pecLen = Math.max(3, Math.round(bodyLen * (shape === 'pleco' ? 0.28 : 0.14)));
  const flap = Math.sin(phase * 2) * 0.5;
  for (let k = 0; k < pecLen; k++) {
    for (let w = 0; w < Math.max(1, pecLen * 0.35 * (1 - k / pecLen)); w++) {
      b.set(pecX - k, cy + bodyH * 0.12 + k * (0.45 + flap) + w + cols[Math.min(bodyLen - 1, pecX - x0)].off, lerpC(fin, belly, 0.35), 0.55);
    }
  }

  // Eye.
  const eyeI = Math.round(bodyLen * (shape === 'catfish' ? 0.83 : shape === 'goldfish' ? 0.84 : 0.87));
  const ec = cols[eyeI];
  const eyeY = cy + ec.off - ec.top * (shape === 'pleco' || shape === 'catfish' ? 0.52 : 0.28);
  const ex = x0 + eyeI;
  const er = Math.max(1.2, bodyH * (shape === 'goldfish' ? 0.13 : 0.15));
  const iris: RGB = look.pattern === 'neon' ? [120, 200, 220] : shape === 'goldfish' ? [40, 30, 20] : [214, 190, 120];
  for (let y = -Math.ceil(er); y <= Math.ceil(er); y++) {
    for (let x = -Math.ceil(er); x <= Math.ceil(er); x++) {
      const d = Math.hypot(x, y);
      if (d > er) continue;
      b.set(ex + x, eyeY + y, d > er * 0.62 ? iris : [12, 12, 18], 1);
    }
  }
  b.set(ex - Math.max(0, er * 0.35), eyeY - Math.max(0, er * 0.35), [255, 255, 255], 1);
  if (er > 2.5) b.set(ex - er * 0.35 + 1, eyeY - er * 0.35, [255, 255, 255], 0.7);

  // Mouth.
  const snoutX = x0 + bodyLen - 1;
  const mouthY = cy + cols[bodyLen - 1].off + (shape === 'catfish' || shape === 'pleco' ? cols[bodyLen - 1].bottom : 0.5);
  b.set(snoutX, mouthY, bright(body, 0.45), 1);
  b.set(snoutX - 1, mouthY, bright(body, 0.55), 0.8);

  // Catfish barbels, pleco sucker mouth and bristles.
  if (shape === 'catfish') {
    for (let k = 1; k <= Math.max(2, bodyH * 0.25); k++) {
      b.set(snoutX - 1 + k * 0.4, mouthY + k, bright(belly, 0.8), 0.9);
      b.set(snoutX - 3 + k * 0.2, mouthY + k, bright(belly, 0.7), 0.8);
    }
  }
  if (shape === 'pleco') {
    for (let k = 0; k < 4; k++) b.set(snoutX - k, mouthY + 1, bright(body, 0.5), 0.9);
    if (sex === 'male' && L > 30) {
      for (let k = 0; k < 7; k++) {
        const bx = snoutX - 2 - ((seed >> k) % 5);
        b.set(bx, cy + cols[bodyLen - 3].off - cols[bodyLen - 3].top + ((seed >> (k + 3)) % 3), lerpC(accent, body, 0.3), 1);
      }
    }
  }
}

/** Mini sprite colour used in overworld tanks. */
export function miniFishColour(speciesId: string, morphId: string): string {
  const sp = getSpecies(speciesId);
  const m = getMorph(sp, morphId);
  return m.pattern === 'neon' ? m.accent : m.fin === m.body ? m.body : mix(m.body, m.fin, 0.5);
}
