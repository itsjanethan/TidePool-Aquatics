/**
 * CustomerSystem + CustomerAI. Customers are simulated entities that walk the
 * shop grid, browse tanks, reserve fish, queue at the till, ask for advice and
 * leave. The renderer only draws them.
 */
import { clamp, round } from '../core/math';
import type { Rng } from '../core/rng';
import { ARCHETYPES, FIRST_NAMES, PROBLEMS, THOUGHTS, type ArchetypeDef, type ProblemDef } from '../data/customers';
import { getDecor, getDryGood } from '../data/catalog';
import { availablePlants, plantValue } from './plants';
import { getSpecies, SPECIES } from '../data/species';
import type { FloorLayout } from '../data/shopLayout';
import { summarizeAquascape } from './aquascape';
import { assessSpeciesForSetup } from './compat';
import { demandFor, earn, noteSold, priceFor } from './economy';
import { fishInTank, fishValue, getMorph, newId } from './fish';
import { findPath, type Pt } from './pathfinding';
import { nudgeRep, overallReputation } from './reputation';
import { dayOf, isShopOpen, weekdayOf } from './time';
import type { CustomerGoal, CustomerProfile, CustomerState, FishEntity, GameState } from './types';

export const WALK_TILES_PER_MINUTE = 1.0;
export const MAX_CUSTOMERS = 7;
export const MAX_PROFILES = 80;

export interface CustomerContext {
  layout: FloorLayout;
  grid: boolean[][];
  rng: Rng;
  onEvent?: (e: CustomerEvent) => void;
}

export type CustomerEvent =
  | { type: 'arrived'; customer: CustomerState }
  | { type: 'left'; customer: CustomerState; happy: boolean }
  | { type: 'needs_help'; customer: CustomerState }
  | { type: 'queued'; customer: CustomerState }
  | { type: 'lost'; customer: CustomerState; reason: string };

// ---------------------------------------------------------------------------
// Pricing

/** Sale price for an individual fish given the player's species price. */
export function fishPrice(state: GameState, f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  const base = priceFor(state, sp.id, sp.retailPrice);
  return Math.max(0.1, round(fishValue(f) * (base / sp.retailPrice), 2));
}

export function priceRatio(state: GameState, speciesId: string): number {
  const sp = getSpecies(speciesId);
  return priceFor(state, speciesId, sp.retailPrice) / sp.retailPrice;
}

// ---------------------------------------------------------------------------
// Spawning

function rangeOf(rng: Rng, r: [number, number]): number {
  return rng.range(r[0], r[1]);
}

export interface SpawnOptions {
  goal?: CustomerGoal;
  archetype?: string;
  patience?: number;
  problemId?: string;
}

export function spawnCustomer(state: GameState, ctx: CustomerContext, opts: SpawnOptions = {}): CustomerState {
  const { rng, layout } = ctx;
  const profiles = Object.values(state.profiles);
  let profile: CustomerProfile | undefined;
  if (!opts.archetype && profiles.length && rng.chance(Math.min(0.45, 0.1 + profiles.length * 0.02))) {
    const day = dayOf(state.minute);
    const candidates = profiles.filter((p) => day - p.lastVisitDay >= 1 && !state.customers.some((c) => c.profileId === p.id));
    if (candidates.length) profile = rng.weighted(candidates, (p) => 0.3 + p.loyalty / 50 + (p.grievance ? 1 : 0));
  }
  const arch: ArchetypeDef = profile
    ? ARCHETYPES.find((a) => a.id === profile!.archetype) ?? ARCHETYPES[0]
    : opts.archetype
      ? ARCHETYPES.find((a) => a.id === opts.archetype) ?? ARCHETYPES[0]
      : rng.weighted(ARCHETYPES, (a) => a.weight * (a.id === 'enthusiast' ? 0.5 + state.reputation.quality / 50 : 1));

  if (!profile) {
    profile = {
      id: newId(state, 'p'),
      name: rng.pick(FIRST_NAMES),
      archetype: arch.id,
      appearance: rng.int(0, 1_000_000),
      visits: 0,
      loyalty: 20,
      lastVisitDay: 0,
      totalSpent: 0,
      grievance: false,
    };
    state.profiles[profile.id] = profile;
    // Keep the profile list bounded.
    // Keep the profile list bounded: forget the least attached customers first.
    const ids = Object.keys(state.profiles);
    if (ids.length > MAX_PROFILES) {
      const inShop = new Set(state.customers.map((c) => c.profileId));
      const removable = ids
        .map((id) => state.profiles[id])
        .filter((p) => p.id !== profile!.id && !inShop.has(p.id) && !p.grievance)
        .sort((x, y) => x.loyalty + x.visits * 5 - (y.loyalty + y.visits * 5));
      for (const p of removable.slice(0, ids.length - MAX_PROFILES)) delete state.profiles[p.id];
    }
  }

  let goal: CustomerGoal = opts.goal ?? rng.weighted(Object.keys(arch.goals) as CustomerGoal[], (g) => arch.goals[g] ?? 0);
  let problemId = opts.problemId;
  if (profile.grievance && !opts.goal) {
    goal = 'problem';
    problemId = 'complaint';
  }

  const traits = {
    budget: round(rangeOf(rng, arch.budget) * (1 + profile.loyalty / 200), 2),
    experience: rangeOf(rng, arch.experience),
    patience: opts.patience ?? rangeOf(rng, arch.patience),
    negotiation: rangeOf(rng, arch.negotiation),
    ethics: rangeOf(rng, arch.ethics),
    qualityFocus: rangeOf(rng, arch.qualityFocus),
  };

  const goalData: CustomerState['goalData'] = {};
  if (goal === 'buy_specific') {
    const pool = arch.favourites.length ? arch.favourites : SPECIES.filter((s) => s.starter).map((s) => s.id);
    const sid = rng.pick(pool);
    const sp = getSpecies(sid);
    goalData.speciesId = sid;
    goalData.quantity = sp.social === 'shoal' ? rng.int(3, 8) : sp.social === 'solitary' ? 1 : rng.int(2, 4);
  } else if (goal === 'advice_stocking') {
    goalData.tankLitres = rng.pick(arch.tankSizes);
    goalData.heated = rng.chance(arch.heatedChance);
  } else if (goal === 'problem') {
    goalData.problemId = problemId ?? rng.pick(PROBLEMS).id;
  }

  const door = layout.door;
  const c: CustomerState = {
    id: newId(state, 'c'),
    profileId: profile.id,
    name: profile.name,
    archetype: arch.id,
    appearance: profile.appearance,
    traits,
    goal,
    goalData,
    phase: 'entering',
    x: door.x,
    y: door.y,
    path: [],
    facing: 'up',
    browseQueue: [],
    currentTankId: null,
    waitMinutes: 0,
    patienceLeft: 35 + traits.patience * 70,
    basket: [],
    addOns: [],
    plantUids: [],
    satisfaction: 60 + profile.loyalty * 0.15,
    thought: null,
    thoughtUntil: 0,
    returning: profile.visits > 0,
    walkPhase: 0,
    arrivedMinute: state.minute,
    queueIndex: -1,
    negotiated: false,
  };
  profile.visits += 1;
  profile.lastVisitDay = dayOf(state.minute);
  state.customers.push(c);
  planAfterEntering(state, ctx, c);
  ctx.onEvent?.({ type: 'arrived', customer: c });
  return c;
}

