/**
 * Floor 1 layout. Tiles are 16px. Static props and tank placements are data so
 * future floors can be added without changing scene code.
 */

export const TILE = 16;

export type PropKind = 'tank' | 'counter' | 'shelf' | 'desk' | 'plant' | 'bench' | 'sign';

export interface PropPlacement {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tile the player/customer stands on to interact (in front of the prop). */
  interact?: Array<{ x: number; y: number }>;
}

export interface FloorLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  /** '#' wall, '.' floor, 'D' door, 'M' doormat (floor) */
  tiles: string[];
  props: PropPlacement[];
  playerStart: { x: number; y: number };
  door: { x: number; y: number };
  /** Tile customers stand on to be served. Queue extends along `queue`. */
  queue: Array<{ x: number; y: number }>;
  /** Tile the player must stand on to serve at the till. */
  till: { x: number; y: number };
  /** Areas customers may not enter (behind the counter). */
  staffOnly: Array<{ x: number; y: number; w: number; h: number }>;
}

const W = 30;
const H = 20;

function buildTiles(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      if (y <= 1 || x === 0 || x === W - 1) r += '#';
      else if (y === H - 1) r += x === 14 || x === 15 ? 'D' : '#';
      else if (y === H - 2 && (x === 14 || x === 15)) r += 'M';
      else r += '.';
    }
    rows.push(r);
  }
  return rows;
}

const tankFront = (x: number, y: number, w: number, h: number) =>
  Array.from({ length: w }, (_, i) => ({ x: x + i, y: y + h }));

const tank = (id: string, x: number, y: number, w: number, h = 2): PropPlacement => ({
  id, kind: 'tank', x, y, w, h, interact: tankFront(x, y, w, h),
});

export const FLOOR1: FloorLayout = {
  id: 'floor1',
  name: 'Ground Floor',
  width: W,
  height: H,
  tiles: buildTiles(),
  props: [
    tank('A1', 2, 2, 2), tank('A2', 5, 2, 2), tank('A3', 8, 2, 2),
    tank('A4', 11, 2, 2), tank('A5', 14, 2, 2), tank('A6', 17, 2, 2),
    tank('B1', 3, 8, 3), tank('B2', 8, 8, 3),
    tank('C1', 13, 8, 2), tank('C2', 16, 8, 2),
    { id: 'shelf1', kind: 'shelf', x: 21, y: 2, w: 2, h: 2, interact: tankFront(21, 2, 2, 2) },
    { id: 'shelf2', kind: 'shelf', x: 24, y: 2, w: 2, h: 2, interact: tankFront(24, 2, 2, 2) },
    { id: 'desk', kind: 'desk', x: 27, y: 2, w: 2, h: 2, interact: tankFront(27, 2, 2, 2) },
    { id: 'counter', kind: 'counter', x: 22, y: 11, w: 6, h: 1 },
    { id: 'plant1', kind: 'plant', x: 1, y: 17, w: 1, h: 1 },
    { id: 'plant2', kind: 'plant', x: 28, y: 17, w: 1, h: 1 },
    { id: 'plant3', kind: 'plant', x: 20, y: 8, w: 1, h: 1 },
    { id: 'plant4', kind: 'plant', x: 1, y: 2, w: 1, h: 1 },
    { id: 'bench1', kind: 'bench', x: 3, y: 15, w: 3, h: 1 },
    { id: 'bench2', kind: 'bench', x: 8, y: 15, w: 3, h: 1 },
  ],
  playerStart: { x: 15, y: 15 },
  door: { x: 14, y: 18 },
  queue: [
    { x: 24, y: 12 }, { x: 24, y: 13 }, { x: 24, y: 14 }, { x: 23, y: 14 }, { x: 22, y: 14 }, { x: 21, y: 14 },
  ],
  till: { x: 24, y: 10 },
  staffOnly: [{ x: 22, y: 10, w: 6, h: 1 }],
};

/** Builds a walkability grid (true = walkable) from tiles + props. */
export function buildWalkGrid(layout: FloorLayout): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < layout.height; y++) {
    grid.push([]);
    for (let x = 0; x < layout.width; x++) {
      const c = layout.tiles[y][x];
      grid[y].push(c === '.' || c === 'M' || c === 'D');
    }
  }
  for (const p of layout.props) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) grid[y][x] = false;
  }
  return grid;
}

/** Walk grid for customers: like buildWalkGrid but excluding staff-only areas. */
export function buildCustomerGrid(layout: FloorLayout): boolean[][] {
  const grid = buildWalkGrid(layout);
  for (const r of layout.staffOnly) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = false;
  }
  return grid;
}

export function propAt(layout: FloorLayout, x: number, y: number): PropPlacement | undefined {
  return layout.props.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
}
