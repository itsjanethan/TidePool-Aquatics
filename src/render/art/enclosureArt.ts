/**
 * Enclosure art for vivariums, terrariums and paludariums: the paludarium's
 * soil bank seen in cross-section through the glass, the warm cone under a
 * basking lamp, condensation on humid glass, mould fuzz, and the land back
 * walls (cork bark, sandstone, living moss). Painted once into canvas
 * textures and cached by key.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import { getSubstrate } from '../../data/catalog';
import { makeTexture } from './pixel';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (c: RGB, k: number): RGB => (k >= 1 ? mixC(c, [255, 255, 255], Math.min(1, k - 1)) : [c[0] * Math.max(0, k), c[1] * Math.max(0, k), c[2] * Math.max(0, k)]);

function h2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1;

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
  toTexture(scene: Phaser.Scene, key: string): void {
    const tex = scene.textures.createCanvas(key, this.w, this.h)!;
    tex.getContext().putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

/**
 * The paludarium bank in cross-section: a moss and leaf-litter top, soil with
 * roots and pebbles, darker and wetter below the waterline. `surfaceAt(x)` is
 * the bank's top in texture coordinates; `waterY` is the pool surface.
 */
export function ensureBank(scene: Phaser.Scene, key: string, substrateId: string, w: number, h: number, res: number, surfaceAt: (x: number) => number, waterY: number): string {
  if (scene.textures.exists(key)) return key;
  const sub = getSubstrate(substrateId);
  const A = hex(sub.colourA);
  const B = hex(sub.colourB);
  const seed = 811;
  const rng = new Rng(seed);
  const img = new Buf(w, h);
  for (let x = 0; x < w; x++) {
    const top = surfaceAt(x);
    for (let y = Math.max(0, Math.floor(top)); y < h; y++) {
      const depth = (y - top) / res;
      const n = fbm(x * 0.06, y * 0.06, seed);
      let c = mixC(A, B, n);
      // Clumpy soil grain and fibres.
      if (h2(x, y, seed) < 0.12) c = lit(c, h2(y, x, seed) > 0.5 ? 1.2 : 0.7);
      if (Math.abs(Math.sin(x * 0.4 + noise(x * 0.1, y * 0.1, seed + 4) * 6)) < 0.06) c = lit(c, 0.8);
      // A layer of moss and litter on top, a drainage layer of clay balls at the bottom.
      if (depth < 3) c = mixC(c, h2(x, 3, seed) > 0.5 ? [64, 104, 46] : [96, 76, 44], 0.75 - depth * 0.15);
      if (y > h - 14 * res) {
        const bx = (x % (6 * res)) - 3 * res;
        const by = ((y - (h - 14 * res)) % (6 * res)) - 3 * res;
        if (bx * bx + by * by < 7 * res * res) c = lit([150, 96, 64], 0.8 + (by < 0 ? 0.3 : 0));
      }
      // Darker toward the glass edge so it reads as a solid mass.
      c = lit(c, 1.05 - Math.min(0.2, depth * 0.003));
      // Wet soil below the waterline.
      if (y > waterY) c = mixC(lit(c, 0.85), [40, 74, 78], 0.2);
      img.set(x, y, c, 1);
    }
    // A highlight along the top edge, darker just below it.
    img.set(x, top, lit(mixC(A, B, 0.6), 1.25), 1);
  }
  // Roots threading down through the soil.
  for (let r = 0; r < Math.round(w / (14 * res)); r++) {
    let x = rng.range(4, w - 4);
    let y = surfaceAt(Math.round(x)) + 2 * res;
    const len = rng.range(20, 60) * res;
    for (let s = 0; s < len; s++) {
      x += (noise(s * 0.05, r, seed + 9) - 0.5) * 1.4;
      y += 0.8;
      if (y >= h - 2) break;
      img.set(x, y, [198, 170, 120], 0.8);
    }
  }
  // Pebbles against the glass.
  for (let i = 0; i < w / (5 * res); i++) {
    const px = rng.range(0, w);
    const top = surfaceAt(Math.round(px));
    const py = rng.range(top + 6 * res, h - 16 * res);
    const r = rng.range(1, 2.5) * res;
    const col = rng.pick<RGB>([[120, 110, 96], [90, 84, 76], [150, 134, 110]]);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) img.set(px + x, py + y, lit(col, 0.8 + (y < 0 ? 0.3 : 0)), 1);
  }
  img.toTexture(scene, key);
  return key;
}

