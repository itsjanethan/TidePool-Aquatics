/**
 * Procedural pixel-art fish. Each species/morph/sex/size combination is drawn
 * from body archetype parameters, so new species need only data.
 * Fish face right in the texture; two frames for the tail wag.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import { getSpecies } from '../../data/species';
import type { ColourMorph, FinStyle, PatternType, SpeciesDef } from '../../data/speciesTypes';
import { getMorph } from '../../sim/fish';
import type { Sex } from '../../sim/types';
import { makeTexture, mix, px, shade, type Ctx } from './pixel';

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
  // Female livebearers have small tails.
  if (sex === 'female' && sp.tags.includes('livebearer') && (fins === 'delta' || fins === 'sail')) fins = fins === 'sail' ? 'short' : 'short';
  return { body: base.body, belly: base.belly, fin: base.fin, accent: base.accent, pattern: (base.pattern ?? morph.pattern) as PatternType, fins };
}

const TAIL_FRAC: Record<FinStyle, number> = { short: 0.22, fan: 0.28, delta: 0.42, long: 0.36, sail: 0.24, twin: 0.34 };
const TAIL_HEIGHT: Record<FinStyle, number> = { short: 0.95, fan: 1.25, delta: 1.75, long: 1.4, sail: 1.0, twin: 1.35 };

function profile(shape: SpeciesDef['body']['shape'], t: number): { top: number; bottom: number } {
  const hump = (stalk: number, peakAt: number, snout: number, sharp = 0.7) =>
    t < peakAt
      ? stalk + (1 - stalk) * Math.sin(((t / peakAt) * Math.PI) / 2)
      : snout + (1 - snout) * Math.pow(Math.cos((((t - peakAt) / (1 - peakAt)) * Math.PI) / 2), sharp);
  switch (shape) {
    case 'deep': {
      const v = hump(0.45, 0.5, 0.3);
      return { top: v, bottom: v };
    }
    case 'livebearer': {
      const v = hump(0.38, 0.55, 0.28);
      return { top: v * 0.88, bottom: v * 1.12 };
    }
    case 'catfish': {
      const v = hump(0.38, 0.55, 0.55, 0.5);
      return { top: v * 1.25, bottom: v * 0.65 };
    }
    case 'pleco': {
      const v = hump(0.25, 0.78, 0.55, 0.5);
      return { top: v * 1.2, bottom: v * 0.45 };
    }
    case 'goldfish': {
      const v = hump(0.45, 0.5, 0.5, 0.5);
      return { top: v, bottom: v };
    }
    case 'torpedo': {
      const v = hump(0.4, 0.5, 0.35, 0.8);
      return { top: v * 0.95, bottom: v * 1.0 };
    }
    default: {
      const v = hump(0.36, 0.52, 0.3);
      return { top: v, bottom: v };
    }
  }
}

export interface FishTextureInfo {
  key: string;
  width: number;
  height: number;
}

export function fishTextureKey(speciesId: string, morphId: string, sex: Sex, length: number): string {
  return `fish:${speciesId}:${morphId}:${sex}:${length}`;
}

/** Quantise display length so textures are shared and regenerated rarely. */
export function quantiseLength(px: number): number {
  const L = Math.max(8, Math.round(px));
  return L < 24 ? L : L - (L % 2);
}

export function ensureFishTexture(scene: Phaser.Scene, speciesId: string, morphId: string, sex: Sex, length: number): FishTextureInfo {
  const L = quantiseLength(length);
  const key = fishTextureKey(speciesId, morphId, sex, L);
  if (scene.textures.exists(key)) {
    const f = scene.textures.getFrame(key, '0');
    return { key, width: f.width, height: f.height };
  }
  const sp = getSpecies(speciesId);
  const morph = getMorph(sp, morphId);
  const look = lookFor(sp, morph, sex);
  const tailFrac = TAIL_FRAC[look.fins];
  const bodyLen = Math.max(5, Math.round(L * (1 - tailFrac)));
  const bodyH = Math.max(3, Math.round(bodyLen * sp.body.heightRatio * 1.15));
  const tailH = Math.max(3, Math.round(bodyH * TAIL_HEIGHT[look.fins]));
  const dorsalH = Math.round(bodyH * (look.fins === 'sail' ? 0.85 : look.fins === 'long' ? 0.55 : 0.35));
  const H = Math.max(bodyH + dorsalH * 2, tailH) + 4;
  const W = L + 2;
  const tex = makeTexture(scene, key, W * 2, H, (ctx) => {
    for (let frame = 0; frame < 2; frame++) drawFish(ctx, frame * W, sp, look, morphId, sex, L, bodyLen, bodyH, tailH, dorsalH, H, frame);
  });
  tex.add('0', 0, 0, 0, W, H);
  tex.add('1', 0, W, 0, W, H);
  return { key, width: W, height: H };
}

