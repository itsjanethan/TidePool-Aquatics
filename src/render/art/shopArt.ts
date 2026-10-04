/**
 * Procedural pixel art for the shop overworld: floor, walls, props.
 */
import Phaser from 'phaser';
import type { FloorLayout, FloorTheme, PropPlacement } from '../../data/shopLayout';
import { TILE } from '../../data/shopLayout';
import { Rng } from '../../core/rng';
import { makeTexture, noiseFill, outlineRect, px, shade, type Ctx } from './pixel';

export const SHOP_PALETTE = {
  floorA: '#efe4c8',
  floorB: '#e2d3b0',
  grout: '#cfbf9b',
  wallTop: '#3d3550',
  wallTopHi: '#544a6c',
  wall: '#86c1b6',
  wallStripe: '#7ab4a9',
  wallShadow: '#5e958c',
  skirting: '#9b6a44',
  skirtingHi: '#bb8a5a',
  wood: '#8a5a36',
  woodHi: '#a8744a',
  woodLo: '#6a4228',
  metal: '#2c303a',
  metalHi: '#4a505e',
  glass: '#cfe8f0',
};

/** Per-floor colours: floor tiles, wall face and stripes. Everything else is shared. */
const THEMES: Record<FloorTheme, { floorA: string; floorB: string; grout: string; wall: string; wallStripe: string; skirting: string; skirtingHi: string; plank?: boolean }> = {
  shop: { floorA: SHOP_PALETTE.floorA, floorB: SHOP_PALETTE.floorB, grout: SHOP_PALETTE.grout, wall: SHOP_PALETTE.wall, wallStripe: SHOP_PALETTE.wallStripe, skirting: SHOP_PALETTE.skirting, skirtingHi: SHOP_PALETTE.skirtingHi },
  cool: { floorA: '#c9a878', floorB: '#bf9d6c', grout: '#a7845a', wall: '#a9c8d8', wallStripe: '#9cbccc', skirting: '#6e7d88', skirtingHi: '#8e9ea8', plank: true },
  marine: { floorA: '#2f4a66', floorB: '#2a4360', grout: '#203650', wall: '#1d4f7a', wallStripe: '#1a4770', skirting: '#18324c', skirtingHi: '#2a5a80' },
  basement: { floorA: '#9a9a94', floorB: '#93938c', grout: '#7c7c76', wall: '#7d8088', wallStripe: '#757880', skirting: '#4c4e54', skirtingHi: '#62656c' },
  reef: { floorA: '#2c5a62', floorB: '#28545c', grout: '#1e444c', wall: '#2a7a86', wallStripe: '#26707c', skirting: '#1a4048', skirtingHi: '#2a6070' },
};

function drawFloorTile(ctx: Ctx, ox: number, oy: number, variant: number, theme: FloorTheme = 'shop'): void {
  const T = THEMES[theme];
  const a = variant % 2 === 0 ? T.floorA : T.floorB;
  px(ctx, ox, oy, a, 16, 16);
  // subtle speckle
  noiseFill(ctx, ox + 1, oy + 1, 14, 14, [shade(a, -0.03), shade(a, 0.03)], 100 + variant, theme === 'basement' ? 0.18 : 0.08);
  if (T.plank) {
    // Floorboards: long planks with staggered joints.
    px(ctx, ox, oy + 7, T.grout, 16, 1);
    px(ctx, ox, oy + 15, T.grout, 16, 1);
    px(ctx, ox + (variant ? 5 : 11), oy, T.grout, 1, 7);
    px(ctx, ox + (variant ? 12 : 3), oy + 8, T.grout, 1, 7);
    return;
  }
  px(ctx, ox, oy + 15, T.grout, 16, 1);
  px(ctx, ox + 15, oy, T.grout, 1, 16);
  px(ctx, ox, oy, shade(a, 0.12), 15, 1);
}

/** Pre-renders the static floor/wall layer for a layout into one texture. */
export function floorTextureKey(layout: FloorLayout): string {
  return `floor-layer-${layout.id}`;
}

