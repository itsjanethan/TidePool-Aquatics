/**
 * Substrate textures for the tank view. Each tank gets its own gently
 * contoured bed (seeded by tank id): the front edge seen through the glass
 * shows the grains in cross-section, and a thin receding top surface sits
 * above it. Grain types: sand, fine gravel, gravel, coarse river pebbles,
 * planted soil and a bare glass bottom.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import { getSubstrate } from '../../data/catalog';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (c: RGB, k: number): RGB => (k >= 1 ? mixC(c, [255, 255, 255], Math.min(1, k - 1)) : [c[0] * Math.max(0, k), c[1] * Math.max(0, k), c[2] * Math.max(0, k)]);

function seedOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Height (px above the texture's nominal top) of the bed at x: a broad slope
 * plus soft hills. Returns the front edge; the back edge is a little higher.
 */
export function substrateContour(tankId: string, W: number, res: number): (x: number) => number {
  const s = seedOf(tankId);
  const slope = ((s % 7) - 3) / 3; // -1..1
  const p1 = (s % 100) / 15;
  const p2 = (s % 37) / 7;
  return (x: number) => {
    const t = x / W;
    return (2 + slope * (t - 0.5) * 3 + Math.sin(t * 5.2 + p1) * 1.6 + Math.sin(t * 13 + p2) * 0.6) * res;
  };
}

/** How far the receding top surface shows above the front edge. */
const TOP_BAND = 5;

export function ensureSubstrate(scene: Phaser.Scene, id: string, tankId: string, W: number, H: number, res: number): string {
  const key = `substrate3:${id}:${tankId}:${W}`;
  if (scene.textures.exists(key)) return key;
  const sub = getSubstrate(id);
  const grain = sub.grain ?? 'gravel';
  const A = hex(sub.colourA);
  const B = hex(sub.colourB);
  const rng = new Rng(seedOf(id + tankId));
  const contour = substrateContour(tankId, W, res);
  const pad = 10 * res; // room above the nominal top for hills and the top band
  const data = new Uint8ClampedArray(new ArrayBuffer(W * (H + pad) * 4));
  const HH = H + pad;
  const set = (x: number, y: number, c: RGB, a = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= HH) return;
    const i = (y * W + x) * 4;
    const da = data[i + 3] / 255;
    const oa = a + da * (1 - a);
    data[i] = (c[0] * a + data[i] * da * (1 - a)) / oa;
    data[i + 1] = (c[1] * a + data[i + 1] * da * (1 - a)) / oa;
    data[i + 2] = (c[2] * a + data[i + 2] * da * (1 - a)) / oa;
    data[i + 3] = oa * 255;
  };
  const front = (x: number) => pad - contour(x);
  const back = (x: number) => front(x) - TOP_BAND * res;

  // Base fill: the top surface band (lit from above), then the front face darkening with depth.
  for (let x = 0; x < W; x++) {
    const yb = Math.round(back(x));
    const yf = Math.round(front(x));
    for (let y = yb; y < HH; y++) {
      if (y < yf) {
        const t = (y - yb) / Math.max(1, yf - yb);
        set(x, y, lit(mixC(B, A, 0.3), 1.08 - t * 0.12));
      } else {
        const d = (y - yf) / (HH - yf);
        set(x, y, lit(mixC(A, B, 0.45), 0.92 - d * 0.42));
      }
    }
  }
  if (grain === 'bare') {
    // Glass bottom: faint reflections.
    for (let x = 0; x < W; x += 2) set(x, front(x) + 3 * res + Math.sin(x * 0.02) * res, [255, 255, 255], 0.08);
  } else {
    const cols: RGB[] = [A, B, lit(A, 0.85), lit(B, 1.1), mixC(A, B, 0.5)];
    if (grain === 'coarse') cols.push(hex('#9a8a72'), hex('#6e7472'), hex('#b0a088'));
    const size = grain === 'sand' ? [0.5, 1] : grain === 'fine' ? [0.8, 1.6] : grain === 'gravel' ? [1.4, 3] : grain === 'coarse' ? [3, 6.5] : [1, 1.9];
    const density = grain === 'sand' ? 1.4 : grain === 'coarse' ? 0.9 : 1.1;
    const count = Math.round((W * HH * density) / Math.pow(((size[0] + size[1]) / 2) * res, 2));
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, W);
      const yTop = back(x);
      const y = rng.range(yTop, HH);
      const r = rng.range(size[0], size[1]) * res;
      const ry = r * rng.range(0.65, 0.95);
      const onTop = y < front(x);
      const depthK = onTop ? 1.06 : 0.95 - ((y - front(x)) / (HH - front(x))) * 0.45;
      const base = lit(rng.pick(cols), depthK * rng.range(0.9, 1.08));
      if (grain === 'sand') {
        set(x, y, lit(base, rng.range(0.92, 1.12)), 0.8);
        continue;
      }
      for (let yy = -ry; yy <= ry; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          const d = (xx * xx) / (r * r) + (yy * yy) / (ry * ry);
          if (d > 1 || y + yy < yTop) continue;
          const l = -(xx / r) * 0.3 - (yy / ry) * 0.5;
          let c = lit(base, 1 + l * 0.35);
          if (d > 0.72 && yy > 0) c = lit(c, 0.7);
          if (grain === 'soil' && d < 0.15 && yy < 0) c = lit(c, 1.35); // moist sheen
          set(x + xx, y + yy, c, 1);
        }
      }
    }
    if (grain === 'sand') {
      // Ripples on the top surface and a few dark grains.
      for (let x = 0; x < W; x += 1) {
        const yb = back(x);
        for (let k = 1; k < TOP_BAND; k += 2) if (Math.sin(x * 0.05 + k * 1.7) > 0.6) set(x, yb + k * res, [255, 250, 230], 0.18);
      }
      for (let i = 0; i < W * 0.6; i++) {
        const x = rng.range(0, W);
        set(x, rng.range(back(x), HH), lit(A, 0.6), 0.7);
      }
    }
  }
  // Lit rim along the back edge (light catching the top of the bed).
  for (let x = 0; x < W; x++) set(x, back(x), lit(B, 1.25), 0.8);
  const tex = scene.textures.createCanvas(key, W, HH)!;
  tex.getContext().putImageData(new ImageData(data, W, HH), 0, 0);
  tex.refresh();
  return key;
}

/** Extra canvas pixels the substrate texture extends above its nominal top. */
export function substratePad(res: number): number {
  return 10 * res;
}