function drawFish(
  ctx: Ctx, ox: number, sp: SpeciesDef, look: Look, morphId: string, sex: Sex,
  L: number, bodyLen: number, bodyH: number, tailH: number, dorsalH: number, H: number, frame: number,
): void {
  const cy = Math.floor(H / 2);
  const x0 = L - bodyLen + 1; // body start (tail base)
  const shape = sp.body.shape;
  const rng = new Rng(hash(`${sp.id}${morphId}${sex}`));
  const outline = shade(look.body, -0.5);
  const finEdge = shade(look.fin, -0.35);
  const wag = frame === 0 ? -1 : 1;

  // Column bounds of the body.
  const cols: Array<{ top: number; bottom: number }> = [];
  for (let i = 0; i < bodyLen; i++) {
    const t = i / (bodyLen - 1);
    const p = profile(shape, t);
    cols.push({ top: Math.max(1, Math.round((bodyH / 2) * p.top)), bottom: Math.max(1, Math.round((bodyH / 2) * p.bottom)) });
  }
  const stalk = cols[0];

  // --- Tail fin -----------------------------------------------------------
  const tailLen = x0;
  const drawTailColumn = (x: number, half: number, offset: number) => {
    for (let y = -half; y <= half; y++) {
      if (look.fins === 'short' && Math.abs(y) < half * 0.35 && x < tailLen * 0.45) continue; // fork notch
      const edge = Math.abs(y) === half || x === 0;
      let c = edge ? finEdge : look.fin;
      if (look.pattern === 'mosaic' && !edge && (x + y * 2) % 4 === 0) c = look.accent;
      if (look.pattern === 'tailspot' && x > tailLen - 3 && Math.abs(y) < half * 0.6) c = look.accent;
      px(ctx, ox + x, cy + y + offset, c);
    }
  };
  for (let x = 0; x < tailLen; x++) {
    const d = 1 - x / Math.max(1, tailLen); // 1 at tip, 0 at base
    let half: number;
    if (look.fins === 'delta' || look.fins === 'long') half = Math.round(stalk.top + (tailH / 2 - stalk.top) * d);
    else if (look.fins === 'fan' || look.fins === 'twin') half = Math.round(stalk.top + (tailH / 2 - stalk.top) * Math.sin(d * Math.PI * 0.6));
    else half = Math.round(stalk.top + (tailH / 2 - stalk.top) * Math.min(1, d * 1.4));
    const offset = Math.round(wag * d * (tailH / 10 + 0.6));
    drawTailColumn(x, Math.max(1, half), offset);
    if (look.fins === 'twin' && d > 0.3) drawTailColumn(x, Math.max(1, half - 2), offset + 1);
  }

  // --- Dorsal & anal fins -------------------------------------------------
  const dStart = Math.round(bodyLen * (shape === 'pleco' ? 0.4 : 0.35));
  const dEnd = Math.round(bodyLen * (look.fins === 'sail' ? 0.85 : shape === 'pleco' ? 0.78 : 0.6));
  for (let i = dStart; i < dEnd; i++) {
    const t = (i - dStart) / Math.max(1, dEnd - dStart);
    const hgt = Math.round(dorsalH * (look.fins === 'sail' ? Math.sin(t * Math.PI * 0.9) : 1 - t) + (shape === 'goldfish' ? 1 : 0));
    const top = cy - cols[i].top;
    for (let y = 1; y <= hgt; y++) px(ctx, ox + x0 + i, top - y, y === hgt ? finEdge : mix(look.fin, look.body, 0.25));
  }
  const aStart = Math.round(bodyLen * 0.22);
  const aEnd = Math.round(bodyLen * 0.42);
  const analH = Math.round(bodyH * (look.fins === 'long' ? 0.45 : 0.22));
  for (let i = aStart; i < aEnd; i++) {
    const t = (i - aStart) / Math.max(1, aEnd - aStart);
    const hgt = Math.round(analH * (1 - Math.abs(t - 0.4)));
    const bot = cy + cols[i].bottom;
    for (let y = 1; y <= hgt; y++) px(ctx, ox + x0 + i, bot + y, y === hgt ? finEdge : look.fin);
  }

  // --- Body ---------------------------------------------------------------
  for (let i = 0; i < bodyLen; i++) {
    const { top, bottom } = cols[i];
    const t = i / (bodyLen - 1);
    for (let y = -top; y <= bottom; y++) {
      const v = (y + top) / (top + bottom); // 0 top .. 1 bottom
      let c = v < 0.32 ? shade(look.body, -0.14) : v > 0.62 ? look.belly : look.body;
      // Patterns.
      switch (look.pattern) {
        case 'neon': {
          const stripeY = Math.round(-top * 0.15);
          const thick = Math.max(1, Math.round(bodyH * 0.13));
          if (y >= stripeY && y < stripeY + thick && t > 0.08 && t < 0.9) c = look.accent;
          else if (y >= stripeY + thick && t < 0.55) c = mix('#d8283a', look.belly, Math.max(0, (t - 0.35) * 3));
          break;
        }
        case 'stripes': {
          const span = top + bottom;
          const rows = span > 9 ? [0.3, 0.5, 0.7] : [0.35, 0.65];
          if (rows.some((r) => Math.round(r * span) === y + top) && t < 0.88) c = look.accent;
          break;
        }
        case 'bars':
          if (t > 0.08 && t < 0.75 && Math.floor(t * 9) % 2 === 0 && v > 0.15 && v < 0.85) c = mix(c, look.accent, 0.75);
          break;
        case 'spots':
        case 'speckle': {
          const n = hash(`${i},${y},${morphId}`) % 100;
          const dens = look.pattern === 'spots' ? 9 : 12;
          if (n < dens && v < 0.85) c = look.accent;
          break;
        }
        case 'calico': {
          const n = hash(`${Math.floor(i / 3)},${Math.floor((y + 20) / 3)}`) % 100;
          if (n < 35) c = look.accent;
          else if (n < 45) c = '#1e1c24';
          break;
        }
        case 'tailspot':
          if (t < 0.14 && Math.abs(y) < Math.max(1, top * 0.8)) c = look.accent;
          break;
        default:
          break;
      }
      const edge = y === -top || y === bottom || i === bodyLen - 1;
      px(ctx, ox + x0 + i, cy + y, edge ? outline : c);
    }
    // Shine line along the back.
    if (t > 0.3 && t < 0.8 && top > 2) px(ctx, ox + x0 + i, cy - top + 1, shade(look.body, 0.35));
  }
  // Molly/goldfish red cap variant: accent on head top.
  if (morphId === 'redcap') {
    for (let i = Math.round(bodyLen * 0.75); i < bodyLen - 1; i++) {
      for (let y = -cols[i].top + 1; y < -cols[i].top + Math.max(2, cols[i].top * 0.8); y++) px(ctx, ox + x0 + i, cy + y, look.accent);
    }
  }

  // Pectoral fin (translucent).
  const pecX = x0 + Math.round(bodyLen * 0.7);
  const pecLen = Math.max(2, Math.round(bodyLen * (shape === 'pleco' ? 0.25 : 0.12)));
  for (let k = 0; k < pecLen; k++) px(ctx, ox + pecX - k, cy + Math.round(bodyH * 0.12) + Math.round(k * 0.5) + (frame ? 0 : 1), mix(look.fin, look.belly, 0.4));

  // Gill line.
  const gillI = Math.round(bodyLen * 0.76);
  if (bodyH >= 6) for (let y = -cols[gillI].top + 2; y < cols[gillI].bottom - 1; y++) px(ctx, ox + x0 + gillI, cy + y, shade(look.body, -0.25));

  // Eye.
  const eyeI = Math.round(bodyLen * (shape === 'catfish' ? 0.82 : 0.86));
  const eyeY = cy - Math.round(cols[eyeI].top * (shape === 'pleco' || shape === 'catfish' ? 0.55 : 0.3));
  const ex = ox + x0 + eyeI;
  if (L >= 28) {
    px(ctx, ex - 1, eyeY - 1, '#f2f2ea', 3, 3);
    px(ctx, ex, eyeY, '#101018', 2, 2);
    px(ctx, ex, eyeY, '#ffffff');
  } else {
    if (L >= 16) px(ctx, ex - 1, eyeY, '#e8e8e0');
    px(ctx, ex, eyeY, '#101018');
  }

  // Species-specific touches driven by shape.
  if (shape === 'catfish' || shape === 'pleco') {
    const snoutX = ox + x0 + bodyLen - 1;
    px(ctx, snoutX - 1, cy + cols[bodyLen - 1].bottom + 1, outline);
    px(ctx, snoutX, cy + cols[bodyLen - 1].bottom + 1, outline);
    if (shape === 'pleco' && sex === 'male' && L > 18) {
      for (let k = 0; k < 4; k++) px(ctx, snoutX - 1 - rng.int(0, 3), cy - cols[bodyLen - 2].top + rng.int(0, 2), look.accent);
    }
  }
  if (shape === 'goldfish' && morphId === 'oranda') {
    for (let i = Math.round(bodyLen * 0.78); i < bodyLen - 1; i++) {
      const t = cols[i].top;
      px(ctx, ox + x0 + i, cy - t, look.accent);
      px(ctx, ox + x0 + i, cy - t + 1, shade(look.accent, -0.1));
    }
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mini sprite (3-5px) used in overworld tanks. */
export function miniFishColour(speciesId: string, morphId: string): string {
  const sp = getSpecies(speciesId);
  const m = getMorph(sp, morphId);
  return m.pattern === 'neon' ? m.accent : m.fin === m.body ? m.body : mix(m.body, m.fin, 0.5);
}