function planAfterEntering(state: GameState, ctx: CustomerContext, c: CustomerState): void {
  const { rng } = ctx;
  if (c.goal === 'advice_stocking' || c.goal === 'problem') {
    // Glance at one tank first, then look for the shopkeeper.
    c.browseQueue = rng.chance(0.5) ? [rng.pick(state.tankOrder)] : [];
    c.phase = c.browseQueue.length ? 'browsing' : 'seeking_help';
  } else if (c.goal === 'buy_specific') {
    const sid = c.goalData.speciesId!;
    const withSpecies = state.tankOrder.filter((id) => tankForSale(state, id) && fishInTank(state, id).some((f) => f.speciesId === sid));
    c.browseQueue = withSpecies.length ? withSpecies.slice(0, 2) : [rng.pick(state.tankOrder)];
    c.phase = 'browsing';
  } else {
    const n = rng.int(2, 4);
    const pool = [...state.tankOrder];
    c.browseQueue = [];
    for (let i = 0; i < n && pool.length; i++) c.browseQueue.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    // Potted plants for sale sit on the shelves; some browsers look there too.
    if (availablePlants(state).length && rng.chance(0.45)) c.browseQueue.splice(rng.int(0, c.browseQueue.length), 0, PLANT_SHELF);
    c.phase = 'browsing';
  }
  nextBrowseTarget(state, ctx, c);
}

// ---------------------------------------------------------------------------
// Movement helpers

function setPath(ctx: CustomerContext, c: CustomerState, to: Pt): boolean {
  const p = findPath(ctx.grid, { x: Math.round(c.x), y: Math.round(c.y) }, to);
  if (!p) return false;
  c.path = p;
  return true;
}

function tankInteractTiles(ctx: CustomerContext, tankId: string): Pt[] {
  return ctx.layout.props.find((p) => p.id === tankId)?.interact ?? [];
}

function nextBrowseTarget(state: GameState, ctx: CustomerContext, c: CustomerState): void {
  while (c.browseQueue.length) {
    const tid = c.browseQueue.shift()!;
    const tiles = tankInteractTiles(ctx, tid);
    if (!tiles.length) continue;
    const tile = ctx.rng.pick(tiles);
    if (setPath(ctx, c, tile)) {
      c.currentTankId = tid;
      c.phase = 'browsing';
      c.waitMinutes = -1; // walking
      return;
    }
  }
  c.currentTankId = null;
  // Done browsing.
  if (c.goal === 'advice_stocking' || c.goal === 'problem') {
    if (hasPurchases(c)) goToQueue(state, ctx, c);
    else if (c.phase !== 'leaving') {
      c.phase = 'seeking_help';
      c.path = [];
    }
    return;
  }
  if (hasPurchases(c)) goToQueue(state, ctx, c);
  else leave(state, ctx, c, c.goal === 'buy_specific' ? 'out of stock' : 'nothing caught their eye');
}