/** A soft warm cone of light under a basking lamp (additive). */
export function ensureLampCone(scene: Phaser.Scene, w: number, h: number): string {
  const key = `lampcone:${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  makeTexture(scene, key, w, h, (ctx) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const half = (w / 2) * (0.12 + t * 0.88);
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - w / 2) / half;
        if (d > 1) continue;
        const a = 0.34 * (1 - t * 0.65) * Math.pow(1 - d, 1.3);
        if (a < 0.004) continue;
        ctx.fillStyle = `rgba(255,${Math.round(190 + 40 * (1 - t))},120,${a.toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  return key;
}

/** Condensation on the inside of the glass: a faint fog with beads, thickest low and at the edges. */
export function ensureCondensation(scene: Phaser.Scene, w: number, h: number, res: number): string {
  const key = `condense:${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const img = new Buf(w, h);
  const rng = new Rng(404);
  // A soft fog, per texel, thicker low and at the edges, broken by a fine mottle of droplets.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.max(0, 1 - Math.min(x, w - x) / (w * 0.18));
      const n = fbm(x / (40 * res), y / (40 * res), 9);
      const fine = noise(x / (1.6 * res), y / (1.6 * res), 19);
      const a = (0.06 + (y / h) * 0.08 + edge * 0.12) * (0.6 + n * 0.8) * (0.7 + fine * 0.6);
      img.set(x, y, [230, 240, 244], a);
    }
  }
  // Beads of water, some running down in streaks.
  for (let i = 0; i < (w * h) / (90 * res * res); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(0.6, 2.2) * res;
    // A bead: clear centre, a darker refracting rim below and a bright glint above.
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d = Math.hypot(dx, dy) / r;
      const cover = Math.min(1, Math.max(0, (1 - d) * r + 0.5));
      if (cover <= 0) continue;
      const rim = Math.max(0, d - 0.6) / 0.4;
      const lower = dy > 0 ? 1 : 0.4;
      img.set(x + dx, y + dy, rim > 0 ? [190, 206, 214] : [244, 250, 255], (0.2 + rim * 0.35 * lower) * cover);
    }
    img.set(x - r * 0.3, y - r * 0.4, [255, 255, 255], 0.9);
    if (rng.chance(0.08)) for (let k = 0; k < rng.range(10, 40) * res; k++) img.set(x + Math.sin(k * 0.1) * 0.6, y + r + k, [236, 246, 250], 0.32);
  }
  img.toTexture(scene, key);
  return key;
}

/** White and grey-green mould fuzz in patches along the substrate line and in the corners. */
export function ensureMould(scene: Phaser.Scene, w: number, h: number, floorY: number, res: number): string {
  const key = `mould:${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const img = new Buf(w, h);
  const rng = new Rng(717);
  for (let i = 0; i < 46; i++) {
    const cx = rng.chance(0.25) ? rng.pick([rng.range(0, w * 0.1), rng.range(w * 0.9, w)]) : rng.range(0, w);
    const cy = floorY - rng.range(-4, 26) * res;
    const r = rng.range(5, 18) * res;
    const col = rng.pick<RGB>([[236, 236, 226], [210, 218, 196], [224, 220, 200]]);
    for (let n = 0; n < r * r * 0.9; n++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * r;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.55;
      img.set(x, y, col, (1 - d / r) * 0.7);
      // Hyphae: tiny upward threads.
      if (rng.chance(0.05)) for (let k = 0; k < 3 * res; k++) img.set(x + rng.range(-0.5, 0.5), y - k, col, 0.45);
    }
  }
  img.toTexture(scene, key);
  return key;
}

/** Pixel colour for the land back walls (k is the light multiplier already applied by the caller). */
export function landWallPixel(id: string, x: number, y: number, t: number, W: number, res: number): RGB | null {
  if (id === 'cork_wall') {
    // Vertical panels of cork bark, each with its own tone, fissured and lumpy.
    const pw = 46 * res;
    const panel = Math.floor((x + noise(y / (30 * res), 0, 3) * 10 * res) / pw);
    const tone = 0.75 + h2(panel, 1, 5) * 0.4;
    const n = fbm(x / (9 * res), y / (22 * res), 7 + panel);
    let c = mixC([92, 74, 58], [52, 40, 30], t * 0.7 + n * 0.3);
    c = lit(c, tone * (0.8 + n * 0.45));
    if (noise(x / (4 * res), y / (14 * res), 11) > 0.72) c = lit(c, 0.55);
    const seam = ((x + noise(y / (30 * res), 0, 3) * 10 * res) % pw) / pw;
    if (seam < 0.04 || seam > 0.97) c = lit(c, 0.4);
    return c;
  }
  if (id === 'desert_wall') {
    // Sandstone in stacked layers: each bed its own tone, a lit ledge on top,
    // a shadow under the overhang, fine grain and the odd weathered pocket.
    const wob = noise(x / (70 * res), 0, 21) * 10 * res + noise(x / (20 * res), 1, 22) * 3 * res;
    const yy = y + wob;
    const bed = 26 * res;
    const layer = Math.floor(yy / bed);
    const f = (yy - layer * bed) / bed;
    const tone = 0.82 + h2(layer, 3, 23) * 0.3;
    let c = mixC([214, 166, 110], [150, 98, 58], t * 0.55 + h2(layer, 5, 24) * 0.3);
    c = lit(c, tone * (0.9 + fbm(x / (5 * res), y / (5 * res), 25) * 0.2));
    // Thin bedding lines within the layer.
    if (Math.abs(Math.sin(f * Math.PI * 5 + noise(x / (30 * res), layer, 26) * 2)) < 0.08) c = lit(c, 0.9);
    if (f < 0.08) c = lit(c, 1.18); // ledge top catches the light
    else if (f > 0.9) c = lit(c, 0.62 + (1 - f) * 2); // shadow under the next ledge
    if (fbm(x / (9 * res), y / (7 * res), 27) > 0.78) c = lit(c, 0.82); // weathered pockets
    return c;
  }
  if (id === 'jungle_wall') {
    // A living wall set back in the enclosure: dark cork bark, soft cushions of
    // moss, and a few vines trailing down from the lid. Kept low in contrast so
    // the animals and plants in front read first.
    const cork = mixC([70, 52, 38], [30, 22, 16], t);
    let c = lit(cork, 0.78 + noise(x / (4 * res), y / (14 * res), 37) * 0.3);
    if (noise(x / (3 * res), y / (30 * res), 38) > 0.75) c = lit(c, 0.7); // bark fissures
    const n = fbm(x / (22 * res), y / (18 * res), 31) + (1 - t) * 0.06;
    if (n > 0.5) {
      const m = fbm(x / (3 * res), y / (3 * res), 33);
      const above = fbm(x / (22 * res), (y - 4 * res) / (18 * res), 31) + (1 - t) * 0.06;
      let moss = mixC([46, 80, 36], [86, 128, 54], m);
      moss = lit(moss, 0.72 + Math.min(0.25, (n - 0.5) * 1.2) - t * 0.25 + (above <= 0.5 ? 0.12 : 0));
      // Soft edge into the bark.
      c = mixC(c, moss, Math.min(1, (n - 0.5) / 0.04));
    } else if (n > 0.47) c = lit(c, 0.72);
    // Vines trailing from the lid with small heart-shaped leaves.
    for (let v = 0; v < 7; v++) {
      const vx = (v + 0.35 + h2(v, 1, 41) * 0.5) * (W / 7);
      const reach = (0.35 + h2(v, 2, 42) * 0.45);
      if (t > reach) continue;
      const cx = vx + Math.sin(y / (26 * res) + v * 1.7) * 9 * res;
      const dx = x - cx;
      if (Math.abs(dx) < 0.9 * res) return lit([44, 70, 34], 0.9 - t * 0.3);
      const leafY = Math.round(y / (13 * res));
      const side = leafY % 2 ? 1 : -1;
      const ly = leafY * 13 * res;
      const lx = cx + side * 5 * res;
      const ux = (x - lx) / (5 * res);
      const uy = (y - ly) / (3.5 * res);
      if (ux * ux + uy * uy < 1 && (ly * t) / Math.max(1, y) <= reach) {
        const leaf: RGB = uy < -0.2 ? [104, 150, 64] : [70, 112, 46];
        return lit(leaf, 0.85 - t * 0.35);
      }
    }
    return c;
  }
  return null;
}

/**
 * Land back walls painted as lit relief (v0.7). Each wall is built as a height
 * field plus a colour field and relit from the lamp above, so bark fissures,
 * moss cushions and sandstone ledges cast their own small shadows:
 *
 *   jungle_wall: dark cork bark with deep vertical fissures, soft cushions of
 *     moss (fine strands, yellow-green tips, darker hollows) and creeping fig
 *     trailing from the lid
 *   cork_wall: panels of cork bark, each with its own tone and fissure pattern
 *   desert_wall: stacked sandstone beds with lit ledges, undercut shadows,
 *     fine grain and weathered pockets
 *
 * Returns RGBA for a W x H wall, or null for ids that are not land walls.
 * `res` is texture pixels per logical pixel.
 */
export function paintLandWall(id: string, W: number, H: number, res: number): Uint8ClampedArray<ArrayBuffer> | null {
  if (id !== 'jungle_wall' && id !== 'cork_wall' && id !== 'desert_wall') return null;
  const hgt = new Float32Array(W * H);
  const alb = new Float32Array(W * H * 3);
  const r = res;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c: RGB;
      let h: number;
      if (id === 'desert_wall') {
        // Sandstone: beds of uneven thickness (a warped vertical coordinate), each
        // with a rounded weathered face, crisp undercut, vertical joints, soft
        // honeycomb pockets and iron staining.
        const wob = noise(x / (70 * r), 0, 21) * 10 * r + noise(x / (20 * r), 1, 22) * 3 * r;
        const yy = y + wob + noise(y / (38 * r), 2, 28) * 14 * r;
        const bed = 26 * r;
        const layer = Math.floor(yy / bed);
        const f = (yy - layer * bed) / bed;
        const sm = (e0: number, e1: number, v: number) => {
          const q = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
          return q * q * (3 - 2 * q);
        };
        h = 0.5 + 0.28 * sm(0, 0.3, f) - 0.32 * sm(0.82, 1, f) + (h2(layer, 9, 29) - 0.5) * 0.12;
        const joint = 1 - Math.abs(noise(x / (55 * r), layer * 3.1, 30) * 2 - 1);
        h -= Math.pow(joint, 40) * 0.16;
        h -= 0.12 * sm(0.66, 0.82, fbm(x / (6 * r), y / (5 * r), 27));
        h += (fbm(x / (3 * r), y / (3 * r), 25) - 0.5) * 0.06;
        c = mixC([220, 172, 116], [150, 98, 58], t * 0.45 + h2(layer, 5, 24) * 0.3);
        c = mixC(c, [168, 92, 52], Math.max(0, fbm(x / (40 * r), y / (30 * r), 32) - 0.55) * 1.2);
        c = lit(c, 0.86 + h2(layer, 3, 23) * 0.22);
      } else if (id === 'cork_wall') {
        const pw = 46 * r;
        const sx = x + noise(y / (30 * r), 0, 3) * 10 * r;
        const panel = Math.floor(sx / pw);
        const seam = (sx % pw) / pw;
        const fis = 1 - Math.abs(noise(x / (3.2 * r), y / (15 * r), 11 + panel) * 2 - 1);
        h = 0.6 + 0.25 * Math.sin(seam * Math.PI) - Math.pow(fis, 6) * 0.45 + (fbm(x / (2 * r), y / (2 * r), 5) - 0.5) * 0.1;
        if (seam < 0.03 || seam > 0.975) h -= 0.4;
        c = mixC([104, 84, 64], [56, 42, 30], t * 0.6 + fbm(x / (9 * r), y / (22 * r), 7 + panel) * 0.3);
        c = lit(c, 0.8 + h2(panel, 1, 5) * 0.35);
        if (fbm(x / (4 * r), y / (4 * r), 31) > 0.72) c = mixC(c, [148, 156, 118], 0.35); // lichen
      } else {
        // Jungle: bark under moss.
        const fis = 1 - Math.abs(noise(x / (2.6 * r), y / (16 * r), 37) * 2 - 1);
        const bark = 0.35 - Math.pow(fis, 5) * 0.3 + (noise(x / (1.4 * r), y / (5 * r), 38) - 0.5) * 0.08;
        const barkC = lit(mixC([72, 54, 40], [34, 25, 18], t * 0.8), 0.8 + noise(x / (5 * r), y / (12 * r), 39) * 0.35);
        const m = fbm(x / (24 * r), y / (19 * r), 31) + (1 - t) * 0.05;
        const edge = Math.min(1, Math.max(0, (m - 0.47) / 0.06));
        if (edge > 0) {
          // Moss: a cushion rising from its edge, covered in fine strands.
          const fuzz = noise(x / (0.9 * r), y / (0.9 * r), 33) * 0.6 + noise(x / (2.2 * r), y / (2.2 * r), 34) * 0.4;
          const cushion = Math.min(1, (m - 0.47) * 4.5);
          const mh = 0.5 + cushion * 0.45 + (fuzz - 0.5) * 0.22;
          const tone = fbm(x / (7 * r), y / (7 * r), 35);
          let mc = mixC([46, 78, 30], [124, 156, 62], tone * 0.8 + fuzz * 0.35);
          // Paler, drier tips; darker deep in the cushion.
          mc = mixC(mc, [168, 182, 92], Math.max(0, fuzz - 0.72) * 1.4);
          h = bark * (1 - edge) + mh * edge;
          c = mixC(barkC, mc, edge);
        } else {
          h = bark;
          c = barkC;
        }
      }
      hgt[i] = h;
      alb[i * 3] = c[0];
      alb[i * 3 + 1] = c[1];
      alb[i * 3 + 2] = c[2];
    }
  }
  // Light from the lamp above and slightly left; shading from the height slope,
  // occlusion from how deep a point sits, and the wall darkening toward the floor.
  const out = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
  const relief = id === 'desert_wall' ? 5 * r : 9 * r;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hx = hgt[Math.min(W - 1, x + 1) + y * W] - hgt[Math.max(0, x - 1) + y * W];
      const hy = hgt[x + Math.min(H - 1, y + 1) * W] - hgt[x + Math.max(0, y - 1) * W];
      let nx = -hx * relief;
      let ny = -hy * relief;
      const n = Math.hypot(nx, ny, 1);
      nx /= n;
      ny /= n;
      const nz = 1 / n;
      const d = nx * -0.3 + ny * -0.78 + nz * 0.55;
      const k = (0.28 + 0.9 * Math.max(0, d)) * (0.62 + 0.45 * hgt[i]) * (1.06 - t * 0.38);
      out[i * 4] = alb[i * 3] * k;
      out[i * 4 + 1] = alb[i * 3 + 1] * k;
      out[i * 4 + 2] = alb[i * 3 + 2] * k;
      out[i * 4 + 3] = 255;
    }
  }
  if (id === 'jungle_wall') paintFig(out, W, H, r);
  return out;
}

