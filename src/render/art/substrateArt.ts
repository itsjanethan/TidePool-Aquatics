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

function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise 0..1. */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const v = y - yi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

type SetPx = (x: number, y: number, c: RGB, a?: number) => void;

/**
 * One stone or soil granule: an irregular outline, shaded as a rounded solid
 * lit from the upper left (diffuse, a wet specular glint and soft occlusion
 * at its foot), with mineral speckle, a contact shadow on what lies behind it
 * and an anti-aliased edge.
 */
function paintGrain(set: SetPx, g: { x: number; y: number; r: number; ry: number; rot: number; c: RGB; seed: number }, back: (x: number) => number, wet: number, round: boolean): void {
  const { x: cx, y: cy, r, ry, rot, c, seed } = g;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const R = Math.ceil(Math.max(r, ry) * 1.25) + 1;
  // Contact shadow first, slightly below and right.
  for (let yy = -R; yy <= R; yy++) {
    for (let xx = -R; xx <= R; xx++) {
      const d = Math.hypot(xx / (r * 1.1), (yy - ry * 0.35) / (ry * 1.05));
      if (d < 1 && cy + yy >= back(cx + xx)) set(cx + xx + r * 0.15, cy + yy, [8, 7, 6], 0.32 * (1 - d));
    }
  }
  const p1 = hash2(seed, 1, 7) * 6.28;
  const p2 = hash2(seed, 2, 7) * 6.28;
  const lumpy = round ? 0.05 : 0.14;
  for (let yy = -R; yy <= R; yy++) {
    for (let xx = -R; xx <= R; xx++) {
      const u = (xx * cs + yy * sn) / r;
      const v = (-xx * sn + yy * cs) / ry;
      const ang = Math.atan2(v, u);
      const edge = 1 + lumpy * Math.sin(3 * ang + p1) + lumpy * 0.5 * Math.sin(5 * ang + p2);
      const d = Math.hypot(u, v) / edge;
      if (d > 1.05) continue;
      if (cy + yy < back(cx + xx) - 0.5) continue;
      const cover = Math.min(1, Math.max(0, (1.05 - d) * Math.min(r, ry) * 0.9));
      if (cover <= 0) continue;
      const dd = Math.min(1, d);
      const nz = Math.sqrt(1 - dd * dd);
      const nx = (xx / Math.max(1, Math.hypot(xx, yy))) * dd;
      const ny = (yy / Math.max(1, Math.hypot(xx, yy))) * dd;
      // Light from the upper left and in front.
      const lam = Math.max(0, -nx * 0.38 - ny * 0.72 + nz * 0.58);
      let k = 0.3 + 0.82 * lam;
      // Occlusion toward the foot of the grain.
      k *= 1 - 0.35 * Math.max(0, ny) * dd;
      const speck = (hash2(Math.round(cx + xx), Math.round(cy + yy), seed & 1023) - 0.5) * 0.12;
      let col = lit(c, k + speck);
      // Wet glint: a small bright highlight up and to the left.
      const hx = nx + 0.3;
      const hy = ny + 0.45;
      const spec = Math.max(0, 1 - Math.hypot(hx, hy) * 3.2);
      if (spec > 0) col = mixC(col, [255, 252, 240], spec * spec * wet);
      set(cx + xx, cy + yy, col, cover);
    }
  }
}

/**
 * Leaf litter on a forest floor or coco fibre: curled dry leaves with a midrib,
 * a few twigs and loose fibre on the top surface, thinning into the soil below.
 */