export function makeFloorTexture(scene: Phaser.Scene, layout: FloorLayout, key = floorTextureKey(layout)): void {
  const P = SHOP_PALETTE;
  const T = THEMES[layout.theme];
  makeTexture(scene, key, layout.width * TILE, layout.height * TILE, (ctx) => {
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const c = layout.tiles[y][x];
        const ox = x * TILE;
        const oy = y * TILE;
        if (c === '.' || c === 'M') {
          drawFloorTile(ctx, ox, oy, (x + y) % 2, layout.theme);
          if (c === 'M') {
            px(ctx, ox, oy + 2, '#8e3f33', 16, 12);
            px(ctx, ox, oy + 3, '#b0594a', 16, 1);
            px(ctx, ox, oy + 12, '#6e2f26', 16, 1);
            for (let i = 1; i < 16; i += 3) px(ctx, ox + i, oy + 6, '#a24e40', 1, 4);
          }
        } else if (c === 'D') {
          px(ctx, ox, oy, P.metal, 16, 16);
          px(ctx, ox + 2, oy + 1, '#a9d6e6', 12, 15);
          px(ctx, ox + 3, oy + 2, '#d8f0f8', 2, 8);
          px(ctx, ox + (x % 2 === 0 ? 13 : 2), oy + 8, '#e8c060', 1, 3);
        } else {
          // Wall: top band of the map is a two-tile-tall wall face; edges are dark tops.
          if (y <= 1 && x > 0 && x < layout.width - 1) {
            px(ctx, ox, oy, T.wall, 16, 16);
            for (let i = 0; i < 16; i += 4) px(ctx, ox + i, oy, T.wallStripe, 1, 16);
            if (y === 0) {
              px(ctx, ox, oy, P.wallTop, 16, 3);
              px(ctx, ox, oy + 3, P.wallTopHi, 16, 1);
            } else {
              px(ctx, ox, oy + 11, T.skirting, 16, 5);
              px(ctx, ox, oy + 11, T.skirtingHi, 16, 1);
              px(ctx, ox, oy + 15, shade(T.skirting, -0.3), 16, 1);
            }
          } else {
            px(ctx, ox, oy, P.wallTop, 16, 16);
            px(ctx, ox + 1, oy + 1, P.wallTopHi, 14, 1);
            if (y === layout.height - 1) px(ctx, ox, oy, shade(P.wallTop, 0.15), 16, 2);
          }
        }
      }
    }
    drawStoreDetail(ctx, layout);
    if (layout.theme === 'shop') {
      // Window above the shelves and a wall clock + fish plaque.
      drawWindow(ctx, 20 * TILE + 4, 4);
      drawPlaque(ctx, 24 * TILE - 2, 3);
    } else if (layout.theme === 'cool') {
      drawWindow(ctx, 2 * TILE - 6, 4);
      drawWindow(ctx, 26 * TILE + 2, 4);
    } else if (layout.theme === 'marine') {
      for (const x of [3, 9, 15, 21, 27]) drawPorthole(ctx, x * TILE - 8, 6);
    } else if (layout.theme === 'reef') {
      // A painted reef mural along the back wall: rock, branching and plate corals.
      for (const x of [2, 8, 15, 22, 27]) drawReefMural(ctx, x * TILE - 6, x);
    } else if (layout.theme === 'basement') {
      // Pipes along the wall and a caged lamp.
      px(ctx, 16, 6, '#5a5e66', layout.width * TILE - 32, 3);
      px(ctx, 16, 6, '#7a7e86', layout.width * TILE - 32, 1);
      px(ctx, 16, 13, '#6a4a3a', layout.width * TILE - 32, 2);
      px(ctx, 24 * TILE, 3, '#f0e0a0', 6, 5);
      outlineRect(ctx, 24 * TILE - 1, 2, 8, 7, '#3a3a40');
    }
  });
}

/**
 * Purposeful floor and wall detail, painted into the static floor layer only
 * (the walk grid comes from tiles and props, so paths and saves are unchanged):
 * queue markings at the till, a hatched staff-only edge behind the counter,
 * contact shadows under tank stands and furniture, drain grates by the tank
 * rows (fish rooms get wet) and a notice board on the back wall.
 */