/** Creeping fig trailing down from the lid: thin stems with small rounded, shaded leaves. */
function paintFig(out: Uint8ClampedArray, W: number, H: number, r: number): void {
  const b = new Buf(W, H);
  b.data = out as Uint8ClampedArray<ArrayBuffer>;
  const rng = new Rng(4711);
  for (let v = 0; v < 8; v++) {
    let x = (v + 0.3 + rng.next() * 0.5) * (W / 8);
    const reach = H * rng.range(0.3, 0.75);
    let side = 1;
    for (let y = 0; y < reach; y += 0.5) {
      x += Math.sin(y / (24 * r) + v * 1.7) * 0.18 * r;
      const fade = 1 - (y / reach) * 0.3;
      b.set(x, y, lit([46, 64, 30], 0.85 * fade), 0.9);
      b.set(x + 0.5, y, lit([70, 96, 44], 0.85 * fade), 0.5);
      if (y % (5 * r) < 0.5 && rng.chance(0.8)) {
        side = -side;
        const lx = x + side * rng.range(2, 3.5) * r;
        const ly = y + rng.range(-1, 1.5) * r;
        const lr = rng.range(2, 3.2) * r;
        const ang = side * rng.range(0.3, 0.8);
        for (let yy = -lr; yy <= lr; yy++) for (let xx = -lr; xx <= lr; xx++) {
          const u = (xx * Math.cos(ang) + yy * Math.sin(ang)) / lr;
          const w = (-xx * Math.sin(ang) + yy * Math.cos(ang)) / (lr * 0.72);
          const dd = Math.hypot(u, w);
          if (dd > 1) continue;
          let c: RGB = mixC([62, 112, 40], [116, 160, 66], Math.max(0, -w * 0.5 + 0.5) * 0.8);
          if (Math.abs(w) < 0.08) c = lit(c, 1.15); // midrib
          c = lit(c, (0.75 + (1 - dd) * 0.35) * fade);
          b.set(lx + xx, ly + yy, c, Math.min(1, (1 - dd) * lr * 0.9));
        }
      }
    }
  }
}
