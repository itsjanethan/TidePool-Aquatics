/**
 * Plant art. Each plant species has its own architecture (rosette, rhizome,
 * ribbon clumps with runners, stems with whorls or leaf pairs, moss) built
 * from its growth stage, so a cutting, a juvenile, a mature plant and an
 * overgrown plant differ in structure (leaf count, leaf size, number of
 * stems/daughter plants, trailing at the surface) rather than only in scale.
 *
 * Models are built once (seeded, deterministic) and drawn every frame as
 * filled polygons with a lit side, a midrib and veins, swaying with the flow
 * and toned by the light reaching them.
 */
import type Phaser from 'phaser';
import { Rng } from '../../core/rng';
import type { DecorDef } from '../../data/catalog';

type RGB = [number, number, number];

export type LeafShape = 'sword' | 'fern' | 'oval' | 'ribbon' | 'crypt';

export interface LeafSpec {
  /** Base position relative to the plant origin (px, y negative = up). */
  x: number;
  y: number;
  /** Angle from vertical (radians, + leans right). */
  angle: number;
  length: number;
  width: number;
  /** Extra angle reached at the tip (arching). */
  bend: number;
  shape: LeafShape;
  /** Fraction of the length that is bare stalk. */
  petiole: number;
  col: RGB;
  phase: number;
  sway: number;
  /** 0 young .. 1 old (young leaves are paler; old ones darker). */
  age: number;
  seed: number;
}

export interface StemSpec {
  x: number;
  height: number;
  lean: number;
  nodeGap: number;
  leaf: 'whorl' | 'pair';
  leafLen: number;
  bottom: RGB;
  top: RGB;
  phase: number;
  sway: number;
}

export interface MossBlob {
  x: number;
  y: number;
  r: number;
  seed: number;
}

export interface PlantModel {
  leaves: LeafSpec[];
  stems: StemSpec[];
  moss: MossBlob[];
  mossCol: RGB;
  rhizome: { x0: number; x1: number; col: RGB } | null;
  height: number;
  width: number;
  /** Pixel scale the model was built at (1 = logical pixels). */
  px: number;
}

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toInt = (c: RGB, k = 1): number => {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * k)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * k)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * k)));
  return (r << 16) | (g << 8) | b;
};

/** Growth stage name for a size (matches sim/plants sizeLabel thresholds loosely). */
export function plantStage(size: number): 'cutting' | 'juvenile' | 'established' | 'mature' | 'overgrown' {
  if (size < 0.3) return 'cutting';
  if (size < 0.6) return 'juvenile';
  if (size < 1) return 'established';
  if (size < 1.3) return 'mature';
  return 'overgrown';
}

/**
 * Builds a plant from its definition. `size` is the growth (1 = mature).
 * `health` below ~0.6 yellows and browns the older leaves.
 */
