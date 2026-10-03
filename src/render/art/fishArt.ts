/**
 * Fish textures for the aquarium view. Each individual fish is painted from
 * its Phenotype (src/sim/phenotype.ts) by the FishPainter into an
 * SHEET_FRAMES-frame sprite sheet. Sheets are cached by a quantised phenotype
 * key, so look-alike fish share textures, and evicted least-recently-used.
 * Painting is budgeted per frame so opening a busy tank never stalls.
 */
import Phaser from 'phaser';
import { getSpecies } from '../../data/species';
import { getMorph } from '../../sim/fish';
import { hashString, phenotypeKey, type Phenotype } from '../../sim/phenotype';
import { mix } from './pixel';
import { paintFishSheet, SHEET_FRAMES, SWIM_FRAMES, TURN_FRAMES } from './fishPainter';

export { SHEET_FRAMES, SWIM_FRAMES, TURN_FRAMES };

export interface FishTex {
  key: string;
  width: number;
  height: number;
  bodyLen: number;
}

/** Quantise display length so textures are shared and regenerated rarely. */
export function quantiseLength(px: number): number {
  const L = Math.max(12, Math.round(px));
  return L < 40 ? L - (L % 2) : L < 100 ? L - (L % 4) : L - (L % 8);
}

const MAX_TEXTURES = 160;
const FRAME_BUDGET_MS = 10;
const lastUsed = new Map<string, number>();
const info = new Map<string, FishTex>();
let spentThisFrame = 0;

/** Call once per rendered frame to reset the painting budget. */
export function beginFishFrame(): void {
  spentThisFrame = 0;
}

export function fishTexKey(p: Phenotype, L: number): string {
  return `fish2:${L}:${hashString(phenotypeKey(p)).toString(36)}`;
}

/**
 * Returns the texture for a phenotype at a length, painting it if needed.
 * Returns null when this frame's painting budget is used up (unless `force`),
 * so callers keep their current texture and ask again next frame.
 */
export function fishTexture(scene: Phaser.Scene, p: Phenotype, length: number, force = false): FishTex | null {
  const L = quantiseLength(length);
  const key = fishTexKey(p, L);
  const now = performance.now();
  const known = info.get(key);
  if (known && scene.textures.exists(key)) {
    lastUsed.set(key, now);
    return known;
  }
  if (!force && spentThisFrame > FRAME_BUDGET_MS) return null;
  const t0 = performance.now();
  const sheet = paintFishSheet(p, L);
  const canvas = scene.textures.createCanvas(key, sheet.width * SHEET_FRAMES, sheet.height)!;
  const ctx = canvas.getContext();
  sheet.frames.forEach((data, i) => ctx.putImageData(new ImageData(data, sheet.width, sheet.height), i * sheet.width, 0));
  canvas.refresh();
  for (let i = 0; i < SHEET_FRAMES; i++) canvas.add(String(i), 0, i * sheet.width, 0, sheet.width, sheet.height);
  const tex: FishTex = { key, width: sheet.width, height: sheet.height, bodyLen: sheet.bodyLen };
  info.set(key, tex);
  lastUsed.set(key, now);
  spentThisFrame += performance.now() - t0;
  evict(scene, now);
  return tex;
}

/** Marks a texture as still in use (sprites call this occasionally). */
export function touchFishTexture(key: string): void {
  if (lastUsed.has(key)) lastUsed.set(key, performance.now());
}

function evict(scene: Phaser.Scene, now: number): void {
  if (info.size <= MAX_TEXTURES) return;
  const old = [...lastUsed.entries()].filter(([, t]) => now - t > 20000).sort((a, b) => a[1] - b[1]);
  for (const [key] of old) {
    if (info.size <= MAX_TEXTURES * 0.8) break;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    info.delete(key);
    lastUsed.delete(key);
  }
}

/** Number of cached fish textures (for the dev overlay and tests). */
export function fishTextureCount(): number {
  return info.size;
}

/** Mini sprite colour used in overworld tanks. */
export function miniFishColour(speciesId: string, morphId: string): string {
  const sp = getSpecies(speciesId);
  const m = getMorph(sp, morphId);
  return m.pattern === 'neon' ? m.accent : m.fin === m.body ? m.body : mix(m.body, m.fin, 0.5);
}
