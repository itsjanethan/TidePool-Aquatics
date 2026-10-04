/**
 * Floor registry. Every floor is data: tiles, props (tanks, stairs, shelves),
 * a theme for the art, and the expansion that unlocks it. Scenes, customers
 * and staff look floors up here by id; nothing refers to a floor constant.
 */
import type { FloorLayout, PropPlacement } from './shopLayout';
import { stairsOf } from './shopLayout';

export type FloorId = 'ground' | 'upstairs' | 'marine' | 'basement' | 'reef' | 'vivarium';

export const GROUND_FLOOR_ID: FloorId = 'ground';

const W = 30;
const H = 20;

/** Walls round the edge (two-tile wall face at the top). Optional street door. */
function buildTiles(door: boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      if (y <= 1 || x === 0 || x === W - 1) r += '#';
      else if (y === H - 1) r += door && (x === 14 || x === 15) ? 'D' : '#';
      else if (door && y === H - 2 && (x === 14 || x === 15)) r += 'M';
      else r += '.';
    }
    rows.push(r);
  }
  return rows;
}

const front = (x: number, y: number, w: number, h: number) => Array.from({ length: w }, (_, i) => ({ x: x + i, y: y + h }));

const tank = (id: string, x: number, y: number, w: number, h = 2, style?: PropPlacement['style']): PropPlacement => ({ id, kind: 'tank', x, y, w, h, interact: front(x, y, w, h), ...(style ? { style } : {}) });

/** Stairs block against the left wall; used from its right-hand side. */
const stairs = (id: string, y: number, to: FloorId, dir: 'up' | 'down'): PropPlacement => ({
  id, kind: 'stairs', x: 1, y, w: 2, h: 2, to, dir, interact: [{ x: 3, y }, { x: 3, y: y + 1 }],
});

const deco = (id: string, kind: PropPlacement['kind'], x: number, y: number, w = 1, h = 1): PropPlacement => ({ id, kind, x, y, w, h });

export const GROUND: FloorLayout = {
  id: 'ground',
  name: 'Ground Floor',
  theme: 'shop',
  width: W,
  height: H,
  tiles: buildTiles(true),
  props: [
    tank('A1', 2, 2, 2), tank('A2', 5, 2, 2), tank('A3', 8, 2, 2),
    tank('A4', 11, 2, 2), tank('A5', 14, 2, 2), tank('A6', 17, 2, 2),
    tank('B1', 3, 8, 3), tank('B2', 8, 8, 3),
    tank('C1', 13, 8, 2), tank('C2', 16, 8, 2),
    { id: 'shelf1', kind: 'shelf', x: 21, y: 2, w: 2, h: 2, interact: front(21, 2, 2, 2) },
    { id: 'shelf2', kind: 'shelf', x: 24, y: 2, w: 2, h: 2, interact: front(24, 2, 2, 2) },
    { id: 'desk', kind: 'desk', x: 27, y: 2, w: 2, h: 2, interact: front(27, 2, 2, 2) },
    { id: 'counter', kind: 'counter', x: 22, y: 11, w: 6, h: 1 },
    stairs('stairs_up', 12, 'upstairs', 'up'),
    stairs('stairs_down', 5, 'basement', 'down'),
    deco('plant1', 'plant', 1, 17), deco('plant2', 'plant', 28, 17), deco('plant3', 'plant', 20, 8), deco('plant4', 'plant', 1, 2),
    deco('bench1', 'bench', 3, 15, 3), deco('bench2', 'bench', 8, 15, 3),
  ],
  playerStart: { x: 15, y: 15 },
  door: { x: 14, y: 18 },
  queue: [{ x: 24, y: 12 }, { x: 24, y: 13 }, { x: 24, y: 14 }, { x: 23, y: 14 }, { x: 22, y: 14 }, { x: 21, y: 14 }],
  till: { x: 24, y: 10 },
  staffOnly: [{ x: 22, y: 10, w: 6, h: 1 }],
};

/** Level 2: Coldwater & Temperate. Bigger unheated tanks for hardy species. */
export const UPSTAIRS: FloorLayout = {
  id: 'upstairs',
  name: 'Coldwater & Temperate',
  theme: 'cool',
  width: W,
  height: H,
  tiles: buildTiles(false),
  props: [
    tank('U1', 4, 2, 4), tank('U2', 10, 2, 4), tank('U3', 16, 2, 4), tank('U4', 22, 2, 4),
    tank('U5', 6, 9, 5), tank('U6', 15, 9, 5),
    stairs('stairs_down', 12, 'ground', 'down'),
    stairs('stairs_up', 5, 'marine', 'up'),
    deco('ubench', 'bench', 11, 15, 4), deco('uplant1', 'plant', 28, 2), deco('uplant2', 'plant', 28, 17), deco('uplant3', 'plant', 22, 10),
  ],
  playerStart: { x: 4, y: 13 },
  queue: [],
  staffOnly: [],
};