function drawStoreDetail(ctx: Ctx, layout: FloorLayout): void {
  const T = THEMES[layout.theme];
  const floorAt = (x: number, y: number) => layout.tiles[y]?.[x] === '.';
  // Contact shadows under stands, counters and shelves.
  for (const p of layout.props) {
    if (p.kind === 'plant' || p.kind === 'stairs' || p.kind === 'sign') continue;
    const y = (p.y + p.h) * TILE;
    if (!floorAt(p.x, p.y + p.h)) continue;
    ctx.fillStyle = 'rgba(40, 28, 20, 0.16)';
    ctx.fillRect(p.x * TILE + 1, y, p.w * TILE - 2, 3);
    ctx.fillStyle = 'rgba(40, 28, 20, 0.08)';
    ctx.fillRect(p.x * TILE + 2, y + 3, p.w * TILE - 4, 2);
  }
  // Queue markings: footprints on each queue tile, a stop line on the first.
  layout.queue.forEach((q, i) => {
    if (!floorAt(q.x, q.y)) return;
    const ox = q.x * TILE;
    const oy = q.y * TILE;
    const c = i === 0 ? '#d8a62c' : '#c9b48a';
    px(ctx, ox + 4, oy + 5, c, 2, 4);
    px(ctx, ox + 4, oy + 10, c, 2, 2);
    px(ctx, ox + 10, oy + 4, c, 2, 4);
    px(ctx, ox + 10, oy + 9, c, 2, 2);
    if (i === 0) px(ctx, ox + 1, oy + 1, '#d8a62c', 14, 1);
  });
  // Staff-only edge: yellow and dark hatching along the border of the area.
  for (const a of layout.staffOnly) {
    for (let x = a.x; x < a.x + a.w; x++) {
      for (const y of [a.y, a.y + a.h - 1]) {
        if (!floorAt(x, y)) continue;
        const oy = y * TILE + (y === a.y ? 0 : 14);
        for (let i = 0; i < 16; i += 4) px(ctx, x * TILE + i, oy, (x * 4 + i) % 8 === 0 ? '#e0b030' : '#4a4038', 2, 2);
      }
    }
  }
  // Drain grates in front of tank rows (one per run of stands).
  const tanks = layout.props.filter((p) => p.kind === 'tank');
  const rows = new Map<number, number[]>();
  for (const t of tanks) rows.set(t.y + t.h, [...(rows.get(t.y + t.h) ?? []), t.x + t.w]);
  for (const [y, ends] of rows) {
    const x = Math.max(...ends);
    if (!floorAt(x, y)) continue;
    const ox = x * TILE + 4;
    const oy = y * TILE + 4;
    px(ctx, ox, oy, shade(T.grout, -0.35), 8, 8);
    for (let i = 1; i < 8; i += 2) px(ctx, ox + i, oy + 1, shade(T.grout, -0.6), 1, 6);
  }
  // Notice board on the back wall (opening hours and water-test notes).
  if (layout.theme !== 'basement') {
    const bx = 6 * TILE + 2;
    if (layout.tiles[1]?.[6] && layout.tiles[1][6] !== '.' && layout.tiles[1][7] !== '.') {
      px(ctx, bx, 5, '#6a4228', 22, 15);
      px(ctx, bx + 1, 6, '#b88a58', 20, 13);
      px(ctx, bx + 3, 8, '#f4f0e8', 6, 5);
      px(ctx, bx + 4, 9, '#8a8aa0', 4, 1);
      px(ctx, bx + 4, 11, '#8a8aa0', 3, 1);
      px(ctx, bx + 11, 7, '#ffe08a', 7, 6);
      px(ctx, bx + 12, 9, '#b07a30', 5, 1);
      px(ctx, bx + 12, 14, '#cfe8f0', 6, 4);
      px(ctx, bx + 6, 7, '#d04040', 1, 1);
      px(ctx, bx + 14, 6, '#4060c0', 1, 1);
    }
  }
}