export function queueCustomers(state: GameState): CustomerState[] {
  return state.customers
    .filter((c) => (c.phase === 'queueing' || c.phase === 'to_queue') && c.queueIndex >= 0)
    .sort((a, b) => a.queueIndex - b.queueIndex);
}

function goToQueue(state: GameState, ctx: CustomerContext, c: CustomerState): void {
  const q = queueCustomers(state);
  c.queueIndex = q.length ? q[q.length - 1].queueIndex + 1 : 0;
  c.phase = 'to_queue';
  reindexQueue(state, ctx);
  ctx.onEvent?.({ type: 'queued', customer: c });
}

function reindexQueue(state: GameState, ctx: CustomerContext): void {
  const q = queueCustomers(state);
  q.forEach((qc, i) => {
    qc.queueIndex = i;
    const spot = ctx.layout.queue[Math.min(i, ctx.layout.queue.length - 1)];
    const atSpot = Math.round(qc.x) === spot.x && Math.round(qc.y) === spot.y && qc.path.length === 0;
    if (!atSpot) {
      setPath(ctx, qc, spot);
      qc.phase = 'to_queue';
    }
  });
}

function think(state: GameState, c: CustomerState, text: string, minutes = 6): void {
  c.thought = text;
  c.thoughtUntil = state.minute + minutes;
}

export const PLANT_SHELF = 'shelf1';

function hasPurchases(c: CustomerState): boolean {
  return c.basket.length > 0 || c.addOns.length > 0 || (c.plantUids?.length ?? 0) > 0;
}

/** Customer looks over the potted plants on the shelf. */
function evaluatePlants(state: GameState, ctx: CustomerContext, c: CustomerState): void {
  const plants = availablePlants(state).sort((a, b) => b.size * b.health - a.size * a.health);
  if (!plants.length) return;
  const spent = checkoutQuote(state, c).total;
  let budget = c.traits.budget - spent;
  const chance = c.archetype === 'beginner' || c.archetype === 'hobbyist' ? 0.6 : 0.4;
  if (!ctx.rng.chance(chance)) return;
  const want = ctx.rng.int(1, c.traits.budget > 40 ? 3 : 2);
  for (const p of plants) {
    if ((c.plantUids?.length ?? 0) >= want) break;
    const price = plantPrice(state, p);
    if (price > budget) continue;
    reservePlant(c, p.uid, state);
    budget -= price;
  }
  if (c.plantUids.length) think(state, c, ctx.rng.pick(['Nice plants!', 'Ooh, a fern.', 'Lovely and healthy.']));
}

function reservePlant(c: CustomerState, uid: string, state: GameState): void {
  const p = state.storage.plants.find((x) => x.uid === uid);
  if (!p || p.reservedBy) return;
  p.reservedBy = c.id;
  (c.plantUids ??= []).push(uid);
}

/** Sale price of a potted plant (player can scale all plant prices). */
export function plantPrice(state: GameState, p: { defId: string; size: number; health: number }): number {
  return round(plantValue(p) * (state.prices[PLANT_PRICE_KEY] ?? 1), 2);
}
export const PLANT_PRICE_KEY = '_plants';

/** Adds the best affordable potted plant to the basket. Returns true if accepted. */
export function offerPlant(state: GameState, c: CustomerState, rng: Rng): boolean {
  const spent = checkoutQuote(state, c).total;
  const p = availablePlants(state).filter((x) => plantPrice(state, x) <= c.traits.budget - spent + 2).sort((a, b) => b.size - a.size)[0];
  if (!p) return false;
  if (!rng.chance(clamp(0.35 + (1 - c.traits.experience) * 0.3, 0.1, 0.85))) {
    c.satisfaction -= 2;
    return false;
  }
  reservePlant(c, p.uid, state);
  return true;
}

function releaseReservations(state: GameState, c: CustomerState): void {
  for (const uid of c.plantUids ?? []) {
    const p = state.storage.plants.find((x) => x.uid === uid);
    if (p && p.reservedBy === c.id) p.reservedBy = null;
  }
  c.plantUids = [];
  for (const line of c.basket) {
    for (const id of line.fishIds) {
      const f = state.fish[id];
      if (f && f.reservedBy === c.id) f.reservedBy = null;
    }
  }
  c.basket = [];
}

export function leave(state: GameState, ctx: CustomerContext, c: CustomerState, reason: string, lost = false): void {
  if (c.phase === 'leaving' || c.phase === 'gone') return;
  releaseReservations(state, c);
  c.queueIndex = -1;
  c.phase = 'leaving';
  setPath(ctx, c, ctx.layout.door);
  if (lost) {
    state.today.customersLost += 1;
    ctx.onEvent?.({ type: 'lost', customer: c, reason });
  }
  reindexQueue(state, ctx);
}

// ---------------------------------------------------------------------------
// Browsing decisions

