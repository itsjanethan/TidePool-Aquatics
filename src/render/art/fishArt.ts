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
  /** Size in tank canvas pixels (the texture holds `detail` times as many). */
  width: number;
  height: number;
  bodyLen: number;
  /** Texture pixels per tank canvas pixel. Sprites scale by 1 / detail. */
  detail: number;
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

export function fishTexKey(p: Phenotype, L: number, detail = 1): string {
  return `fish2:${L}${detail === 1 ? '' : `@${detail}`}:${hashString(phenotypeKey(p)).toString(36)}`;
}

/**
 * Returns the texture for a phenotype at a length, painting it if needed.
 * Returns null when this frame's painting budget is used up (unless `force`),
 * so callers keep their current texture and ask again next frame.
 */
export function fishTexture(scene: Phaser.Scene, p: Phenotype, length: number, force = false, detail = 1): FishTex | null {
  const L = quantiseLength(length);
  const key = fishTexKey(p, L, detail);
  const now = performance.now();
  const known = info.get(key);
  if (known && scene.textures.exists(key)) {
    lastUsed.set(key, now);
    return known;
  }
  if (!force && spentThisFrame > FRAME_BUDGET_MS) return null;
  const t0 = performance.now();
  // Painted at `detail` texels per canvas pixel, drawn smoothly (linear filtering).
  const sheet = paintFishSheet(p, Math.round(L * detail));
  // One transparent texel between frames so linear filtering never bleeds a neighbour in.
  const fw = sheet.width + 1;
  const canvas = scene.textures.createCanvas(key, fw * SHEET_FRAMES, sheet.height)!;
  const ctx = canvas.getContext();
  sheet.frames.forEach((data, i) => ctx.putImageData(new ImageData(data, sheet.width, sheet.height), i * fw, 0));
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (let i = 0; i < SHEET_FRAMES; i++) canvas.add(String(i), 0, i * fw, 0, sheet.width, sheet.height);
  const tex: FishTex = { key, width: sheet.width / detail, height: sheet.height / detail, bodyLen: sheet.bodyLen / detail, detail };
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

/** Texel total of cached sheets (bounded by MAX_TEXELS as well as the count). */
function texels(): number {
  let n = 0;
  for (const t of info.values()) n += fishTexels(t);
  return n;
}

export function fishTexels(t: FishTex): number {
  return Math.round(t.width * t.detail + 1) * SHEET_FRAMES * Math.round(t.height * t.detail);
}

/** About 64 MB of RGBA at most; a sheet not drawn for 2 s may go when over budget. */
export const MAX_TEXELS = 16_000_000;

function evict(scene: Phaser.Scene, now: number): void {
  let total = texels();
  if (info.size <= MAX_TEXTURES && total <= MAX_TEXELS) return;
  const old = [...lastUsed.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key, t] of old) {
    const overCount = info.size > MAX_TEXTURES * 0.8;
    const overTexels = total > MAX_TEXELS * 0.8;
    if (!overCount && !overTexels) break;
    if (now - t < (overTexels ? 2000 : 20000)) continue;
    const tex = info.get(key);
    if (tex) total -= fishTexels(tex);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    info.delete(key);
    lastUsed.delete(key);
  }
}

/** Cached fish sheet texels (profiling, tests). */
export function fishTexelTotal(): number {
  return texels();
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