function drawReefMural(ctx: Ctx, x: number, seed: number): void {
  const rng = new Rng(seed * 13 + 5);
  // Rock base.
  px(ctx, x, 20, '#3a5a62', 28, 4);
  px(ctx, x + 3, 17, '#44666e', 20, 4);
  px(ctx, x + 6, 15, '#4c7078', 12, 3);
  const corals = ['#f07a5a', '#f0c040', '#a060d0', '#5ad0a0', '#f0a0c0', '#60b0f0'];
  for (let i = 0; i < 4; i++) {
    const cx = x + 3 + rng.int(0, 22);
    const c = rng.pick(corals);
    const kind = rng.int(0, 2);
    if (kind === 0) {
      // Branching coral.
      px(ctx, cx, 9, c, 1, 8);
      px(ctx, cx - 2, 11, c, 1, 4);
      px(ctx, cx + 2, 10, c, 1, 5);
      px(ctx, cx - 2, 11, c, 3, 1);
      px(ctx, cx, 8, shade(c, 0.3), 1, 1);
    } else if (kind === 1) {
      // Plate.
      px(ctx, cx - 3, 14, c, 7, 2);
      px(ctx, cx - 2, 13, shade(c, 0.25), 5, 1);
    } else {
      // Soft polyps.
      for (let k = 0; k < 4; k++) px(ctx, cx - 2 + k, 14 - (k % 2), c, 1, 2);
    }
  }
  // A small fish.
  const fx = x + rng.int(4, 20);
  px(ctx, fx, 6, '#f08030', 4, 2);
  px(ctx, fx - 1, 6, '#ffffff', 1, 2);
}

function drawPorthole(ctx: Ctx, x: number, y: number): void {
  px(ctx, x + 3, y, '#8a9aa8', 10, 16);
  px(ctx, x, y + 3, '#8a9aa8', 16, 10);
  px(ctx, x + 1, y + 1, '#8a9aa8', 14, 14);
  px(ctx, x + 3, y + 2, '#2a7ab8', 10, 12);
  px(ctx, x + 2, y + 3, '#2a7ab8', 12, 10);
  px(ctx, x + 4, y + 4, '#5ab0e0', 3, 2);
  px(ctx, x + 9, y + 8, '#f08030', 3, 2);
}

function drawWindow(ctx: Ctx, x: number, y: number): void {
  px(ctx, x, y, '#f4f0e8', 26, 20);
  px(ctx, x + 2, y + 2, '#9fd4ec', 22, 16);
  px(ctx, x + 2, y + 12, '#bfe6c8', 22, 6);
  px(ctx, x + 12, y + 2, '#f4f0e8', 2, 16);
  px(ctx, x + 4, y + 4, '#e8f8ff', 3, 1);
  px(ctx, x + 15, y + 5, '#e8f8ff', 4, 1);
}

function drawPlaque(ctx: Ctx, x: number, y: number): void {
  px(ctx, x, y, '#6a4228', 44, 20);
  px(ctx, x + 1, y + 1, '#c8935a', 42, 18);
  px(ctx, x + 1, y + 1, '#dcaa70', 42, 1);
  // stylised fish
  const fx = x + 12;
  const fy = y + 6;
  px(ctx, fx, fy + 2, '#2e7d9a', 14, 5);
  px(ctx, fx + 2, fy + 1, '#2e7d9a', 10, 7);
  px(ctx, fx + 4, fy, '#2e7d9a', 6, 9);
  px(ctx, fx - 4, fy + 1, '#e07a3a', 4, 7);
  px(ctx, fx - 2, fy + 3, '#e07a3a', 2, 3);
  px(ctx, fx + 10, fy + 3, '#f4f0e8', 2, 2);
  px(ctx, fx + 11, fy + 3, '#1a1a22', 1, 1);
  for (let i = 0; i < 3; i++) px(ctx, x + 30 + i * 3, y + 8 - i * 2, '#e8f8ff', 2, 2);
}

export function propTextureKey(p: PropPlacement): string {
  return p.kind === 'stairs' ? `prop-stairs-${p.dir ?? 'up'}` : `prop-${p.kind}${p.style ? `-${p.style}` : ''}-${p.w}x${p.h}`;
}

