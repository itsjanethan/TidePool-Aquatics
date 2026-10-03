/**
 * Tap to move: shortest grid path for the player (4-way, the same walk grid
 * as keyboard movement, so collisions and stairs behave identically).
 */
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Tile {
  x: number;
  y: number;
}

const STEPS: Array<[Dir, number, number]> = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

export function dirBetween(a: Tile, b: Tile): Dir {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  return b.y > a.y ? 'down' : 'up';
}

/** Facing from a stand tile toward the nearest tile of a w x h prop at (px, py). */
export function faceToward(stand: Tile, px: number, py: number, pw: number, ph: number): Dir {
  const tx = Math.min(px + pw - 1, Math.max(px, stand.x));
  const ty = Math.min(py + ph - 1, Math.max(py, stand.y));
  return dirBetween(stand, { x: tx, y: ty });
}

/**
 * Path from `from` to `to` (excluding `from`). If `to` is not walkable (a
 * tank, the counter, a wall) the path ends on the nearest walkable tile next
 * to it, or on one of the `approach` tiles when given (a prop's interaction
 * spots), and `face` says which way to turn to face it. Null when unreachable.
 */
export function planTapPath(
  grid: boolean[][],
  from: Tile,
  to: Tile,
  approach?: Array<Tile & { face: Dir }>,
  maxNodes = 4000,
): { path: Tile[]; face: Dir | null } | null {
  const hgt = grid.length;
  const w = grid[0]?.length ?? 0;
  if (to.x < 0 || to.y < 0 || to.x >= w || to.y >= hgt) return null;
  const goals = new Map<number, Dir | null>();
  // Props say where to stand (their interaction tiles); use those first.
  for (const a of approach ?? []) if (grid[a.y]?.[a.x]) goals.set(a.y * w + a.x, a.face);
  if (!goals.size && grid[to.y][to.x]) goals.set(to.y * w + to.x, null);
  else if (!goals.size) {
    for (const [, dx, dy] of STEPS) {
      const nx = to.x + dx;
      const ny = to.y + dy;
      if (grid[ny]?.[nx]) goals.set(ny * w + nx, dirBetween({ x: nx, y: ny }, to));
    }
  }
  if (!goals.size) return null;
  const start = from.y * w + from.x;
  if (goals.has(start)) return { path: [], face: goals.get(start) ?? null };
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let qi = 0; qi < queue.length && qi < maxNodes; qi++) {
    const cur = queue[qi];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [, dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid[ny]?.[nx]) continue;
      const id = ny * w + nx;
      if (prev.has(id)) continue;
      prev.set(id, cur);
      if (goals.has(id)) {
        const path: Tile[] = [];
        for (let n = id; n !== start; n = prev.get(n)!) path.push({ x: n % w, y: Math.floor(n / w) });
        return { path: path.reverse(), face: goals.get(id) ?? null };
      }
      queue.push(id);
    }
  }
  return null;
}
