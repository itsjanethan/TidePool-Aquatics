/**
 * Hardscape textures (stone, slate, limestone, driftwood, caves) painted into
 * pixel buffers: irregular silhouettes from noise, volume shading from a
 * top-left light, surface texture (grain, strata, pits, bark), darker
 * crevices and cave mouths, and a soft contact shadow. Origin bottom-centre.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import type { DecorDef } from '../../data/catalog';

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
  const a = h2(xi, yi, s);
  const b = h2(xi + 1, yi, s);
  const c = h2(xi, yi + 1, s);
  const d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1;

class Img {
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
}

/** An irregular rounded rock: silhouette perturbed by noise, sphere-ish shading, grain. */
function rock(img: Img, cx: number, cy: number, rx: number, ry: number, base: RGB, seed: number, opts: { grain?: number; strata?: boolean; pits?: number; moss?: number } = {}): void {
  const grain = opts.grain ?? 0.12;
  for (let y = Math.floor(cy - ry * 1.3); y <= cy + ry * 1.3; y++) {
    for (let x = Math.floor(cx - rx * 1.3); x <= cx + rx * 1.3; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const ang = Math.atan2(dy, dx);
      const edge = 1 + (fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5, seed) - 0.5) * 0.45;
      const d = Math.hypot(dx, dy) / edge;
      if (d > 1) continue;
      // Flatter base where the rock sits on the substrate.
      if (dy > 0.75) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const l = 0.45 + 0.55 * Math.max(0, nz * 0.65 - dx * 0.35 - dy * 0.55);
      let c = lit(base, 0.55 + l * 0.75);
      const n = fbm(x * 0.18, y * 0.18, seed + 3);
      c = lit(c, 1 + (n - 0.5) * grain * 2);
      if (h2(x, y, seed) < 0.05) c = lit(c, h2(y, x, seed) > 0.5 ? 1.18 : 0.8);
      if (opts.strata && Math.abs(Math.sin((y + n * 6) * 0.55)) < 0.12) c = lit(c, 0.82);
      if (opts.pits && noise(x * 0.3, y * 0.3, seed + 9) > 1 - opts.pits * 0.25) c = lit(c, 0.55);
      if (opts.moss && dy < -0.2 && fbm(x * 0.25, y * 0.25, seed + 21) > 1 - opts.moss) c = mixC(c, [70, 120, 50], 0.75);
      // Rim darkening at the silhouette.
      if (d > 0.9) c = lit(c, 0.78);
      img.set(x, y, c, 1);
    }
  }
}

/** Contact shadow under an object. */
function contactShadow(img: Img, cx: number, w: number): void {
  const y0 = img.h - 3;
  for (let y = y0; y < img.h; y++) for (let x = cx - w / 2; x < cx + w / 2; x++) {
    const t = Math.abs(x - cx) / (w / 2);
    img.set(x, y, [10, 14, 16], 0.25 * (1 - t * t));
  }
}

/** Branch segment for driftwood. */
function branch(img: Img, x0: number, y0: number, ang: number, len: number, th: number, depth: number, rng: Rng, cols: { dark: RGB; light: RGB; seed: number; twoTone: boolean }): void {
  let x = x0;
  let y = y0;
  let a = ang;
  for (let s = 0; s < len; s++) {
    const t = s / len;
    const w = Math.max(1, th * (1 - t * 0.55));
    a += (noise(s * 0.08, depth * 3, cols.seed) - 0.5) * 0.12;
    x += Math.sin(a);
    y -= Math.cos(a);
    for (let k = -w; k <= w; k++) {
      const v = k / w; // -1 .. 1 across the branch
      const shade = 0.6 + 0.6 * Math.max(0, 1 - Math.abs(v + 0.35)) ;
      let c = cols.twoTone && fbm(x * 0.06, y * 0.06, cols.seed) > 0.55 ? cols.light : mixC(cols.dark, cols.light, 0.25);
      // Bark grain lines along the branch.
      if (Math.abs(Math.sin((k + noise(x * 0.2, y * 0.2, cols.seed) * 4) * 1.7)) < 0.18) c = lit(c, 0.82);
      c = lit(c, shade);
      if (Math.abs(v) > 0.85) c = lit(c, 0.7);
      img.set(x + Math.cos(a) * k, y + Math.sin(a) * k, c, 1);
    }
    if (depth < 4 && s > len * 0.35 && rng.chance(0.022 * (4 - depth))) {
      branch(img, x, y, a + rng.range(0.4, 0.9) * (rng.chance(0.5) ? 1 : -1), len * rng.range(0.35, 0.6), Math.max(1, w * 0.65), depth + 1, rng, cols);
    }
  }
}