function evaluateTank(state: GameState, ctx: CustomerContext, c: CustomerState, tankId: string): void {
  const { rng } = ctx;
  const tank = state.tanks[tankId];
  const all = fishInTank(state, tankId, true);
  const dead = all.filter((f) => !f.alive);
  const alive = all.filter((f) => f.alive);
  const scape = summarizeAquascape(tank);
  const dirt = tank.algae + tank.glassDirt + tank.water.cloudiness;

  if (dead.length) {
    c.satisfaction -= 10 + c.traits.ethics * 6;
    nudgeRep(state, 'welfare', -0.6);
    think(state, c, rng.pick(THOUGHTS.deadFish));
  } else if (alive.some((f) => f.health < 40)) {
    c.satisfaction -= 5;
    nudgeRep(state, 'welfare', -0.25);
    think(state, c, rng.pick(THOUGHTS.sickFish));
  } else if (dirt > 0.8) {
    c.satisfaction -= 4;
    nudgeRep(state, 'cleanliness', -0.3);
    think(state, c, rng.pick(THOUGHTS.dirtyTank));
  } else if (scape.beauty > 55) {
    c.satisfaction += 4;
    nudgeRep(state, 'aquascape', 0.25);
    think(state, c, rng.pick(THOUGHTS.lovelyTank));
  }

  const spent = c.basket.reduce((s, l) => s + l.unitPrice * l.fishIds.length, 0);
  let budgetLeft = c.traits.budget - spent;
  const candidates = tankForSale(state, tankId) ? alive.filter((f) => sellable(f)) : [];
  const bySpecies = new Map<string, FishEntity[]>();
  for (const f of candidates) {
    if (!bySpecies.has(f.speciesId)) bySpecies.set(f.speciesId, []);
    bySpecies.get(f.speciesId)!.push(f);
  }
  if (!bySpecies.size) return;

  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  const rep = overallReputation(state);
  const acceptRatio = 1.15 + rep / 400 + c.traits.qualityFocus * 0.1 - c.traits.negotiation * 0.1;

  const consider = (sid: string, wantQty: number, mustBuy: boolean) => {
    const pool = bySpecies.get(sid);
    if (!pool?.length) return;
    const ratio = priceRatio(state, sid);
    if (ratio > acceptRatio + 0.35 && !mustBuy) {
      think(state, c, rng.pick(THOUGHTS.pricey));
      nudgeRep(state, 'value', -0.2);
      return;
    }
    if (ratio < 0.85) think(state, c, rng.pick(THOUGHTS.bargain));
    // Picky customers pick the best fish first.
    const sorted = [...pool].sort((a, b) =>
      c.traits.qualityFocus > 0.5 ? b.quality * b.health - a.quality * a.health : rng.next() - 0.5,
    );
    const picked: FishEntity[] = [];
    for (const f of sorted) {
      if (picked.length >= wantQty) break;
      if (c.traits.qualityFocus > 0.7 && f.quality < 0.45) continue;
      const p = fishPrice(state, f);
      if (p > budgetLeft) continue;
      picked.push(f);
      budgetLeft -= p;
    }
    if (!picked.length) return;
    for (const f of picked) f.reservedBy = c.id;
    const unit = round(picked.reduce((s, f) => s + fishPrice(state, f), 0) / picked.length, 2);
    c.basket.push({ speciesId: sid, fishIds: picked.map((f) => f.id), unitPrice: unit });
  };

  if (c.goal === 'buy_specific') {
    const sid = c.goalData.speciesId!;
    const have = c.basket.filter((l) => l.speciesId === sid).reduce((s, l) => s + l.fishIds.length, 0);
    const want = (c.goalData.quantity ?? 1) - have;
    if (want > 0) {
      if (bySpecies.has(sid)) consider(sid, want, false);
      else if (!c.browseQueue.length && !c.basket.length) think(state, c, rng.pick(THOUGHTS.outOfStock));
    }
    return;
  }

  if (c.goal === 'browse') {
    const options = [...bySpecies.keys()];
    const appeal = (sid: string) => {
      const pool = bySpecies.get(sid)!;
      const sp = getSpecies(sid);
      const avgMorph = pool.reduce((s, f) => s + getMorph(sp, f.morphId).priceMultiplier * (0.6 + f.quality), 0) / pool.length;
      const fav = arch.favourites.includes(sid) ? 1.6 : 1;
      return avgMorph * fav * (0.7 + scape.beauty / 150);
    };
    const best = options.sort((a, b) => appeal(b) - appeal(a))[0];
    // Demand: when the town is flooded with one species, fewer people want more.
    const chance = clamp((0.25 + appeal(best) * 0.25 + c.satisfaction / 300 - (c.basket.length ? 0.35 : 0)) * demandFor(state, best), 0.05, 0.9);
    if (rng.chance(chance)) {
      const sp = getSpecies(best);
      const qty = sp.social === 'solitary' ? 1 : sp.social === 'shoal' ? rng.int(3, 6) : rng.int(1, 3);
      consider(best, qty, false);
    }
  }
}

// ---------------------------------------------------------------------------
// Main update