/** Generates textures for every prop kind/size used by a layout. */
export function makePropTextures(scene: Phaser.Scene, layout: FloorLayout): void {
  const done = new Set<string>();
  for (const p of layout.props) {
    const key = propTextureKey(p);
    if (done.has(key)) continue;
    done.add(key);
    const w = p.w * TILE;
    const h = p.h * TILE;
    switch (p.kind) {
      case 'tank':
        makeTexture(scene, key, w, h + 2, (ctx) => drawTankProp(ctx, w, h, p.style));
        break;
      case 'fragrack':
        makeTexture(scene, key, w, h + 2, (ctx) => drawFragRack(ctx, w, h));
        break;
      case 'counter':
        makeTexture(scene, key, w, h + 10, (ctx) => drawCounter(ctx, w, h + 10));
        break;
      case 'shelf':
        makeTexture(scene, key, w, h, (ctx) => drawShelf(ctx, w, h, p.id.length));
        break;
      case 'desk':
        makeTexture(scene, key, w, h, (ctx) => drawDesk(ctx, w, h));
        break;
      case 'plant':
        makeTexture(scene, key, 16, 24, (ctx) => drawPlant(ctx));
        break;
      case 'bench':
        makeTexture(scene, key, w, h + 4, (ctx) => drawBench(ctx, w));
        break;
      case 'stairs':
        makeTexture(scene, key, w, h, (ctx) => drawStairs(ctx, w, h, p.dir ?? 'up'));
        break;
      case 'rack':
        makeTexture(scene, key, w, h, (ctx) => drawRack(ctx, w, h, p.id.length + p.x));
        break;
      case 'pallet':
        makeTexture(scene, key, w, h, (ctx) => drawPallet(ctx, w, h, p.x + p.y));
        break;
      default:
        makeTexture(scene, key, w, h, (ctx) => px(ctx, 0, 0, '#888', w, h));
    }
  }
}

/** Tank rect where the animated water is drawn (relative to prop texture). */
export function tankWaterRect(w: number): { x: number; y: number; w: number; h: number } {
  return { x: 2, y: 5, w: w - 4, h: 14 };
}

function drawTankProp(ctx: Ctx, w: number, h: number, style?: PropPlacement['style']): void {
  const P = SHOP_PALETTE;
  if (style === 'reef') {
    // Reef system: slim LED fixture hanging over an open-top tank, black cabinet.
    px(ctx, 0, 0, '#12161e', w, 4);
    for (let x = 2; x < w - 2; x += 3) px(ctx, x, 2, x % 2 ? '#7a8aff' : '#e8f4ff', 2, 1);
    px(ctx, 0, 4, '#1a1e26', w, 17);
    px(ctx, 1, 4, '#141820', w - 2, 16);
    px(ctx, 0, 20, '#14161c', w, h - 20 + 2);
    px(ctx, 1, 21, '#262a34', w - 2, h - 22);
    px(ctx, 1, 21, '#3a4050', w - 2, 1);
    px(ctx, 2, h - 4, '#2a6aa8', w - 4, 1);
    const doors = Math.max(1, Math.round(w / 16));
    const dw = (w - 2) / doors;
    for (let i = 0; i < doors; i++) {
      const dx = 1 + Math.round(i * dw);
      outlineRect(ctx, dx + 1, 23, Math.round(dw) - 2, h - 27, '#14161c');
      px(ctx, dx + Math.round(dw / 2) - 1, 26, '#9ab0c8', 2, 1);
    }
    px(ctx, w / 2 - 5, 21, '#d8e4f0', 10, 3);
    px(ctx, 0, h, '#0c0e12', w, 2);
    return;
  }
  if (style === 'nano') {
    // Nano tank on a white gloss cabinet.
    px(ctx, 0, 0, '#3a3f4a', w, 4);
    px(ctx, 1, 1, '#5a606e', w - 2, 1);
    px(ctx, 0, 4, P.metal, w, 17);
    px(ctx, 1, 4, '#1d2028', w - 2, 16);
    px(ctx, 0, 20, '#b8b4ac', w, h - 20 + 2);
    px(ctx, 1, 21, '#ece8e0', w - 2, h - 22);
    px(ctx, 1, 21, '#ffffff', w - 2, 1);
    outlineRect(ctx, 3, 23, w - 6, h - 26, '#c8c4bc');
    px(ctx, w / 2 - 1, 26, '#9a968e', 2, 1);
    px(ctx, w / 2 - 5, 21, '#2a2e38', 10, 2);
    px(ctx, 0, h, shade('#b8b4ac', -0.3), w, 2);
    return;
  }
  // Hood / light.
  px(ctx, 0, 0, P.metal, w, 4);
  px(ctx, 1, 1, P.metalHi, w - 2, 1);
  // Glass frame (water drawn dynamically inside).
  px(ctx, 0, 4, P.metal, w, 17);
  px(ctx, 1, 4, '#1d2028', w - 2, 16);
  // Stand.
  px(ctx, 0, 20, P.woodLo, w, h - 20 + 2);
  px(ctx, 1, 21, P.wood, w - 2, h - 22);
  px(ctx, 1, 21, P.woodHi, w - 2, 1);
  const doors = Math.max(1, Math.round(w / 16));
  const dw = (w - 2) / doors;
  for (let i = 0; i < doors; i++) {
    const dx = 1 + Math.round(i * dw);
    outlineRect(ctx, dx + 1, 23, Math.round(dw) - 2, h - 26, P.woodLo);
    px(ctx, dx + Math.round(dw / 2) - 1, 26, '#e8c060', 2, 1);
  }
  // Label plate.
  px(ctx, w / 2 - 5, 21, '#f2eee0', 10, 3);
  px(ctx, 0, h, shade(P.woodLo, -0.3), w, 2);
}