export function hardscapeKey(def: DecorDef, scale: number): string {
  return `hard3:${def.art}:${scale.toFixed(2)}`;
}

const RELIEF: Record<string, number> = { stones: 0.55, slate: 0.5, limestone: 0.6, liverock: 0.55, reefrock: 0.55, mopani: 0.45, spiderwood: 0.4, claycave: 0.22, coconut: 0.4, cork: 0.65, litter: 0.3 };

/**
 * Micro-relief: treats the painted surface as a height field (brightness plus
 * fine noise) and relights it from the upper left, so stone grain, bark
 * fissures and pits catch light and cast tiny shadows like a photograph of the
 * real material. Then one texel of anti-aliasing on the silhouette.
 */
function relief(img: Img, strength: number, seed: number, scale: number): void {
  const { w, h, data } = img;
  const H = new Float32Array(w * h);
  const f = 0.35 / Math.max(0.5, scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const j = i * 4;
    if (data[j + 3] < 8) continue;
    const l = (data[j] * 0.3 + data[j + 1] * 0.55 + data[j + 2] * 0.15) / 255;
    H[i] = l * 0.65 + fbm(x * f, y * f, seed + 77) * 0.35;
  }
  const out = data.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const j = i * 4;
    if (data[j + 3] < 8) continue;
    const gx = H[i + 1] - H[i - 1];
    const gy = H[i + w] - H[i - w];
    // Light from the upper left: slopes facing it brighten, the others darken.
    const k = 1 + Math.max(-0.45, Math.min(0.45, (-gx * 0.6 - gy * 0.8) * strength * 3));
    out[j] = data[j] * k;
    out[j + 1] = data[j + 1] * k;
    out[j + 2] = data[j + 2] * k;
  }
  data.set(out);
  // Anti-aliased silhouette.
  const src = data.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y * w + x) * 4;
    const a0 = src[j + 3];
    let an = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = (yy * w + xx) * 4;
      an += src[k + 3];
      r += src[k] * src[k + 3];
      g += src[k + 1] * src[k + 3];
      b += src[k + 2] * src[k + 3];
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