function paintLitter(set: SetPx, rng: Rng, W: number, back: (x: number) => number, front: (x: number) => number, res: number): void {
  const browns: RGB[] = [[122, 82, 44], [96, 62, 34], [140, 102, 58], [78, 52, 30], [150, 118, 70]];
  const n = Math.round(W / (3.2 * res));
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, W);
    const top = back(x);
    const y = rng.range(top - res, top + (front(x) - top) * 1.6);
    const len = rng.range(4, 9) * res;
    const wid = len * rng.range(0.32, 0.5);
    const ang = rng.range(-0.5, 0.5) + (rng.chance(0.5) ? Math.PI : 0);
    const col = rng.pick(browns);
    const curl = rng.range(-0.4, 0.4);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let s = -len / 2; s <= len / 2; s += 0.5) {
      const t = (s + len / 2) / len;
      const half = Math.sin(t * Math.PI) * wid * 0.5;
      for (let w = -half; w <= half; w += 0.5) {
        const lx = s;
        const ly = w * 0.45 + curl * (s * s) / len;
        const px = x + lx * ca - ly * sa;
        const py = y + lx * sa * 0.35 + ly * ca;
        if (py < back(px) - res) continue;
        const across = w / Math.max(0.5, half);
        let c = lit(col, 0.75 + 0.35 * (1 - Math.abs(across + 0.3)));
        if (Math.abs(w) < 0.6) c = lit(c, 0.8);
        if (Math.abs(across) > 0.85) c = lit(c, 0.78);
        set(px, py, c, 0.95);
      }
    }
  }
  for (let i = 0; i < W / (14 * res); i++) {
    const x = rng.range(0, W);
    const y = back(x) + rng.range(0, 3) * res;
    const len = rng.range(10, 26) * res;
    const ang = rng.range(-0.25, 0.25);
    for (let s = 0; s < len; s += 0.5) {
      const px = x + Math.cos(ang) * s;
      const py = y + Math.sin(ang) * s;
      for (let w = -res * 0.6; w <= res * 0.6; w += 0.5) set(px, py + w, lit([92, 66, 40], 0.75 + (w < 0 ? 0.3 : 0)), 0.95);
    }
  }
}

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
  const key = `substrate4:${id}:${tankId}:${W}`;
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
  } else if (grain === 'sand') {
    // Sand reads as a fine mineral texture rather than separate grains: grain-scale
    // speckle over soft value noise, ripples on the top surface, scattered dark and
    // glassy grains, and the bed darkening with depth behind the glass.
    const g = Math.max(1, Math.round(res * 0.5));
    for (let x = 0; x < W; x++) {
      const yb = back(x);
      for (let y = Math.round(yb); y < HH; y++) {
        const onTop = y < front(x);
        const n = vnoise(x / (6 * res), y / (6 * res), 3) * 0.6 + vnoise(x / (2 * res), y / (2 * res), 9) * 0.4;
        const sp = hash2(Math.floor(x / g), Math.floor(y / g), 5);
        let k = 0.88 + n * 0.2 + (sp - 0.5) * 0.16;
        if (onTop) k += 0.05 * Math.sin(x * 0.045 / res + Math.sin(x * 0.011 / res) * 2 + (y - yb) * 0.6 / res);
        const c = mixC(A, B, n);
        set(x, y, lit(c, k * (onTop ? 1.06 : 1)), 0.9);
        if (sp > 0.985) set(x, y, lit(A, 0.55), 0.8);
        else if (sp < 0.012) set(x, y, [250, 248, 238], 0.7);
      }
    }
  } else {
    const cols: RGB[] = [A, B, lit(A, 0.85), lit(B, 1.1), mixC(A, B, 0.5)];
    if (grain === 'coarse') cols.push(hex('#9a8a72'), hex('#6e7472'), hex('#b0a088'));
    const size = grain === 'fine' ? [0.8, 1.6] : grain === 'gravel' ? [1.4, 3] : grain === 'coarse' ? [3, 6.5] : [1, 1.9];
    const density = grain === 'coarse' ? 1.05 : 1.25;
    const count = Math.round((W * HH * density) / Math.pow(((size[0] + size[1]) / 2) * res, 2));
    // Grains are painted back to front so lower, nearer grains overlap the ones behind.
    const grains: Array<{ x: number; y: number; r: number; ry: number; rot: number; c: RGB; seed: number }> = [];
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, W);
      const yTop = back(x);
      const y = rng.range(yTop - res, HH);
      const r = rng.range(size[0], size[1]) * res;
      const onTop = y < front(x);
      // On the receding top surface grains are seen from above, so they look flatter.
      const ry = r * rng.range(0.62, 0.92) * (onTop ? 0.7 : 1);
      const depthK = onTop ? 1.05 : 0.96 - ((y - front(x)) / (HH - front(x))) * 0.5;
      const pick = grain === 'soil' ? mixC(A, B, rng.range(0, 1)) : rng.pick(cols);
      grains.push({ x, y, r, ry, rot: rng.range(-0.6, 0.6), c: lit(pick, depthK * rng.range(0.88, 1.08)), seed: rng.int(1, 1 << 20) });
    }
    grains.sort((a, b) => a.y - b.y);
    const wet = grain === 'soil' ? 0.5 : 0.22;
    for (const gr of grains) paintGrain(set, gr, back, wet, grain === 'soil');
    if (sub.land && sub.land.moisture > 0.5) paintLitter(set, rng, W, back, front, res);
  }
  // Lit rim along the back edge (light catching the top of the bed).
  for (let x = 0; x < W; x++) set(x, back(x), lit(B, 1.25), 0.8);
  const tex = scene.textures.createCanvas(key, W, HH)!;
  tex.getContext().putImageData(new ImageData(data, W, HH), 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/**
 * Mulm: fine brown detritus settling on the bed. Same size and origin as the
 * substrate texture so it follows the contour; the renderer sets its alpha
 * from the water's detritus, so a gravel vac visibly clears it.
 */
export function ensureMulm(scene: Phaser.Scene, tankId: string, W: number, res: number): string {
  const key = `mulm1:${tankId}:${W}`;
  if (scene.textures.exists(key)) return key;
  const contour = substrateContour(tankId, W, res);
  const pad = 10 * res;
  const HH = pad + 8 * res;
  const rng = new Rng(seedOf(`mulm${tankId}`));
  const tex = scene.textures.createCanvas(key, W, HH)!;
  const ctx = tex.getContext();
  const front = (x: number) => pad - contour(x);
  const cols = ['rgba(74,58,36,0.85)', 'rgba(92,74,44,0.75)', 'rgba(60,66,40,0.7)', 'rgba(110,92,60,0.6)'];
  for (let i = 0; i < W * 0.9; i++) {
    const x = rng.range(0, W);
    // Settles on the top band, thicker in the hollows (where the bed dips).
    const hollow = Math.max(0, 1 - contour(x) / (4 * res));
    if (!rng.chance(0.45 + hollow * 0.5)) continue;
    const y = front(x) - rng.range(0, TOP_BAND * res) + res;
    ctx.fillStyle = cols[rng.int(0, cols.length - 1)];
    ctx.fillRect(Math.round(x), Math.round(y), res * rng.int(1, 2), res);
  }
  tex.refresh();
  return key;
}

/** Extra canvas pixels the substrate texture extends above its nominal top. */
export function substratePad(res: number): number {
  return 10 * res;
}