/** Level 3: Advanced Aquatics & Marine. */
export const MARINE: FloorLayout = {
  id: 'marine',
  name: 'Advanced Aquatics & Marine',
  theme: 'marine',
  width: W,
  height: H,
  tiles: buildTiles(false),
  props: [
    tank('M1', 5, 2, 4), tank('M2', 11, 2, 4), tank('M3', 17, 2, 4),
    tank('M4', 6, 9, 3), tank('M5', 12, 9, 3), tank('M6', 18, 9, 4),
    stairs('stairs_down', 5, 'upstairs', 'down'),
    stairs('stairs_up', 12, 'reef', 'up'),
    deco('mrack', 'rack', 25, 2, 3, 2),
    deco('mplant1', 'plant', 28, 17), deco('mbench', 'bench', 10, 15, 4),
  ],
  playerStart: { x: 4, y: 6 },
  queue: [],
  staffOnly: [],
};

/** Level 4: Basement warehouse and equipment retail. */
export const BASEMENT: FloorLayout = {
  id: 'basement',
  name: 'Basement: Warehouse & Retail',
  theme: 'basement',
  width: W,
  height: H,
  tiles: buildTiles(false),
  props: [
    stairs('stairs_up', 5, 'ground', 'up'),
    { id: 'retail1', kind: 'rack', x: 6, y: 2, w: 4, h: 2, interact: front(6, 2, 4, 2) },
    { id: 'retail2', kind: 'rack', x: 12, y: 2, w: 4, h: 2, interact: front(12, 2, 4, 2) },
    { id: 'retail3', kind: 'rack', x: 18, y: 2, w: 4, h: 2, interact: front(18, 2, 4, 2) },
    tank('Q1', 6, 9, 3), tank('Q2', 11, 9, 3),
    deco('pallet1', 'pallet', 22, 12, 3, 2), deco('pallet2', 'pallet', 25, 15, 3, 2), deco('pallet3', 'pallet', 22, 16, 2, 2),
  ],
  playerStart: { x: 4, y: 6 },
  queue: [],
  staffOnly: [{ x: 20, y: 11, w: 9, h: 8 }],
};

/** Level 5: Reef & Invertebrates. Coral reef systems, a frag rack and nano tanks for shrimp and snails. */
export const REEF: FloorLayout = {
  id: 'reef',
  name: 'Reef & Invertebrates',
  theme: 'reef',
  width: W,
  height: H,
  tiles: buildTiles(false),
  props: [
    tank('R1', 5, 2, 4, 2, 'reef'), tank('R2', 11, 2, 5, 2, 'reef'), tank('R3', 18, 2, 3, 2, 'reef'),
    tank('F1', 6, 9, 2, 2, 'nano'), tank('F2', 10, 9, 2, 2, 'nano'), tank('F3', 14, 9, 3, 2, 'nano'),
    { id: 'fragrack', kind: 'fragrack', x: 22, y: 9, w: 4, h: 2, interact: front(22, 9, 4, 2) },
    stairs('stairs_down', 12, 'marine', 'down'),
    stairs('stairs_up', 5, 'vivarium', 'up'),
    deco('rplant1', 'plant', 28, 2), deco('rplant2', 'plant', 28, 17), deco('rbench', 'bench', 10, 15, 4),
  ],
  playerStart: { x: 4, y: 13 },
  queue: [],
  staffOnly: [],
};

/** Level 6: Vivariums, terrariums and paludariums. */
export const VIVARIUM: FloorLayout = {
  id: 'vivarium',
  name: 'Vivariums & Terrariums',
  theme: 'vivarium',
  width: W,
  height: H,
  tiles: buildTiles(false),
  props: [
    tank('V1', 5, 2, 3, 2, 'terrarium'), tank('V2', 10, 2, 3, 2, 'terrarium'), tank('V3', 15, 2, 3, 2, 'terrarium'), tank('T1', 20, 2, 4, 2, 'terrarium'),
    tank('T2', 6, 9, 2, 2, 'terrarium'), tank('P1', 11, 9, 5, 2, 'paludarium'), tank('P2', 19, 9, 4, 2, 'paludarium'),
    stairs('stairs_down', 5, 'reef', 'down'),
    deco('vplant1', 'plant', 28, 2), deco('vplant2', 'plant', 28, 17), deco('vplant3', 'plant', 25, 10), deco('vplant4', 'plant', 1, 17), deco('vplant5', 'plant', 9, 6), deco('vbench', 'bench', 11, 15, 4),
  ],
  playerStart: { x: 4, y: 6 },
  queue: [],
  staffOnly: [],
};

