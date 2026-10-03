/**
 * Shared movement for anything that walks the shop (customers, staff): paths
 * on the current floor's grid, and multi-floor trips via stairs. Pure state
 * changes; rendering just reads x, y, floor and facing.
 */
import { floorRoute, GROUND_FLOOR_ID, stairsArrival } from '../data/floors';
import { findPath, type Pt } from './pathfinding';
import type { GameState } from './types';

export interface Walker {
  floor?: string;
  x: number;
  y: number;
  path: Pt[];
  pending?: { floor: string; x: number; y: number } | null;
  facing: 'up' | 'down' | 'left' | 'right';
  walkPhase: number;
}

export type GridLookup = (floor: string) => boolean[][];

export function floorOfWalker(w: { floor?: string }): string {
  return w.floor ?? GROUND_FLOOR_ID;
}

/** Path on the walker's current floor. */
export function pathTo(grids: GridLookup, w: Walker, to: Pt): boolean {
  const p = findPath(grids(floorOfWalker(w)), { x: Math.round(w.x), y: Math.round(w.y) }, to);
  if (!p) return false;
  w.path = p;
  return true;
}

/** Walks to a tile on any unlocked floor, via stairs. The last leg waits in `pending`. */
export function walkTo(state: GameState, grids: GridLookup, w: Walker, floor: string, to: Pt): boolean {
  const cur = floorOfWalker(w);
  if (cur === floor) {
    w.pending = null;
    return pathTo(grids, w, to);
  }
  const route = floorRoute(cur, floor, state.unlocks.floors);
  if (!route.length) return false;
  for (const t of route[0].stairs.interact ?? []) {
    if (pathTo(grids, w, t)) {
      w.pending = { floor, x: to.x, y: to.y };
      return true;
    }
  }
  return false;
}

/** Called when a walker with `pending` reaches the stairs: change floor and carry on. */
export function hopStairs(state: GameState, grids: GridLookup, w: Walker): void {
  const target = w.pending!;
  const cur = floorOfWalker(w);
  const route = floorRoute(cur, target.floor, state.unlocks.floors);
  if (!route.length) {
    w.pending = null;
    return;
  }
  const arr = stairsArrival(cur, route[0].stairs);
  w.floor = arr.floor;
  w.x = arr.x;
  w.y = arr.y;
  w.facing = arr.facing;
  walkTo(state, grids, w, target.floor, target);
}

/** Moves along the path by `tiles`. Returns true while still walking. */
export function stepPath(w: Walker, tiles: number, dtMin: number): boolean {
  if (!w.path.length) return false;
  let move = tiles;
  w.walkPhase += dtMin;
  while (move > 0 && w.path.length) {
    const n = w.path[0];
    const dx = n.x - w.x;
    const dy = n.y - w.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) w.facing = dx > 0 ? 'right' : 'left';
    else if (d > 0.001) w.facing = dy > 0 ? 'down' : 'up';
    if (d <= move) {
      w.x = n.x;
      w.y = n.y;
      w.path.shift();
      move -= d;
    } else {
      w.x += (dx / d) * move;
      w.y += (dy / d) * move;
      move = 0;
    }
  }
  return true;
}

/** Faces a point. */
export function faceToward(w: Walker, x: number, y: number): void {
  const dx = x - w.x;
  const dy = y - w.y;
  w.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