/** Frag rack: a shallow, blue-lit frag tank with rows of plugged frags. */
function drawFragRack(ctx: Ctx, w: number, h: number): void {
  const rng = new Rng(77);
  px(ctx, 0, 0, '#12161e', w, 3);
  for (let x = 2; x < w - 2; x += 3) px(ctx, x, 1, x % 2 ? '#7a8aff' : '#e8f4ff', 2, 1);
  // Shallow glass tray.
  px(ctx, 0, 6, '#1a1e26', w, 12);
  px(ctx, 1, 7, '#2a6aa8', w - 2, 10);
  px(ctx, 1, 7, '#4a90c8', w - 2, 2);
  const corals = ['#f07a5a', '#f0c040', '#a060d0', '#5ad0a0', '#ff6a8a', '#60b0f0', '#9affd0'];
  for (let row = 0; row < 2; row++) {
    for (let x = 3; x < w - 3; x += 4) {
      const y = 10 + row * 4;
      px(ctx, x, y + 1, '#c8c8c0', 3, 1);
      const c = rng.pick(corals);
      px(ctx, x, y - 1, c, 3, 2);
      px(ctx, x + 1, y - 2, shade(c, 0.3), 1, 1);
    }
  }
  px(ctx, 1, 16, '#c8c0a8', w - 2, 1);
  // Black stand with a price board.
  px(ctx, 0, 18, '#14161c', w, h - 18 + 2);
  px(ctx, 1, 19, '#262a34', w - 2, h - 20);
  px(ctx, w / 2 - 9, 21, '#f4f0e8', 18, 7);
  px(ctx, w / 2 - 7, 23, '#2a6aa8', 10, 1);
  px(ctx, w / 2 - 7, 25, '#c05a3a', 7, 1);
  px(ctx, 0, h, '#0c0e12', w, 2);
}

function drawCounter(ctx: Ctx, w: number, h: number): void {
  const P = SHOP_PALETTE;
  px(ctx, 0, 0, P.woodLo, w, h);
  px(ctx, 1, 1, P.woodHi, w - 2, 9);
  px(ctx, 1, 1, shade(P.woodHi, 0.2), w - 2, 1);
  px(ctx, 1, 10, P.wood, w - 2, h - 11);
  for (let x = 8; x < w; x += 16) px(ctx, x, 12, P.woodLo, 1, h - 14);
  // Till.
  const tx = 30;
  px(ctx, tx, 0, '#3a3f4a', 16, 8);
  px(ctx, tx + 1, 1, '#9ff0c8', 9, 4);
  px(ctx, tx + 11, 1, '#e8e8e8', 4, 6);
  px(ctx, tx + 1, 6, '#5a606e', 9, 1);
  // Bag of fish food display + card reader.
  px(ctx, 6, 2, '#e05a3a', 6, 7);
  px(ctx, 7, 3, '#ffd070', 4, 2);
  px(ctx, 60, 3, '#2a2a30', 6, 5);
  px(ctx, 61, 4, '#5ad0ff', 4, 1);
}