export function buildPlant(def: DecorDef, scale: number, seed: number, health: number, size = 1): PlantModel {
  const rng = new Rng(seed);
  const g = Math.max(0.15, Math.min(1.9, size));
  const H = def.height * scale * (0.32 + 0.68 * Math.min(g, 1.6));
  const W = def.width * scale * (0.45 + 0.55 * Math.min(g, 1.5));
  const sick = Math.max(0, 0.75 - health) * 1.3;
  const ill = (c: RGB, age: number) => mixC(c, hex('#a08a3a'), Math.min(1, sick * (0.4 + age)));
  const leaves: LeafSpec[] = [];
  const stems: StemSpec[] = [];
  const moss: MossBlob[] = [];
  let rhizome: PlantModel['rhizome'] = null;
  let mossCol: RGB = hex('#3f7a34');
  const count = (base: number, perGrowth: number) => Math.max(1, Math.round(base + perGrowth * Math.min(g, 1.7)));
  const leaf = (l: Omit<LeafSpec, 'seed'>) => leaves.push({ ...l, col: ill(l.col, l.age), seed: rng.int(0, 1e6) });

  switch (def.art) {
    case 'sword': {
      // Rosette: outer leaves are old, long and arching; inner leaves young and upright.
      const n = count(3, 10);
      for (let i = 0; i < n; i++) {
        const age = 1 - i / Math.max(1, n - 1);
        const side = i % 2 ? 1 : -1;
        const angle = side * (0.12 + age * 0.95) + rng.range(-0.08, 0.08);
        leaf({ x: rng.range(-1, 1) * scale, y: 0, angle, length: H * (0.55 + 0.45 * age) * rng.range(0.85, 1.05), width: H * 0.16 * (0.6 + 0.4 * age), bend: side * age * 0.45, shape: 'sword', petiole: 0.28, col: mixC(hex('#5cbf5a'), hex('#2f8a3a'), age * 0.8), phase: rng.range(0, 6), sway: 1.2 * scale, age });
      }
      break;
    }
    case 'crypt': {
      const n = count(3, 7);
      for (let i = 0; i < n; i++) {
        const age = 1 - i / Math.max(1, n - 1);
        const side = i % 2 ? 1 : -1;
        const tone = rng.pick(['#6a7a3a', '#7a6a3a', '#5a7040']);
        leaf({ x: rng.range(-2, 2) * scale, y: 0, angle: side * (0.25 + age * 0.75), length: H * (0.6 + 0.4 * age) * rng.range(0.85, 1.05), width: H * 0.2, bend: side * 0.35 * age, shape: 'crypt', petiole: 0.22, col: mixC(hex(tone), hex('#8a4a42'), rng.range(0, 0.35)), phase: rng.range(0, 6), sway: 0.8 * scale, age });
      }
      break;
    }
    case 'fern':
    case 'anubias': {
      // Creeping rhizome with leaves rising along it; it lengthens as the plant grows.
      const fern = def.art === 'fern';
      const span = W * (fern ? 0.6 : 0.5);
      rhizome = { x0: -span / 2, x1: span / 2, col: hex(fern ? '#4a3a24' : '#3a5a30') };
      const n = fern ? count(2, 9) : count(2, 6);
      for (let i = 0; i < n; i++) {
        const age = rng.next();
        const x = rng.range(-span / 2, span / 2);
        const angle = (x / (span / 2 + 1)) * (fern ? 0.6 : 0.9) + rng.range(-0.25, 0.25);
        if (fern) {
          leaf({ x, y: -scale, angle, length: H * rng.range(0.6, 1), width: H * 0.11, bend: angle * 0.3, shape: 'fern', petiole: 0.12, col: mixC(hex('#4a9a4c'), hex('#2a5e32'), age), phase: rng.range(0, 6), sway: 1.4 * scale, age });
        } else {
          leaf({ x, y: -scale, angle: angle * 1.1, length: H * rng.range(0.65, 1), width: H * 0.34, bend: angle * 0.15, shape: 'oval', petiole: 0.42, col: mixC(hex('#3a7a3e'), hex('#1f4a28'), age), phase: rng.range(0, 6), sway: 0.5 * scale, age });
        }
      }
      break;
    }
    case 'vallis': {
      // Ribbon clumps; runners add daughter clumps beside the mother as it grows.
      const clumps = Math.max(1, Math.round(1 + Math.min(g, 1.8) * 2));
      for (let c = 0; c < clumps; c++) {
        const cx = c === 0 ? 0 : (c % 2 ? 1 : -1) * Math.ceil(c / 2) * W * 0.32;
        const mother = c === 0;
        const n = mother ? count(3, 7) : count(1, 3);
        for (let i = 0; i < n; i++) {
          const age = rng.next();
          leaf({ x: cx + rng.range(-2, 2) * scale, y: 0, angle: rng.range(-0.18, 0.18), length: H * rng.range(0.55, 1.05) * (mother ? 1 : 0.65), width: 2.6 * scale, bend: rng.range(-0.25, 0.25), shape: 'ribbon', petiole: 0, col: mixC(hex('#7acc58'), hex('#4a9a3a'), age), phase: rng.range(0, 6), sway: 5 * scale, age });
        }
      }
      break;
    }
    case 'hornwort':
    case 'rotala': {
      const horn = def.art === 'hornwort';
      const n = count(1, horn ? 3 : 5);
      for (let i = 0; i < n; i++) {
        stems.push({
          x: rng.range(-W * 0.3, W * 0.3),
          height: H * rng.range(0.6, 1),
          lean: rng.range(-0.15, 0.15),
          nodeGap: (horn ? 3 : 4) * scale,
          leaf: horn ? 'whorl' : 'pair',
          leafLen: (horn ? 5.5 : 3.2) * scale * (0.7 + 0.3 * Math.min(1, g)),
          bottom: hex(horn ? '#2e6a2c' : '#4a8a3a'),
          top: hex(horn ? '#5aa040' : '#e0786a'),
          phase: rng.range(0, 6),
          sway: (horn ? 2.5 : 2) * scale,
        });
      }
      break;
    }
    case 'bromeliad': {
      // Stiff strap leaves in a rosette; the young centre leaves blush red.
      const n = count(5, 7);
      for (let i = 0; i < n; i++) {
        const age = 1 - i / Math.max(1, n - 1);
        const side = i % 2 ? 1 : -1;
        leaf({ x: rng.range(-1, 1) * scale, y: 0, angle: side * (0.15 + age * 1.05) + rng.range(-0.06, 0.06), length: H * (0.55 + 0.45 * age), width: H * 0.12, bend: side * age * 0.3, shape: 'sword', petiole: 0.05, col: mixC(hex('#d8304a'), hex('#4a8a3a'), Math.min(1, age * 1.4)), phase: rng.range(0, 6), sway: 0.2 * scale, age });
      }
      break;
    }
    case 'pothos': {
      // Vines arching up and over, heart-shaped leaves along them, some variegated.
      const vines = count(1, 2);
      for (let v = 0; v < vines; v++) {
        const dir = v % 2 ? 1 : -1;
        const leavesOnVine = count(3, 5);
        for (let i = 0; i < leavesOnVine; i++) {
          const t = (i + 1) / leavesOnVine;
          const x = dir * W * 0.38 * Math.sin(t * 1.4) + rng.range(-1, 1) * scale;
          const y = -H * (0.85 * Math.sin(t * 2.2) + 0.08);
          const age = 1 - t;
          leaf({ x, y: Math.min(0, y), angle: dir * rng.range(0.4, 1.3), length: H * 0.24, width: H * 0.14, bend: dir * 0.2, shape: 'oval', petiole: 0.2, col: mixC(hex('#3a8a34'), hex('#d8d070'), rng.chance(0.4) ? 0.35 : 0.05), phase: rng.range(0, 6), sway: 0.3 * scale, age });
        }
      }
      break;
    }
    case 'bfern': {
      const n = count(5, 8);
      for (let i = 0; i < n; i++) {
        const age = rng.next();
        const side = i % 2 ? 1 : -1;
        const angle = side * rng.range(0.2, 1.2);
        leaf({ x: rng.range(-2, 2) * scale, y: 0, angle, length: H * rng.range(0.7, 1.05), width: H * 0.1, bend: side * 0.7, shape: 'fern', petiole: 0.1, col: mixC(hex('#6ab84a'), hex('#3a7a2a'), age), phase: rng.range(0, 6), sway: 0.4 * scale, age });
      }
      break;
    }
    case 'moss': {
      mossCol = hex('#3f7a34');
      const n = count(2, 5);
      for (let i = 0; i < n; i++) moss.push({ x: rng.range(-W * 0.35, W * 0.35), y: -rng.range(0, H * 0.5), r: rng.range(0.35, 0.6) * H, seed: rng.int(0, 1e6) });
      break;
    }
    default:
      break;
  }
  return { leaves, stems, moss, mossCol, rhizome, height: H, width: W, px: scale };
}

