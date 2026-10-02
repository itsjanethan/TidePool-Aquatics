/**
 * Low-level helpers for procedurally drawing pixel-art textures at runtime.
 * All game art is generated in code (no external assets) so the build is
 * self-contained; see ART_DIRECTION.md.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';

export type Ctx = CanvasRenderingContext2D;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amt > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function hexToInt(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}

export function px(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Creates (or replaces) a canvas texture and runs `draw` on it. */
export function makeTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  tex.refresh();
  return tex;
}

/** Draws a string-row sprite with a palette. '.' or ' ' are transparent. */
export function drawRows(ctx: Ctx, rows: string[], palette: Record<string, string>, ox = 0, oy = 0, mirror = false): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[mirror ? row.length - 1 - x : x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (col) px(ctx, ox + x, oy + y, col);
    }
  }
}

/** Adds evenly spaced frames to a texture laid out horizontally. */
export function addFrames(tex: Phaser.Textures.Texture, frameW: number, frameH: number, count: number, prefix = ''): void {
  for (let i = 0; i < count; i++) tex.add(`${prefix}${i}`, 0, i * frameW, 0, frameW, frameH);
}

/** Simple dithered noise fill used for floors, gravel, rock. */
export function noiseFill(ctx: Ctx, x: number, y: number, w: number, h: number, colors: string[], seed: number, density = 1): void {
  const rng = new Rng(seed);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (density < 1 && !rng.chance(density)) continue;
      px(ctx, x + xx, y + yy, colors[Math.floor(rng.next() * colors.length)]);
    }
  }
}

export function outlineRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  px(ctx, x, y, color, w, 1);
  px(ctx, x, y + h - 1, color, w, 1);
  px(ctx, x, y, color, 1, h);
  px(ctx, x + w - 1, y, color, 1, h);
}