export interface FloorDef {
  id: FloorId;
  layout: FloorLayout;
  /** Shop level this floor belongs to (1 = starter shop). */
  level: number;
  /** Short line for menus. */
  blurb: string;
}

export const FLOORS: FloorDef[] = [
  { id: 'ground', layout: GROUND, level: 1, blurb: 'The starter shop: ten tanks, the till and the office PC.' },
  { id: 'upstairs', layout: UPSTAIRS, level: 2, blurb: 'Large unheated tanks for coldwater and temperate species.' },
  { id: 'marine', layout: MARINE, level: 3, blurb: 'Specialist tropical and marine systems with salinity control.' },
  { id: 'basement', layout: BASEMENT, level: 4, blurb: 'Warehouse stock space and an equipment retail floor.' },
  { id: 'reef', layout: REEF, level: 5, blurb: 'Coral reef systems, a frag rack, and nano tanks for shrimp and snails.' },
  { id: 'vivarium', layout: VIVARIUM, level: 6, blurb: 'Vivariums, terrariums and paludariums for frogs, geckos and tarantulas.' },
];

const BY_ID = new Map(FLOORS.map((f) => [f.id as string, f]));

export function getFloor(id: string): FloorDef {
  const f = BY_ID.get(id === 'floor1' ? 'ground' : id);
  if (!f) throw new Error(`Unknown floor: ${id}`);
  return f;
}

export function getFloorLayout(id: string): FloorLayout {
  return getFloor(id).layout;
}

/** Floor each tank, shelf and rack lives on (ids of interactable props are unique across floors). */
const PROP_FLOOR = new Map<string, FloorId>();
for (const f of FLOORS) for (const p of f.layout.props) if (p.kind !== 'stairs' && !PROP_FLOOR.has(p.id)) PROP_FLOOR.set(p.id, f.id);

export function floorOfTank(tankId: string): FloorId {
  return PROP_FLOOR.get(tankId) ?? 'ground';
}

/** The prop with this id on whichever floor holds it. */
export function findProp(id: string): { floor: FloorId; prop: PropPlacement } | null {
  const floor = PROP_FLOOR.get(id);
  if (!floor) return null;
  const prop = getFloorLayout(floor).props.find((p) => p.id === id);
  return prop ? { floor, prop } : null;
}

/** Tank ids placed on a floor (in layout order). */
export function tankIdsOnFloor(id: string): string[] {
  return getFloorLayout(id).props.filter((p) => p.kind === 'tank').map((p) => p.id);
}

/**
 * Route between floors as a list of stairs props to take, by breadth-first
 * search over the stairs graph (restricted to unlocked floors).
 */
export function floorRoute(from: string, to: string, unlocked: string[]): Array<{ floor: string; stairs: PropPlacement }> {
  if (from === to) return [];
  const ok = new Set(unlocked);
  const prev = new Map<string, { floor: string; stairs: PropPlacement }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const f = queue.shift()!;
    for (const st of stairsOf(getFloorLayout(f))) {
      const next = st.to!;
      if (seen.has(next) || !ok.has(next)) continue;
      seen.add(next);
      prev.set(next, { floor: f, stairs: st });
      if (next === to) {
        const path: Array<{ floor: string; stairs: PropPlacement }> = [];
        let cur = to;
        while (cur !== from) {
          const p = prev.get(cur)!;
          path.unshift(p);
          cur = p.floor;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

/** Where you arrive when taking `stairs` from `fromFloor`: in front of the matching stairs on the other floor. */
export function stairsArrival(fromFloor: string, stairs: PropPlacement): { floor: string; x: number; y: number; facing: 'right' } {
  const to = stairs.to!;
  const back = stairsOf(getFloorLayout(to)).find((p) => p.to === fromFloor);
  const tile = back?.interact?.[1] ?? back?.interact?.[0] ?? getFloorLayout(to).playerStart;
  return { floor: to, x: tile.x, y: tile.y, facing: 'right' };
}