/** Half-width of a leaf at t (0 base .. 1 tip) after the petiole, by shape. */
function leafWidth(shape: LeafShape, t: number, width: number, seed: number): number {
  switch (shape) {
    case 'sword':
      return width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)), 0.8) * (1 - t * 0.25);
    case 'fern':
      return width * Math.sin(Math.PI * Math.min(1, t)) * (1 + Math.sin(t * 22 + seed) * 0.12);
    case 'crypt':
      return width * Math.sin(Math.PI * Math.min(1, t)) * (1 + Math.sin(t * 26 + seed) * 0.18);
    case 'oval':
      return width * Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.7);
    case 'ribbon':
      return width * (t > 0.92 ? (1 - t) / 0.08 : 1);
  }
}

export interface PlantDrawOptions {
  time: number;
  flow: number;
  alpha?: number;
  surfaceY?: number;
  /** 0..1 light at a canvas point. */
  light?: (x: number, y: number) => number;
  /** Depth layer 0 back .. 2 front (back plants are slightly hazier). */
  layer?: number;
}

/** Draws a plant model at (x, baseY). */
export function drawPlant(g: Phaser.GameObjects.Graphics, plant: PlantModel, x: number, baseY: number, o: PlantDrawOptions): void {
  const a = o.alpha ?? 1;
  const surfaceY = o.surfaceY ?? -Infinity;
  const light = o.light ?? (() => 1);
  const haze = o.layer === 0 ? 0.88 : o.layer === 2 ? 1.05 : 1;
  const px = plant.px;

  // Moss: fuzzy layered clumps of short strands.
  for (const m of plant.moss) {
    const rng = new Rng(m.seed);
    const k = light(x + m.x, baseY + m.y) * haze;
    for (let i = 0; i < 70; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(rng.next()) * m.r;
      const sx = x + m.x + Math.cos(ang) * rr * 1.3;
      const sy = Math.min(baseY, baseY + m.y + Math.sin(ang) * rr * 0.7);
      const tone = 0.7 + 0.5 * (1 - (sy - (baseY + m.y - m.r)) / (m.r * 2)) + rng.range(-0.12, 0.12);
      const wob = Math.sin(o.time * 1.1 + i) * 0.6 * px * o.flow;
      g.fillStyle(toInt(plant.mossCol, tone * k), a).fillRect(Math.round(sx + wob), Math.round(sy), px * rng.int(1, 3), px);
    }
  }

  // Rhizome lying along the ground (java fern, anubias).
  if (plant.rhizome) {
    const r = plant.rhizome;
    g.fillStyle(toInt(r.col, 0.8 * haze), a).fillRect(Math.round(x + r.x0), Math.round(baseY - 2 * px), Math.round(r.x1 - r.x0), 2 * px);
    g.fillStyle(toInt(r.col, 1.2 * haze), a).fillRect(Math.round(x + r.x0), Math.round(baseY - 2 * px), Math.round(r.x1 - r.x0), px);
    for (let rx = r.x0; rx < r.x1; rx += 5 * px) g.fillStyle(toInt(r.col, 0.6), a).fillRect(Math.round(x + rx), Math.round(baseY), px, 2 * px);
  }

  // Stems with whorls of needles (hornwort) or leaf pairs (rotala).
  for (const st of plant.stems) {
    const nodes = Math.max(2, Math.round(st.height / st.nodeGap));
    let sx = x + st.x;
    let sy = baseY;
    let trailing = false;
    for (let i = 0; i < nodes; i++) {
      const t = i / nodes;
      const sway = Math.sin(o.time * 1.1 + st.phase + t * 2.4) * st.sway * t * t * (0.6 + o.flow);
      if (!trailing) {
        sx += st.lean * st.nodeGap;
        sy -= st.nodeGap;
        if (sy <= surfaceY + 3 * px) trailing = true;
      } else sx += st.nodeGap * Math.sign(st.lean || 1);
      const nx = Math.round(sx + (trailing ? 0 : sway));
      const ny = Math.round(trailing ? surfaceY + 3 * px + Math.sin(o.time + i) * px * 0.5 : sy);
      const k = light(nx, ny) * haze;
      const c = mixC(st.bottom, st.top, Math.pow(t, 1.6));
      g.fillStyle(toInt(c, 0.7 * k), a).fillRect(nx, ny, px, st.nodeGap + px);
      if (st.leaf === 'whorl') {
        for (let n = 0; n < 6; n++) {
          const ang = (n / 6) * Math.PI * 2 + i * 0.6;
          const lx = Math.cos(ang) * st.leafLen;
          const ly = Math.sin(ang) * st.leafLen * 0.35 - st.leafLen * 0.25;
          const shade = Math.sin(ang) > 0 ? 0.75 : 1.05;
          g.lineStyle(px, toInt(c, shade * k), a).lineBetween(nx, ny, nx + lx, ny + ly);
        }
      } else {
        const lw = st.leafLen;
        for (const sgn of [-1, 1]) {
          const lx = nx + sgn * (lw * 0.6 + px);
          g.fillStyle(toInt(c, 0.95 * k), a).fillEllipse(lx, ny, lw * 1.3, lw * 0.6);
          g.fillStyle(toInt(c, 1.2 * k), a).fillRect(Math.round(lx - lw * 0.3), ny - px, Math.round(lw * 0.5), px);
        }
      }
    }
  }

  // Leaves: filled polygons with a lit side, midrib and veins.
  for (const l of plant.leaves) {
    const n = l.shape === 'ribbon' ? 16 : 11;
    const left: number[] = [];
    const right: number[] = [];
    const mid: number[] = [];
    let cx = x + l.x;
    let cy = baseY + l.y;
    let ang = l.angle;
    const seg = l.length / n;
    let trailing = false;
    const wave = l.shape === 'ribbon' ? 1.6 : 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sway = Math.sin(o.time * (l.shape === 'ribbon' ? 0.9 : 1.2) + l.phase + t * 2.2 * wave) * l.sway * t * t * (0.6 + o.flow);
      const px0 = cx + (trailing ? 0 : sway);
      const py0 = cy;
      const w = t < l.petiole ? px * 0.6 : leafWidth(l.shape, (t - l.petiole) / (1 - l.petiole), l.width / 2, l.seed);
      // Normal to the leaf direction.
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      left.push(px0 - nx * w, py0 - ny * w);
      right.push(px0 + nx * w, py0 + ny * w);
      mid.push(px0, py0);
      if (!trailing) {
        ang = l.angle + l.bend * t;
        cx += Math.sin(ang) * seg;
        cy -= Math.cos(ang) * seg;
        if (cy <= surfaceY + 3 * px && (l.shape === 'ribbon' || l.shape === 'sword')) {
          trailing = true;
          ang = (Math.PI / 2) * Math.sign(l.angle || 1);
        }
      } else {
        cx += seg * Math.sign(l.angle || 1);
        cy = surfaceY + 3 * px + Math.sin(o.time * 0.8 + i) * px * 0.6;
      }
    }
    // Light: brighter near the top of the tank; young leaves paler and fresher.
    const tipY = mid[mid.length - 1];
    const k = (0.72 + 0.38 * light(mid[mid.length - 2], tipY)) * haze;
    const base = mixC(l.col, [180, 220, 120], (1 - l.age) * 0.18);
    const poly: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < left.length / 2; i++) poly.push({ x: left[i * 2], y: left[i * 2 + 1] });
    for (let i = right.length / 2 - 1; i >= 0; i--) poly.push({ x: right[i * 2], y: right[i * 2 + 1] });
    g.fillStyle(toInt(base, 0.86 * k), a).fillPoints(poly, true);
    // Lit half (the side facing up/out).
    if (l.width > 2.5 * px && l.shape !== 'ribbon') {
      const lit: Phaser.Types.Math.Vector2Like[] = [];
      const side = l.angle >= 0 ? left : right;
      for (let i = 0; i < side.length / 2; i++) lit.push({ x: side[i * 2], y: side[i * 2 + 1] });
      for (let i = mid.length / 2 - 1; i >= 0; i--) lit.push({ x: mid[i * 2], y: mid[i * 2 + 1] });
      g.fillStyle(toInt(base, 1.08 * k), a).fillPoints(lit, true);
    } else if (l.shape === 'ribbon') {
      // Ribbon twist: alternating light bands.
      for (let i = 1; i < mid.length / 2; i += 3) g.fillStyle(toInt(base, 1.18 * k), a).fillRect(Math.round(mid[i * 2]), Math.round(mid[i * 2 + 1]), px, px * 2);
    }
    // Midrib and veins.
    if (l.width > 3 * px) {
      g.lineStyle(px, toInt(base, 0.62 * k), a * 0.9);
      g.beginPath();
      g.moveTo(mid[0], mid[1]);
      for (let i = 1; i < mid.length / 2; i++) g.lineTo(mid[i * 2], mid[i * 2 + 1]);
      g.strokePath();
      if (l.shape === 'sword' || l.shape === 'oval') {
        const start = Math.ceil(l.petiole * n) + 1;
        for (let i = start; i < n - 1; i += 2) {
          const mx = mid[i * 2];
          const my = mid[i * 2 + 1];
          g.lineStyle(px, toInt(base, 0.78 * k), a * 0.6);
          g.lineBetween(mx, my, (mx + left[(i + 1) * 2]) / 2, (my + left[(i + 1) * 2 + 1]) / 2);
          g.lineBetween(mx, my, (mx + right[(i + 1) * 2]) / 2, (my + right[(i + 1) * 2 + 1]) / 2);
        }
      }
      // Java fern spore dots on older leaves.
      if (l.shape === 'fern' && l.age > 0.6) {
        for (let i = Math.ceil(n * 0.4); i < n; i += 2) g.fillStyle(0x3a2a1a, a * 0.8).fillRect(Math.round(left[i * 2] * 0.6 + mid[i * 2] * 0.4), Math.round(left[i * 2 + 1] * 0.6 + mid[i * 2 + 1] * 0.4), px, px);
      }
    }
    // Leaf edge highlight at the tip.
    g.fillStyle(toInt(base, 1.25 * k), a * 0.7).fillRect(Math.round(mid[mid.length - 2]), Math.round(tipY), px, px);
  }
}
