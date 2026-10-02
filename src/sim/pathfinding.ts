/** Grid BFS pathfinding for customers (4-directional). */
export interface Pt {
  x: number;
  y: number;
}

export function findPath(grid: boolean[][], from: Pt, to: Pt): Pt[] | null {
  const h = grid.length;
  const w = grid[0].length;
  const sx = Math.round(from.x);
  const sy = Math.round(from.y);
  const tx = Math.round(to.x);
  const ty = Math.round(to.y);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !grid[ty][tx]) return null;
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(w * h).fill(-1);
  const start = sy * w + sx;
  const goal = ty * w + tx;
  prev[start] = start;
  const queue = [start];
  let qi = 0;
  const dirs = [1, 0, -1, 0, 0, 1, 0, -1];
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (let d = 0; d < 8; d += 2) {
      const nx = cx + dirs[d];
      const ny = cy + dirs[d + 1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !grid[ny][nx]) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const path: Pt[] = [];
  let c = goal;
  while (c !== start) {
    path.push({ x: c % w, y: Math.floor(c / w) });
    c = prev[c];
  }
  return path.reverse();
}
