/**
 * Floor layout types and helpers. Tiles are 16px. Static props and tank
 * placements are data; the floors themselves live in data/floors.ts.
 */

export const TILE = 16;

export type PropKind = 'tank' | 'counter' | 'shelf' | 'desk' | 'plant' | 'bench' | 'sign' | 'stairs' | 'rack' | 'pallet' | 'fragrack';

export interface PropPlacement {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tile the player/customer stands on to interact (in front of the prop). */
  interact?: Array<{ x: number; y: number }>;
  /** Stairs: the floor they lead to. */
  to?: string;
  /** Stairs: 'up' or 'down' (art only). */
  dir?: 'up' | 'down';
  /** Tanks: cabinet art (reef systems have a lit reef hood; nano tanks a low stand). */
  style?: 'reef' | 'nano' | 'terrarium' | 'paludarium';
}

export type FloorTheme = 'shop' | 'cool' | 'marine' | 'basement' | 'reef' | 'vivarium';

export interface FloorLayout {
  id: string;
  name: string;
  theme: FloorTheme;
  width: number;
  height: number;
  /** '#' wall, '.' floor, 'D' door, 'M' doormat (floor) */
  tiles: string[];
  props: PropPlacement[];
  playerStart: { x: number; y: number };
  /** Street door (ground floor only). */
  door?: { x: number; y: number };
  /** Tile customers stand on to be served. Queue extends along `queue` (floors with a till). */
  queue: Array<{ x: number; y: number }>;
  /** Tile the player must stand on to serve at the till (floors with a till). */
  till?: { x: number; y: number };
  /** Areas customers may not enter (behind the counter). */
  staffOnly: Array<{ x: number; y: number; w: number; h: number }>;
}

/** Builds a walkability grid (true = walkable) from tiles + props. */
export function buildWalkGrid(layout: FloorLayout): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < layout.height; y++) {
    grid.push([]);
    for (let x = 0; x < layout.width; x++) {
      const c = layout.tiles[y][x];
      grid[y].push(c === '.' || c === 'M' || c === 'D' || c === ',');
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

/** Stairs props on a layout. */
export function stairsOf(layout: FloorLayout): PropPlacement[] {
  return layout.props.filter((p) => p.kind === 'stairs' && p.to);
}