export function updateCustomers(state: GameState, ctx: CustomerContext, dtMin: number): void {
  // Spawning.
  const open = isShopOpen(state.minute);
  if (open && state.customers.filter((c) => c.phase !== 'gone').length < MAX_CUSTOMERS) {
    const rep = overallReputation(state);
    const wd = weekdayOf(state.minute);
    const weekend = wd === 'Sat' || wd === 'Sun' ? 1.35 : 1;
    const perHour = (1.2 + (rep / 100) * 2.6) * weekend;
    if (ctx.rng.chance(1 - Math.exp(-(perHour / 60) * dtMin))) spawnCustomer(state, ctx);
  }

  for (const c of state.customers) {
    if (c.phase === 'gone') continue;
    if (c.thought && state.minute > c.thoughtUntil) c.thought = null;

    // Walk along path.
    if (c.path.length) {
      let move = WALK_TILES_PER_MINUTE * dtMin;
      c.walkPhase += dtMin;
      while (move > 0 && c.path.length) {
        const n = c.path[0];
        const dx = n.x - c.x;
        const dy = n.y - c.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) c.facing = dx > 0 ? 'right' : 'left';
        else if (d > 0.001) c.facing = dy > 0 ? 'down' : 'up';
        if (d <= move) {
          c.x = n.x;
          c.y = n.y;
          c.path.shift();
          move -= d;
        } else {
          c.x += (dx / d) * move;
          c.y += (dy / d) * move;
          move = 0;
        }
      }
      continue;
    }

    // Arrived somewhere: act according to phase.
    switch (c.phase) {
      case 'browsing': {
        if (!open && c.basket.length === 0) {
          leave(state, ctx, c, 'closing time');
          break;
        }
        if (c.waitMinutes < 0) {
          c.waitMinutes = ctx.rng.range(3, 8);
          c.facing = 'up';
        }
        c.waitMinutes -= dtMin;
        if (c.waitMinutes <= 0) {
          if (c.currentTankId === PLANT_SHELF) evaluatePlants(state, ctx, c);
          else if (c.currentTankId && state.tanks[c.currentTankId]) evaluateTank(state, ctx, c, c.currentTankId);
          nextBrowseTarget(state, ctx, c);
        }
        break;
      }
      case 'to_queue':
        c.phase = 'queueing';
        c.facing = 'up';
        break;
      case 'queueing':
      case 'waiting_help': {
        c.patienceLeft -= dtMin;
        if (c.phase === 'queueing') c.facing = 'up';
        if (c.patienceLeft < 15 && !c.thought) think(state, c, ctx.rng.pick(THOUGHTS.waiting), 8);
        if (c.patienceLeft <= 0) {
          think(state, c, ctx.rng.pick(THOUGHTS.angry), 10);
          c.satisfaction -= 30;
          nudgeRep(state, 'service', -1.5);
          leave(state, ctx, c, 'waited too long', true);
        }
        if (c.phase === 'waiting_help') {
          const dist = Math.hypot(state.player.x - c.x, state.player.y - c.y);
          if (dist > 2.5) c.phase = 'seeking_help';
        }
        break;
      }
      case 'seeking_help': {
        if (!open && !c.basket.length) {
          leave(state, ctx, c, 'closing time');
          break;
        }
        c.patienceLeft -= dtMin * 0.5;
        const dist = Math.hypot(state.player.x - c.x, state.player.y - c.y);
        if (dist <= 1.6) {
          c.phase = 'waiting_help';
          if (!c.thought) think(state, c, '?', 600);
          ctx.onEvent?.({ type: 'needs_help', customer: c });
          // Face the player.
          const dx = state.player.x - c.x;
          const dy = state.player.y - c.y;
          c.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        } else {
          const target = nearestFreeNeighbour(ctx, state.player.x, state.player.y, c.x, c.y);
          if (!target || !setPath(ctx, c, target)) {
            c.waitMinutes += dtMin;
            if (c.waitMinutes > 30) leave(state, ctx, c, 'could not find help', true);
          } else {
            // Re-evaluate frequently by limiting the walked path.
            c.path = c.path.slice(0, 3);
          }
        }
        if (c.patienceLeft <= 0) {
          c.satisfaction -= 25;
          nudgeRep(state, 'service', -1);
          leave(state, ctx, c, 'nobody helped', true);
        }
        break;
      }
      case 'leaving': {
        c.phase = 'gone';
        finishVisit(state, c);
        ctx.onEvent?.({ type: 'left', customer: c, happy: c.satisfaction >= 55 });
        break;
      }
      case 'entering':
        nextBrowseTarget(state, ctx, c);
        break;
      default:
        break;
    }
  }
  state.customers = state.customers.filter((c) => c.phase !== 'gone');
}

function nearestFreeNeighbour(ctx: CustomerContext, px: number, py: number, fromX: number, fromY: number): Pt | null {
  const cx = Math.round(px);
  const cy = Math.round(py);
  const cands: Pt[] = [];
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cx + dx;
    const y = cy + dy;
    if (ctx.grid[y]?.[x]) cands.push({ x, y });
  }
  cands.sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY));
  return cands[0] ?? null;
}