function drawShelf(ctx: Ctx, w: number, h: number, seed: number): void {
  const P = SHOP_PALETTE;
  const rng = new Rng(seed * 31 + 7);
  px(ctx, 0, 0, P.woodLo, w, h);
  px(ctx, 1, 1, '#5a3a24', w - 2, h - 2);
  const colours = ['#e05a3a', '#3a9ad0', '#f0c040', '#5ab04a', '#c060c0', '#f2f2ee', '#40c0b0'];
  for (let row = 0; row < 3; row++) {
    const sy = 3 + row * 9;
    px(ctx, 1, sy + 7, P.woodHi, w - 2, 2);
    let x = 2;
    while (x < w - 4) {
      const bw = rng.int(2, 4);
      const bh = rng.int(4, 7);
      const c = rng.pick(colours);
      px(ctx, x, sy + 7 - bh, c, bw, bh);
      px(ctx, x, sy + 7 - bh, shade(c, 0.3), bw, 1);
      x += bw + 1;
    }
  }
}

function drawDesk(ctx: Ctx, w: number, h: number): void {
  const P = SHOP_PALETTE;
  px(ctx, 0, 12, P.woodLo, w, h - 12);
  px(ctx, 1, 13, P.woodHi, w - 2, 6);
  px(ctx, 1, 19, P.wood, w - 2, h - 20);
  outlineRect(ctx, 3, 21, 10, 9, P.woodLo);
  // Monitor.
  px(ctx, 8, 0, '#2a2e38', 18, 13);
  px(ctx, 9, 1, '#5ad8e8', 16, 10);
  px(ctx, 10, 2, '#9ff0ff', 6, 1);
  px(ctx, 10, 5, '#e0f8ff', 10, 1);
  px(ctx, 10, 7, '#e0f8ff', 7, 1);
  px(ctx, 15, 13, '#2a2e38', 4, 2);
  px(ctx, 8, 15, '#d8d8d0', 14, 3);
  px(ctx, 24, 14, '#f2f2ee', 4, 4);
}

function drawPlant(ctx: Ctx): void {
  px(ctx, 4, 16, '#a0522d', 8, 8);
  px(ctx, 3, 16, '#c0703d', 10, 2);
  px(ctx, 5, 22, '#7a3a1d', 6, 2);
  const leaf = ['#3a8a3a', '#4aa64a', '#2a6a30', '#5cc05a'];
  const pts = [[7, 2], [4, 5], [10, 4], [2, 9], [12, 8], [6, 9], [9, 11], [3, 13], [11, 13], [7, 6]];
  pts.forEach(([x, y], i) => {
    px(ctx, x, y, leaf[i % leaf.length], 3, 4);
    px(ctx, x + 1, y - 1, leaf[(i + 1) % leaf.length], 1, 2);
  });
  px(ctx, 7, 10, '#2a5a20', 2, 6);
}

function drawBench(ctx: Ctx, w: number): void {
  const P = SHOP_PALETTE;
  px(ctx, 0, 4, P.woodLo, w, 8);
  px(ctx, 1, 5, P.woodHi, w - 2, 3);
  px(ctx, 1, 8, P.wood, w - 2, 3);
  px(ctx, 3, 12, P.woodLo, 2, 6);
  px(ctx, w - 5, 12, P.woodLo, 2, 6);
}