/** Hardscape texture; origin should be bottom-centre. */
export function ensureHardscapeTexture(scene: Phaser.Scene, def: DecorDef, scale: number): { key: string; w: number; h: number } {
  const key = hardscapeKey(def, scale);
  const w = Math.round(def.width * scale);
  const h = Math.round(def.height * scale);
  if (scene.textures.exists(key)) return { key, w, h };
  const rng = new Rng(def.id.length * 977 + w);
  const img = new Img(w, h);
  const seed = def.id.length * 131;
  switch (def.art) {
    case 'stones': {
      contactShadow(img, w / 2, w * 0.95);
      const stones = [
        { x: 0.32, r: 0.26, c: '#8f8a80' },
        { x: 0.7, r: 0.22, c: '#7e868a' },
        { x: 0.52, r: 0.16, c: '#a89c86' },
        { x: 0.12, r: 0.12, c: '#8a7e70' },
        { x: 0.88, r: 0.11, c: '#9a948a' },
      ];
      for (const [i, st] of stones.entries()) {
        const rx = w * st.r;
        const ry = Math.min(h * 0.9, rx * rng.range(0.55, 0.75));
        rock(img, w * st.x, h - ry * 0.75 - 1, rx, ry, hex(st.c), seed + i * 11, { grain: 0.14, moss: i === 0 ? 0.25 : 0 });
      }
      break;
    }
    case 'slate': {
      contactShadow(img, w / 2, w);
      let y = h - 1;
      let layer = 0;
      while (y > h * 0.12) {
        const lh = Math.max(3, Math.round(h * rng.range(0.14, 0.22)));
        const inset = w * (0.04 + layer * 0.07 + rng.range(0, 0.05));
        const base = hex(layer % 2 ? '#56626e' : '#4a5660');
        for (let yy = y - lh; yy <= y; yy++) {
          const v = (yy - (y - lh)) / lh; // 0 top .. 1 bottom of the plate
          for (let x = 0; x < w; x++) {
            const edgeL = inset + (noise(yy * 0.4, layer, seed) - 0.5) * 6 * scale;
            const edgeR = w - inset + (noise(yy * 0.4 + 9, layer, seed) - 0.5) * 6 * scale;
            if (x < edgeL || x > edgeR) continue;
            let c = v < 0.22 ? lit(base, 1.3) : lit(base, 0.95 - v * 0.25);
            const n = fbm(x * 0.1, yy * 0.4, seed + layer);
            c = lit(c, 0.92 + n * 0.16);
            if (Math.abs(Math.sin(yy * 1.9 + n * 4)) < 0.1) c = lit(c, 0.85);
            if (x - edgeL < 1.5 || edgeR - x < 1.5) c = lit(c, 0.7);
            img.set(x, yy, c, 1);
          }
        }
        if (layer === 0) {
          // Dark crevice under the first plate.
          const cx = w * 0.42;
          for (let yy = y - lh + 1; yy <= y; yy++) for (let x = cx; x < cx + w * 0.22; x++) img.set(x, yy, [16, 20, 24], 0.92);
        }
        y -= lh - 1;
        layer++;
      }
      break;
    }
    case 'limestone': {
      contactShadow(img, w / 2, w);
      rock(img, w / 2, h * 0.56, w * 0.47, h * 0.47, hex('#d4ccb8'), seed, { grain: 0.18, pits: 0.6 });
      // Deep holes with lit lower rims.
      for (let k = 0; k < 6; k++) {
        const hx = w * rng.range(0.22, 0.78);
        const hy = h * rng.range(0.3, 0.75);
        const r = Math.max(2, rng.range(1.6, 3.6) * scale);
        for (let y = -r; y <= r; y++) for (let x = -r * 1.3; x <= r * 1.3; x++) {
          const d = Math.hypot(x / 1.3, y) / r;
          if (d > 1) continue;
          img.set(hx + x, hy + y, d > 0.75 && y > 0 ? [190, 182, 160] : lit([60, 52, 40], 0.6 + d * 0.5), 1);
        }
      }
      break;
    }
    case 'liverock': {
      // Porous reef rock: two lumps, pits and caves, coralline algae in pink and purple.
      contactShadow(img, w / 2, w);
      rock(img, w * 0.38, h * 0.62, w * 0.34, h * 0.4, hex('#b8a890'), seed, { grain: 0.22, pits: 0.8 });
      rock(img, w * 0.64, h * 0.5, w * 0.3, h * 0.48, hex('#c4b49a'), seed + 5, { grain: 0.22, pits: 0.8 });
      const coral: RGB[] = [hex('#c45a9a'), hex('#9a4ac0'), hex('#e07ab0'), hex('#7a3aa0')];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (img.data[i + 3] < 200) continue;
        const n = fbm(x * 0.16, y * 0.16, seed + 31);
        if (n > 0.58) {
          const c = coral[Math.floor(h2(x >> 2, y >> 2, seed) * coral.length)];
          img.set(x, y, lit(c, 0.75 + (1 - y / h) * 0.45), 0.85);
        } else if (n < 0.24) img.set(x, y, [40, 32, 36], 0.7);
      }
      // A cave mouth at the base.
      const cx = w * 0.5;
      const cy = h * 0.8;
      for (let y = -6 * scale; y <= 0; y++) for (let x = -8 * scale; x <= 8 * scale; x++) {
        if (Math.hypot(x / (8 * scale), y / (6 * scale)) <= 1) img.set(cx + x, cy + y, [18, 14, 20], 0.95);
      }
      break;
    }
    case 'reefrock': {
      // A reef arch: two rubble pillars joined by a bridge of rock, ledges for corals,
      // a dark cave under the arch, coralline algae in pink and purple over the top.
      contactShadow(img, w / 2, w);
      const base = hex('#bfae94');
      const lumps: Array<[number, number, number, number]> = [
        // pillars (x, y, rx, ry as fractions)
        [0.16, 0.78, 0.15, 0.22], [0.22, 0.56, 0.13, 0.2], [0.18, 0.36, 0.12, 0.16],
        [0.8, 0.8, 0.16, 0.2], [0.76, 0.58, 0.14, 0.19], [0.82, 0.4, 0.11, 0.15],
        // bridge
        [0.36, 0.3, 0.14, 0.13], [0.52, 0.24, 0.15, 0.13], [0.66, 0.3, 0.13, 0.13],
        // top ledges
        [0.44, 0.13, 0.09, 0.08], [0.6, 0.14, 0.08, 0.07], [0.28, 0.2, 0.08, 0.07],
      ];
      for (const [i, [fx, fy, frx, fry]] of lumps.entries()) {
        rock(img, w * fx, h * fy, w * frx, h * fry, lit(base, 0.9 + (i % 3) * 0.06), seed + i * 7, { grain: 0.24, pits: 0.85 });
      }
      // Cave under the arch.
      const cx = w * 0.5;
      const cy = h * 0.86;
      for (let y = -h * 0.42; y <= h * 0.1; y++) for (let x = -w * 0.2; x <= w * 0.2; x++) {
        const d = Math.hypot(x / (w * 0.2), y / (h * 0.42));
        if (d <= 1 && cy + y < h - 2) img.set(cx + x, cy + y, mixC([14, 18, 26], [40, 50, 66], Math.max(0, -y / (h * 0.42)) * 0.4), d > 0.92 ? 0.55 : 0.92);
      }
      const coral: RGB[] = [hex('#c45a9a'), hex('#9a4ac0'), hex('#e07ab0'), hex('#7a3aa0'), hex('#d0708a')];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (img.data[i + 3] < 220) continue;
        const n = fbm(x * 0.1, y * 0.1, seed + 31);
        const upper = 1 - y / h;
        if (n > 0.62 - upper * 0.12) {
          const c = coral[Math.floor(h2(x >> 2, y >> 2, seed) * coral.length)];
          img.set(x, y, lit(c, 0.7 + upper * 0.5), 0.8);
        } else if (n < 0.22) img.set(x, y, [36, 30, 34], 0.6);
        // Light from above catches the upper faces.
        if (y > 0 && img.data[((y - 1) * w + x) * 4 + 3] < 40) img.set(x, y, [255, 246, 230], 0.35);
      }
      break;
    }
    case 'mopani':
    case 'spiderwood': {
      const mop = def.art === 'mopani';
      contactShadow(img, w / 2, w * 0.7);
      const cols = mop
        ? { dark: hex('#4a2c1a'), light: hex('#c08a50'), seed, twoTone: true }
        : { dark: hex('#7a5a3a'), light: hex('#c8a678'), seed, twoTone: false };
      const trunks = mop ? 3 : 4;
      for (let b = 0; b < trunks; b++) {
        const x0 = w * (0.3 + (b / Math.max(1, trunks - 1)) * 0.4) + rng.range(-3, 3) * scale;
        const ang = (b / Math.max(1, trunks - 1) - 0.5) * (mop ? 0.9 : 1.3) + rng.range(-0.2, 0.2);
        const len = h * rng.range(mop ? 0.7 : 0.75, mop ? 1.0 : 1.1);
        const th = (mop ? rng.range(4.5, 7.5) : rng.range(1.6, 2.8)) * scale;
        branch(img, x0, h - 2, ang, len, th, mop ? 2 : 0, rng, cols);
      }
      // Root flare.
      for (let x = w * 0.22; x < w * 0.78; x++) {
        const hgt = (1 - Math.abs(x / w - 0.5) / 0.28) * 5 * scale;
        for (let y = 0; y < hgt; y++) img.set(x, h - 1 - y, lit(mixC(cols.dark, cols.light, 0.3), 0.7 + (y / Math.max(1, hgt)) * 0.5), 1);
      }
      break;
    }
    case 'claycave': {
      contactShadow(img, w / 2, w);
      // A terracotta tube lying on its side, open toward the right.
      const base = hex('#b85c34');
      const r = h * 0.46;
      const cy = h - r - 1;
      for (let x = w * 0.06; x < w * 0.84; x++) {
        for (let y = -r; y <= r; y++) {
          const v = y / r;
          const nz = Math.sqrt(Math.max(0, 1 - v * v));
          let c = lit(base, 0.55 + 0.6 * Math.max(0, nz * 0.7 - v * 0.5));
          if (Math.abs(Math.sin(x * 0.6)) < 0.12) c = lit(c, 0.88); // ridges
          c = lit(c, 0.94 + fbm(x * 0.2, y * 0.2, seed) * 0.12);
          img.set(x, cy + y, c, 1);
        }
      }
      // Mouth: rim and dark interior.
      const mx = w * 0.84;
      for (let y = -r; y <= r; y++) for (let x = -r * 0.45; x <= r * 0.45; x++) {
        const d = Math.hypot(x / (r * 0.45), y / r);
        if (d > 1) continue;
        img.set(mx + x, cy + y, d > 0.78 ? lit(base, 1.1 - (y / r) * 0.3) : lit([30, 14, 8], 0.6 + (1 - d) * 0.3), 1);
      }
      break;
    }
    case 'coconut': {
      contactShadow(img, w / 2, w);
      const base = hex('#6a4226');
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
        for (let x = -half; x <= half; x++) {
          const v = x / Math.max(1, half);
          let c = lit(base, 0.65 + 0.55 * Math.max(0, 1 - Math.abs(v + 0.3)) - (1 - t) * 0.1);
          if (Math.abs(Math.sin((x * 0.9 + y * 0.35) + noise(x * 0.3, y * 0.3, seed) * 3)) < 0.2) c = lit(c, 1.25); // fibres
          if (Math.abs(x) >= half - 1) c = lit(c, 0.6);
          img.set(w / 2 + x, y, c, 1);
        }
      }
      // Doorway.
      const dr = Math.max(2, w * 0.17);
      for (let y = -h * 0.42; y <= 0; y++) for (let x = -dr; x <= dr; x++) {
        if (Math.hypot(x / dr, y / (h * 0.42)) <= 1) img.set(w / 2 + x, h - 1 + y, [24, 14, 6], 1);
      }
      break;
    }
    case 'cork': {
      // A curved tube of cork bark lying as an arch: rough, deeply fissured outer
      // bark in grey-browns, a paler cut rim, and a dark hollow underneath.
      contactShadow(img, w / 2, w * 1.02);
      const bark = hex('#5a4a3c');
      const pale = hex('#a8865e');
      const cx = w / 2;
      const rx = w * 0.48;
      const ry = h * 0.96;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x - cx) / rx;
          const dy = (h - 1 - y) / ry;
          const rough = (fbm(x * 0.25, y * 0.25, seed) - 0.5) * 0.12;
          const d = Math.hypot(dx, dy) + rough;
          if (d > 1) continue;
          const inner = Math.hypot(dx / 0.72, dy / 0.66);
          if (inner < 1) {
            // Hollow: dark, a little warmer near the rim.
            img.set(x, y, lit([34, 24, 16], 0.7 + (1 - inner) * 0.2 + Math.max(0, inner - 0.85) * 2), 1);
            continue;
          }
          const ang = Math.atan2(dy, dx);
          const nz = Math.sqrt(Math.max(0, 1 - d * d));
          let c = lit(bark, 0.6 + 0.6 * Math.max(0, nz * 0.5 + Math.cos(ang - 2.2) * 0.4));
          // Fissures run along the curve of the bark.
          const f = noise(ang * 9, d * 6, seed + 5);
          if (f > 0.68) c = lit(c, 0.5);
          else if (f < 0.2) c = mixC(c, pale, 0.25);
          if (h2(x, y, seed) < 0.06) c = lit(c, 1.15);
          // Lichen speckles.
          if (fbm(x * 0.3, y * 0.3, seed + 31) > 0.74) c = mixC(c, [150, 160, 120], 0.4);
          // Cut edge where the tube meets the hollow.
          if (inner < 1.12) c = mixC(c, pale, 0.55);
          if (d > 0.93) c = lit(c, 0.72);
          img.set(x, y, c, 1);
        }
      }
      break;
    }
    case 'litter': {
      // A low drift of dry leaves: oak and magnolia in browns, tans and rust.
      const cols: RGB[] = [hex('#6a4426'), hex('#8a5a2e'), hex('#a8743c'), hex('#5a3a22'), hex('#b8864a'), hex('#7a3a22')];
      const n = Math.round(w * 0.7);
      for (let i = 0; i < n; i++) {
        const lx = rng.range(2, w - 2);
        const ly = h - 1 - rng.range(0, h * 0.7) * (1 - Math.abs(lx / w - 0.5) * 1.2);
        const len = rng.range(3, 6) * scale;
        const wid = len * rng.range(0.35, 0.5);
        const a = rng.range(-0.6, 0.6);
        const base = rng.pick(cols);
        for (let u = -len; u <= len; u++) for (let v = -wid; v <= wid; v++) {
          if ((u / len) ** 2 + (v / wid) ** 2 > 1) continue;
          let c = lit(base, 0.8 + (v < 0 ? 0.25 : 0) + (rng.chance(0.08) ? -0.2 : 0));
          if (Math.abs(v) < 0.6) c = lit(c, 0.78); // midrib
          img.set(lx + Math.cos(a) * u - Math.sin(a) * v, ly + Math.sin(a) * u * 0.5 + Math.cos(a) * v * 0.5, c, 1);
        }
      }
      break;
    }
    default:
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(x, y, [136, 136, 136]);
  }
  relief(img, RELIEF[def.art] ?? 0.4, seed, scale);
  const tex = scene.textures.createCanvas(key, w, h)!;
  tex.getContext().putImageData(new ImageData(img.data, w, h), 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return { key, w, h };
}