function finishVisit(state: GameState, c: CustomerState): void {
  const p = state.profiles[c.profileId];
  if (!p) return;
  p.loyalty = clamp(p.loyalty + (c.satisfaction - 55) / 5, 0, 100);
  nudgeRep(state, 'service', clamp((c.satisfaction - 55) / 30, -1.5, 1.2));
}

// ---------------------------------------------------------------------------
// Player interactions (called by UI)

export function servingCustomer(state: GameState, layout: FloorLayout): CustomerState | null {
  const spot = layout.queue[0];
  const c = queueCustomers(state)[0];
  if (!c || c.phase !== 'queueing') return null;
  if (Math.round(c.x) !== spot.x || Math.round(c.y) !== spot.y) return null;
  return c;
}

export function helpableCustomerNear(state: GameState, x: number, y: number): CustomerState | null {
  let best: CustomerState | null = null;
  let bestD = 1.6;
  for (const c of state.customers) {
    if (c.phase !== 'waiting_help' && c.phase !== 'seeking_help') continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function customerAt(state: GameState, x: number, y: number): CustomerState | null {
  return state.customers.find((c) => c.phase !== 'gone' && Math.hypot(c.x - x, c.y - y) < 0.7) ?? null;
}

export interface QuoteLine {
  label: string;
  qty: number;
  unit: number;
  total: number;
}

export function checkoutQuote(state: GameState, c: CustomerState): { lines: QuoteLine[]; total: number } {
  const lines: QuoteLine[] = [];
  for (const l of c.basket) {
    const fish = l.fishIds.map((id) => state.fish[id]).filter((f): f is FishEntity => !!f && f.alive);
    if (!fish.length) continue;
    const total = round(fish.reduce((s, f) => s + fishPrice(state, f), 0), 2);
    lines.push({ label: getSpecies(l.speciesId).commonName, qty: fish.length, unit: round(total / fish.length, 2), total });
  }
  const plantGroups = new Map<string, number[]>();
  for (const uid of c.plantUids ?? []) {
    const p = state.storage.plants.find((x) => x.uid === uid);
    if (!p) continue;
    const arr = plantGroups.get(p.defId) ?? [];
    arr.push(plantPrice(state, p));
    plantGroups.set(p.defId, arr);
  }
  for (const [defId, prices] of plantGroups) {
    const total = round(prices.reduce((a, b) => a + b, 0), 2);
    lines.push({ label: `${getDecor(defId).name} (plant)`, qty: prices.length, unit: round(total / prices.length, 2), total });
  }
  for (const id of c.addOns) {
    const g = getDryGood(id);
    lines.push({ label: g.name, qty: 1, unit: g.retail, total: g.retail });
  }
  return { lines, total: round(lines.reduce((s, l) => s + l.total, 0), 2) };
}

/** Returns a counter-offer if this customer wants to haggle, else null. */
export function counterOffer(state: GameState, c: CustomerState, rng: Rng): number | null {
  if (c.negotiated) return null;
  const { total } = checkoutQuote(state, c);
  if (total < 4) return null;
  const avgRatio = c.basket.length
    ? c.basket.reduce((s, l) => s + priceRatio(state, l.speciesId), 0) / c.basket.length
    : 1;
  const wants = c.traits.negotiation > 0.55 || (avgRatio > 1.2 && rng.chance(0.6));
  if (!wants) return null;
  c.negotiated = true;
  const offer = total * (1 - 0.1 - c.traits.negotiation * 0.15);
  return Math.max(0.5, Math.round(offer * 2) / 2);
}

/** Chance (0..1) a customer accepts the player's counter price. */
export function acceptChance(c: CustomerState, offer: number, asked: number): number {
  const gap = clamp((asked - offer) / Math.max(1, offer), 0, 1);
  return clamp(1 - gap * (1.5 + c.traits.negotiation * 2.5), 0.05, 0.98);
}

export interface SaleResult {
  total: number;
  fishCount: number;
  plantCount: number;
}

export function completeSale(state: GameState, ctx: CustomerContext, c: CustomerState, finalTotal: number): SaleResult {
  const quote = checkoutQuote(state, c);
  const avgRatio = c.basket.length ? c.basket.reduce((s, l) => s + priceRatio(state, l.speciesId), 0) / c.basket.length : 1;
  let fishCount = 0;
  for (const l of c.basket) {
    for (const id of l.fishIds) {
      const f = state.fish[id];
      if (!f || !f.alive) continue;
      fishCount++;
      noteSold(state, f.speciesId, 1);
      // Sold fish leave the simulation. Ancestors with descendants are kept for lineage.
      if (f.offspringCount > 0) {
        f.tankId = null;
        f.reservedBy = null;
        f.originDetail += ' (sold)';
      } else {
        delete state.fish[id];
      }
    }
  }
  for (const id of c.addOns) state.dryGoods[id] = Math.max(0, (state.dryGoods[id] ?? 0) - 1);
  const plantCount = (c.plantUids ?? []).length;
  state.storage.plants = state.storage.plants.filter((p) => !(c.plantUids ?? []).includes(p.uid));
  state.stats.plantsSold = (state.stats.plantsSold ?? 0) + plantCount;
  c.plantUids = [];
  c.basket = [];
  c.addOns = [];
  earn(state, finalTotal, `Sale to ${c.name}`);
  state.today.fishSold += fishCount;
  state.today.customersServed += 1;
  state.stats.totalFishSold += fishCount;
  state.stats.customersServed += 1;
  const p = state.profiles[c.profileId];
  if (p) p.totalSpent = round(p.totalSpent + finalTotal, 2);

  // Value perception and service.
  const discount = quote.total > 0 ? 1 - finalTotal / quote.total : 0;
  c.satisfaction += discount * 60 + 6;
  nudgeRep(state, 'value', clamp(discount * 8 + (1 - avgRatio) * 2, -1, 1.5));
  const waited = state.minute - c.arrivedMinute;
  if (waited < 40) nudgeRep(state, 'service', 0.4);
  think(state, c, ctx.rng.pick(THOUGHTS.happy), 8);
  leave(state, ctx, c, 'served');
  return { total: finalTotal, fishCount, plantCount };
}

export function refuseSale(state: GameState, ctx: CustomerContext, c: CustomerState): void {
  c.satisfaction -= 15;
  think(state, c, ctx.rng.pick(THOUGHTS.angry), 8);
  leave(state, ctx, c, 'refused', true);
}

/** Customer considers an add-on. Returns true if they accept. */
export function offerAddOn(state: GameState, c: CustomerState, goodId: string, rng: Rng): boolean {
  if ((state.dryGoods[goodId] ?? 0) <= c.addOns.filter((x) => x === goodId).length) return false;
  if (c.addOns.includes(goodId)) return false;
  const base = goodId === 'conditioner' ? 0.45 : 0.25;
  const p = clamp(base + (1 - c.traits.experience) * 0.35 - c.traits.negotiation * 0.2, 0.05, 0.9);
  if (rng.chance(p)) {
    c.addOns.push(goodId);
    return true;
  }
  c.satisfaction -= 2;
  return false;
}

export interface AdviceResult {
  reply: string;
  success: boolean;
}

/** Species with sellable stock right now. */
/** Customers may only buy from tanks marked for sale (the default). */
export function tankForSale(state: GameState, tankId: string): boolean {
  return state.tanks[tankId]?.forSale !== false;
}

/** A fish customers could take home: healthy, not fry, not already reserved. */
export function sellable(f: FishEntity): boolean {
  return f.alive && !f.reservedBy && f.health > 55 && f.sizeCm / f.adultSizeCm > 0.3;
}

export function inStockSpecies(state: GameState): string[] {
  const set = new Set<string>();
  for (const id in state.fish) {
    const f = state.fish[id];
    if (f.tankId && tankForSale(state, f.tankId) && sellable(f)) set.add(f.speciesId);
  }
  return SPECIES.map((s) => s.id).filter((id) => set.has(id));
}

function reserveForAdvice(state: GameState, c: CustomerState, speciesId: string): number {
  const sp = getSpecies(speciesId);
  const pool = Object.values(state.fish)
    .filter((f) => f.tankId && tankForSale(state, f.tankId) && f.speciesId === speciesId && sellable(f))
    .sort((a, b) => b.health - a.health);
  let want = sp.social === 'solitary' ? 1 : sp.social === 'pairs' ? 2 : Math.max(sp.minGroupSize, 2);
  if (c.traits.budget > 60) want += 2;
  const picked: FishEntity[] = [];
  let budget = c.traits.budget;
  for (const f of pool) {
    if (picked.length >= want) break;
    const p = fishPrice(state, f);
    if (p > budget) break;
    picked.push(f);
    budget -= p;
  }
  if (!picked.length) return 0;
  for (const f of picked) f.reservedBy = c.id;
  c.basket.push({
    speciesId,
    fishIds: picked.map((f) => f.id),
    unitPrice: round(picked.reduce((s, f) => s + fishPrice(state, f), 0) / picked.length, 2),
  });
  return picked.length;
}

export function adviceSetupText(c: CustomerState): string {
  const L = c.goalData.tankLitres ?? 60;
  return `I have a ${L}-litre tank ${c.goalData.heated ? 'with a heater' : 'with no heater'}. What fish could I keep in it?`;
}

/** Player recommends a species (or null = "nothing suitable in stock"). */
export function resolveAdvice(state: GameState, ctx: CustomerContext, c: CustomerState, speciesId: string | null): AdviceResult {
  const setup = { litres: c.goalData.tankLitres ?? 60, heated: !!c.goalData.heated };
  state.stats.adviceGiven += 1;
  c.thought = null;
  const stock = inStockSpecies(state);
  const bestScore = Math.max(0, ...stock.map((s) => assessSpeciesForSetup(s, setup).score));
  if (!speciesId) {
    if (bestScore < 0.75) {
      nudgeRep(state, 'knowledge', 1);
      c.satisfaction += 5;
      state.stats.goodAdvice += 1;
      leave(state, ctx, c, 'advised');
      return { reply: 'Fair enough, thanks for being honest. I will check back next week!', success: true };
    }
    nudgeRep(state, 'knowledge', -0.5);
    leave(state, ctx, c, 'no recommendation');
    return { reply: 'Oh. Okay, I will look elsewhere then.', success: false };
  }
  const sp = getSpecies(speciesId);
  const res = assessSpeciesForSetup(speciesId, setup);
  if (res.score >= 0.75) {
    nudgeRep(state, 'knowledge', 1.5);
    nudgeRep(state, 'service', 0.4);
    c.satisfaction += 15;
    state.stats.goodAdvice += 1;
    const n = reserveForAdvice(state, c, speciesId);
    if (!n) {
      leave(state, ctx, c, 'over budget');
      return { reply: `${sp.commonName} sound perfect, but they are over my budget today. Thanks though!`, success: true };
    }
    // Someone setting up a tank often wants a plant too.
    let extra = '';
    if (ctx.rng.chance(0.45)) {
      const p = availablePlants(state).sort((a, b) => b.size - a.size)[0];
      if (p && plantPrice(state, p) < c.traits.budget * 0.5) {
        reservePlant(c, p.uid, state);
        extra = ` And a ${getDecor(p.defId).name} for the tank.`;
      }
    }
    goToQueue(state, ctx, c);
    return { reply: `${sp.commonName}! ${sp.careTip} I will take ${n}.${extra} See you at the till!`, success: true };
  }
  if (res.score < 0.5 && ctx.rng.chance(c.traits.experience + 0.15)) {
    nudgeRep(state, 'knowledge', -2);
    c.satisfaction -= 15;
    leave(state, ctx, c, 'bad advice');
    return { reply: `Hmm, that does not sound right. ${res.issues[0] ?? ''} I will think about it.`, success: false };
  }
  // They trust you. Short-term sale, long-term grievance if it was bad advice.
  const n = reserveForAdvice(state, c, speciesId);
  if (res.score < 0.5) {
    const p = state.profiles[c.profileId];
    if (p) p.grievance = true;
    nudgeRep(state, 'welfare', -1);
  } else {
    nudgeRep(state, 'knowledge', 0.3);
  }
  if (!n) {
    leave(state, ctx, c, 'over budget');
    return { reply: 'Those are a bit over my budget. Maybe next time.', success: false };
  }
  goToQueue(state, ctx, c);
  return { reply: `Okay, I trust you. I will take ${n} ${sp.commonName}.`, success: res.score >= 0.5 };
}

export const COMPLAINT_PROBLEM: ProblemDef = {
  id: 'complaint',
  prompt: 'Those fish you recommended last time? They did not make it. They were completely wrong for my tank!',
  options: [
    { text: 'I am so sorry. Here is a refund, and let me explain what would suit your tank.', correct: true, reply: 'Thank you. That is decent of you. I will come back.' },
    { text: 'They were healthy when they left the shop. Not my problem.', correct: false, reply: 'Wow. I will be telling people about this place.' },
  ],
};

export function problemFor(c: CustomerState): ProblemDef {
  if (c.goalData.problemId === 'complaint') return COMPLAINT_PROBLEM;
  return PROBLEMS.find((p) => p.id === c.goalData.problemId) ?? PROBLEMS[0];
}

export function resolveProblem(state: GameState, ctx: CustomerContext, c: CustomerState, optionIndex: number): AdviceResult {
  const prob = problemFor(c);
  const opt = prob.options[optionIndex];
  state.stats.adviceGiven += 1;
  c.thought = null;
  if (prob.id === 'complaint') {
    const p = state.profiles[c.profileId];
    if (p) p.grievance = false;
    if (opt.correct) {
      const refund = round(8 + (p?.totalSpent ?? 0) * 0.15, 2);
      state.money = round(state.money - refund, 2);
      state.today.expenses = round(state.today.expenses + refund, 2);
      nudgeRep(state, 'service', 1.5);
      nudgeRep(state, 'knowledge', 0.5);
      c.satisfaction += 20;
      leave(state, ctx, c, 'refunded');
      return { reply: `${opt.reply} (Refunded £${refund.toFixed(2)})`, success: true };
    }
    nudgeRep(state, 'service', -4);
    nudgeRep(state, 'welfare', -1.5);
    c.satisfaction = 0;
    leave(state, ctx, c, 'complaint ignored', true);
    return { reply: opt.reply, success: false };
  }
  if (opt.correct) {
    nudgeRep(state, 'knowledge', 1.5);
    c.satisfaction += 15;
    state.stats.goodAdvice += 1;
    if (opt.sells && (state.dryGoods[opt.sells] ?? 0) > 0) {
      c.addOns.push(opt.sells);
      goToQueue(state, ctx, c);
      return { reply: opt.reply, success: true };
    }
    leave(state, ctx, c, 'advised');
    const extra = opt.sells ? ` (You have no ${getDryGood(opt.sells).name} in stock, so they will buy it elsewhere.)` : '';
    return { reply: opt.reply + extra, success: true };
  }
  nudgeRep(state, 'knowledge', -1.5);
  c.satisfaction -= 5;
  const p = state.profiles[c.profileId];
  if (p && ctx.rng.chance(0.6)) p.grievance = true;
  leave(state, ctx, c, 'advised');
  return { reply: opt.reply, success: false };
}