function drawStairs(ctx: Ctx, w: number, h: number, dir: 'up' | 'down'): void {
  const P = SHOP_PALETTE;
  const steps = 7;
  if (dir === 'up') {
    // A flight rising away from the viewer: treads get narrower and lighter toward the top.
    px(ctx, 0, 0, '#2a2432', w, h);
    for (let i = 0; i < steps; i++) {
      const y = Math.round((i * h) / steps);
      const sh = Math.ceil(h / steps);
      const inset = Math.round((steps - 1 - i) * 0) + Math.round((1 - i / steps) * 3);
      const tread = shade(P.woodHi, 0.12 - (steps - 1 - i) * 0.05);
      px(ctx, 2 + inset, y, tread, w - 4 - inset * 2, sh - 2);
      px(ctx, 2 + inset, y + sh - 2, shade(P.woodLo, -0.1), w - 4 - inset * 2, 2);
      px(ctx, 2 + inset, y, shade(tread, 0.2), w - 4 - inset * 2, 1);
    }
    // Banisters.
    px(ctx, 0, 0, P.metal, 2, h);
    px(ctx, w - 2, 0, P.metal, 2, h);
    px(ctx, 0, 0, P.metalHi, 1, h);
    px(ctx, w - 2, 0, P.metalHi, 1, h);
  } else {
    // A stairwell opening in the floor: steps descend into darkness.
    px(ctx, 0, 0, '#3a3236', w, h);
    for (let i = 0; i < steps; i++) {
      const y = Math.round((i * h) / steps);
      const sh = Math.ceil(h / steps);
      const tread = shade(P.wood, -0.12 - i * 0.1);
      px(ctx, 2, y, tread, w - 4, sh - 2);
      px(ctx, 2, y, shade(tread, 0.15), w - 4, 1);
      px(ctx, 2, y + sh - 2, shade(tread, -0.35), w - 4, 2);
    }
    // Rail around the opening.
    px(ctx, 0, 0, P.metalHi, w, 2);
    px(ctx, 0, 0, P.metal, 2, h);
    px(ctx, w - 2, 0, P.metal, 2, h);
  }
  // Small direction arrow on the top step.
  const ax = Math.round(w / 2) - 2;
  const c = dir === 'up' ? '#f2eee0' : '#e8c060';
  if (dir === 'up') {
    px(ctx, ax + 1, 2, c, 2, 4);
    px(ctx, ax, 3, c, 4, 1);
  } else {
    px(ctx, ax + 1, 2, c, 2, 4);
    px(ctx, ax, 5, c, 4, 1);
  }
}

function drawRack(ctx: Ctx, w: number, h: number, seed: number): void {
  const rng = new Rng(seed * 17 + 3);
  px(ctx, 0, 0, '#3a3e48', w, h);
  px(ctx, 1, 1, '#2a2d36', w - 2, h - 2);
  const boxes = ['#2e7d9a', '#d8d8d0', '#3a6a9a', '#e0a040', '#5a9a5a', '#c05a3a', '#9aa0aa'];
  for (let row = 0; row < 3; row++) {
    const sy = 2 + row * 10;
    px(ctx, 1, sy + 8, '#7a808c', w - 2, 2);
    let x = 2;
    while (x < w - 5) {
      const bw = rng.int(4, 8);
      const bh = rng.int(5, 8);
      const c = rng.pick(boxes);
      px(ctx, x, sy + 8 - bh, c, bw, bh);
      px(ctx, x, sy + 8 - bh, shade(c, 0.25), bw, 1);
      if (bw > 5) px(ctx, x + 1, sy + 8 - bh + 2, shade(c, 0.4), bw - 2, 1);
      x += bw + 1;
    }
  }
}

function drawPallet(ctx: Ctx, w: number, h: number, seed: number): void {
  const rng = new Rng(seed * 13 + 1);
  px(ctx, 0, h - 4, '#8a6a42', w, 4);
  for (let x = 1; x < w; x += 6) px(ctx, x, h - 3, '#5a4228', 3, 3);
  let y = h - 4;
  while (y > 4) {
    const bh = rng.int(5, 8);
    const c = rng.pick(['#c8a070', '#b89060', '#d0b080']);
    px(ctx, 1, y - bh, c, w - 2, bh);
    px(ctx, 1, y - bh, shade(c, 0.2), w - 2, 1);
    px(ctx, w / 2 - 1, y - bh, '#e8e0c8', 2, bh);
    y -= bh + 1;
  }
}
