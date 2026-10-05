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
import { SHEET_FRAMES, startFishSheet, SWIM_FRAMES, TURN_FRAMES, type FishSheetJob } from './fishPainter';
import { fishTexels, MAX_TEXELS, type FishTexSize } from './fishBudget';

export { fishTexels, MAX_TEXELS };

export { SHEET_FRAMES, SWIM_FRAMES, TURN_FRAMES };

export interface FishTex extends FishTexSize {
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
/** Sheets being painted across frames. */
const jobs = new Map<string, FishSheetJob>();
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
  // Painted at `detail` texels per canvas pixel, drawn smoothly (linear filtering), one
  // frame of the sheet at a time within this frame's budget, continuing next frame.
  let job = jobs.get(key);
  if (!job) {
    job = startFishSheet(p, Math.round(L * detail));
    jobs.set(key, job);
    // Abandoned jobs (a fish sold or grown mid-paint) are dropped oldest first.
    if (jobs.size > 40) jobs.delete(jobs.keys().next().value!);
  }
  let done = false;
  while (!done) {
    done = job.step();
    if (!done && !force && spentThisFrame + (performance.now() - t0) > FRAME_BUDGET_MS) {
      spentThisFrame += performance.now() - t0;
      return null;
    }
  }
  jobs.delete(key);
  const sheet = job.sheet;
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
