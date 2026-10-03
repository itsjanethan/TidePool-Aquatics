/**
 * Developer Sandbox fixture: a deterministic game with every implemented
 * floor, expansion, species, plant, ornament, equipment and retail item
 * available, healthy mature tanks, staff, funds and stock.
 *
 * It is built with the real gameplay systems (newGame, buyExpansion,
 * hireApplicant, addDecor, createFish, buyRetailStock...), so the same
 * validation rules apply as in normal play. Developer builds only: nothing in
 * src/dev is part of the public production build.
 *
 * Reproduce: createSandbox() always returns the same state for SANDBOX_SEED.
 */
import { Rng } from '../core/rng';
import { DECOR, DRY_GOODS, FLOATING, getDecor } from '../data/catalog';
import { EXPANSIONS } from '../data/expansions';
import { RETAIL_ITEMS } from '../data/retail';
import { SPECIES, getSpecies } from '../data/species';
import { MAX_FISH_PER_TANK } from '../sim/breeding';
import { buyExpansion } from '../sim/expansion';
import { createFish, fishInTank, newId } from '../sim/fish';
import { newGame } from '../sim/newGame';
import { MAX_DECOR } from '../sim/plants';
import { overallReputation } from '../sim/reputation';
import { hireApplicant, refreshApplicants } from '../sim/staff';
import { refreshSupplierStock, SUPPLIERS } from '../sim/supplier';
import { addDecor, buyHeater, setHeater } from '../sim/tank';
import { dayOf } from '../sim/time';
import type { GameState, StaffRole, TankState } from '../sim/types';

export const SANDBOX_SEED = 4242;
export const SANDBOX_NAME = 'Developer Sandbox';

export type SandboxPreset = 'planted' | 'breeding' | 'coldwater' | 'marine' | 'performance';

export const PRESETS: Array<{ id: SandboxPreset; label: string; blurb: string; tank: string }> = [
  { id: 'planted', label: 'Planted aquarium', blurb: 'Dense mature plants, wood, floating cover, neons, corydoras and a bristlenose.', tank: 'M6' },
  { id: 'breeding', label: 'Breeding tank', blurb: 'Conditioned guppy pairs and an egg-scatterer pair in moss; not for sale.', tank: 'Q2' },
  { id: 'coldwater', label: 'Coldwater tank', blurb: 'Unheated 300L with fancy goldfish, canister filtration and hardy plants.', tank: 'U5' },
  { id: 'marine', label: 'Marine aquarium', blurb: 'Live rock, skimmer, salinity on target; clownfish, Banggai cardinals and a royal gramma.', tank: 'M1' },
  { id: 'performance', label: 'Performance test', blurb: `Population cap (${MAX_FISH_PER_TANK} fish), maximum decor and floating plants.`, tank: 'Q1' },
];

/** Sets requirements with real progress values, then buys each expansion through the real system. */
function unlockEverything(s: GameState): void {
  for (const e of EXPANSIONS) {
    s.money = Math.max(s.money, e.requires.capital + e.cost + 1000);
    s.stats.customersServed = Math.max(s.stats.customersServed, e.requires.customersServed);
    s.stats.fishBred = Math.max(s.stats.fishBred, e.requires.fishBred ?? 0);
    for (const k of Object.keys(s.reputation) as Array<keyof GameState['reputation']>) s.reputation[k] = Math.max(s.reputation[k], Math.max(e.requires.reputation, e.requires.knowledge ?? 0) + 5);
    for (const o of e.requires.objectives) s.objectives[o] = { done: true, doneDay: 1, progress: 1 };
    const r = buyExpansion(s, e.id);
    if (!r.ok) throw new Error(`Sandbox could not build ${e.id}: ${r.message}`);
  }
  s.unlocks.species = SPECIES.map((sp) => sp.id);
  if (overallReputation(s) < 60) for (const k of Object.keys(s.reputation) as Array<keyof GameState['reputation']>) s.reputation[k] = 65;
}

/** A mature, stable tank: established filter bacteria, clean water at the right temperature. */
export function matureTank(t: TankState): void {
  const w = t.water;
  w.aob = 0.9;
  w.nob = 0.88;
  w.ammonia = 0;
  w.nitrite = 0;
  w.nitrate = 10;
  w.detritus = 0.2;
  w.cloudiness = 0;
  w.oxygen = 7.6;
  if (t.heaterId) w.temperature = t.heaterSetpoint;
  if (t.waterType === 'marine') {
    w.salinity = 35;
    w.ph = 8.2;
  }
  t.algae = 0.05;
  t.glassDirt = 0.05;
  t.filterCondition = 0.95;
  t.food = 0;
}

function clearTank(s: GameState, t: TankState): void {
  for (const f of fishInTank(s, t.id, true)) delete s.fish[f.id];
  t.decor = [];
  t.floating = {};
  t.broods = [];
}

/** Adds decor through the real addDecor (money and marine/freshwater rules apply), then matures plants. */
function place(s: GameState, t: TankState, items: Array<[string, number, 0 | 1 | 2]>, size = 1.15): void {
  for (const [defId, x, layer] of items) {
    if (t.decor.length >= MAX_DECOR) break;
    const r = addDecor(s, t, defId, x, layer);
    if (!r.ok) throw new Error(`Sandbox decor ${defId} in ${t.id}: ${r.message}`);
    const d = t.decor[t.decor.length - 1];
    if (getDecor(defId).kind === 'plant') {
      d.size = Math.min(getDecor(defId).maxSize ?? 1.5, size);
      d.health = 1;
    }
  }
}

function stock(s: GameState, rng: Rng, t: TankState, speciesId: string, n: number, opts: { sex?: 'male' | 'female'; ready?: boolean } = {}): void {
  const sp = getSpecies(speciesId);
  for (let i = 0; i < n; i++) {
    if (fishInTank(s, t.id).length >= MAX_FISH_PER_TANK) return;
    const f = createFish(s, rng, { speciesId, origin: 'dev', originDetail: 'Developer Sandbox', tankId: t.id, sex: opts.sex, ageDays: sp.maturityDays * rng.range(1.4, 2.2), sizeFraction: rng.range(0.85, 1), quality: rng.range(0.45, 0.85) });
    f.health = 100;
    f.hunger = 20;
    f.stress = 5;
    if (opts.ready) f.breedingReadiness = 1;
  }
}

/** Applies a preset to a tank, replacing its fish and decor. Throws if the tank type does not suit the preset. */
export function applyPreset(s: GameState, tankId: string, preset: SandboxPreset, rng = new Rng(SANDBOX_SEED + tankId.length)): void {
  const t = s.tanks[tankId];
  if (!t) throw new Error(`No tank ${tankId}`);
  const marine = t.waterType === 'marine';
  if (preset === 'marine' && !marine) throw new Error(`${t.name} is a freshwater tank. Use a marine tank (M1 to M3).`);
  if (preset !== 'marine' && marine) throw new Error(`${t.name} is a marine tank. Pick a freshwater tank for this preset.`);
  const money = s.money;
  s.money = Math.max(s.money, 1e6);
  clearTank(s, t);
  switch (preset) {
    case 'planted':
      t.substrateId = 'aqua_soil';
      t.backgroundId = 'black';
      if (!t.heaterId) buyHeater(s, t, 'heater_150');
      setHeater(t, 25);
      place(s, t, [
        ['amazon_sword', 0.18, 0], ['vallisneria', 0.05, 0], ['rotala', 0.92, 0], ['hornwort', 0.78, 0], ['spider_wood', 0.42, 0],
        ['cryptocoryne', 0.3, 2], ['cryptocoryne', 0.62, 2], ['java_fern', 0.5, 1], ['anubias', 0.7, 1], ['java_moss', 0.38, 2], ['java_moss', 0.85, 2],
      ], 1.35);
      t.floating = { frogbit: 0.12, red_root: 0.08 };
      stock(s, rng, t, 'neon_tetra', 16);
      stock(s, rng, t, 'bronze_cory', 6);
      stock(s, rng, t, 'bristlenose', 1, { sex: 'male' });
      break;
    case 'breeding':
      if (!t.heaterId) buyHeater(s, t, 'heater_150');
      setHeater(t, 25);
      t.forSale = false;
      place(s, t, [['java_moss', 0.2, 2], ['java_moss', 0.5, 2], ['java_moss', 0.8, 2], ['hornwort', 0.35, 0], ['hornwort', 0.7, 0]], 1.4);
      t.floating = { duckweed: 0.2 };
      stock(s, rng, t, 'guppy', 2, { sex: 'male', ready: true });
      stock(s, rng, t, 'guppy', 4, { sex: 'female', ready: true });
      stock(s, rng, t, 'zebra_danio', 1, { sex: 'male', ready: true });
      stock(s, rng, t, 'zebra_danio', 1, { sex: 'female', ready: true });
      break;
    case 'coldwater':
      t.heaterId = null;
      t.filterId = 'canister';
      t.substrateId = 'gravel';
      t.backgroundId = 'blue';
      place(s, t, [['anubias', 0.2, 1], ['anubias', 0.75, 1], ['river_stone', 0.5, 2], ['slate_stack', 0.85, 1], ['vallisneria', 0.05, 0]]);
      stock(s, rng, t, 'fancy_goldfish', 4);
      break;
    case 'marine':
      t.substrateId = 'sand';
      t.backgroundId = 'blue';
      t.skimmer = true;
      place(s, t, [['live_rock', 0.2, 1], ['live_rock', 0.55, 1], ['live_rock', 0.85, 1], ['slate_stack', 0.4, 2]]);
      stock(s, rng, t, 'clownfish', 2);
      stock(s, rng, t, 'banggai_cardinal', 4);
      stock(s, rng, t, 'royal_gramma', 1);
      break;
    case 'performance': {
      if (!t.heaterId) buyHeater(s, t, 'heater_150');
      setHeater(t, 25);
      t.filterId = 'canister';
      const plants: Array<[string, number, 0 | 1 | 2]> = [];
      const ids = ['amazon_sword', 'vallisneria', 'rotala', 'hornwort', 'cryptocoryne', 'java_fern', 'anubias', 'java_moss'];
      for (let i = 0; i < MAX_DECOR - 2; i++) plants.push([ids[i % ids.length], 0.04 + (i / (MAX_DECOR - 2)) * 0.92, (i % 3) as 0 | 1 | 2]);
      plants.push(['spider_wood', 0.5, 0], ['mopani', 0.25, 1]);
      place(s, t, plants, 1.4);
      t.floating = { duckweed: 0.35, frogbit: 0.15 };
      const mix: Array<[string, number]> = [['neon_tetra', 24], ['guppy', 16], ['platy', 12], ['bronze_cory', 10], ['endler', 8]];
      for (const [sid, n] of mix) stock(s, rng, t, sid, n);
      break;
    }
  }
  matureTank(t);
  s.money = money;
}

function hireTeam(s: GameState, rng: Rng): void {
  const roles: StaffRole[] = ['sales', 'maintenance', 'stock', 'floater'];
  for (const role of roles) {
    refreshApplicants(s, rng, true);
    const a = s.applicants.list[0];
    a.skills = { cleaning: 70, service: 70, speed: 65, knowledge: 75 };
    const r = hireApplicant(s, a.id, role);
    if (!r.ok) throw new Error(r.message);
  }
  refreshApplicants(s, rng, true);
}

/** Builds the Developer Sandbox game. Deterministic for a given seed. */
export function createSandbox(seed = SANDBOX_SEED): GameState {
  const s = newGame({ seed, playerName: 'Developer', shopName: SANDBOX_NAME });
  // Fixed creation time so two sandboxes are byte-identical.
  s.createdAt = 0;
  s.flags.sandbox = true;
  s.flags.devUsed = true;
  s.settings.tutorialSeen = true;
  const rng = new Rng(seed);
  unlockEverything(s);

  // Every floor's tanks mature and healthy; empty expansion tanks get suitable stock.
  for (const id of s.tankOrder) matureTank(s.tanks[id]);
  const fill: Record<string, Array<[string, number]>> = {
    C2: [['white_cloud', 6]],
    U1: [['rosy_barb', 8]],
    U2: [['medaka', 12]],
    U3: [['paradise_fish', 2]],
    U4: [['hillstream_loach', 4], ['zebra_danio', 6]],
    M2: [['clownfish', 2]],
    M3: [['banggai_cardinal', 4], ['royal_gramma', 1]],
    M4: [['german_blue_ram', 2]],
    M5: [['german_blue_ram', 2]],
  };
  for (const [tank, list] of Object.entries(fill)) for (const [sid, n] of list) stock(s, rng, s.tanks[tank], sid, n);
  s.tanks.C2.water.temperature = 21;
  s.tanks.C2.heaterId = null;
  for (const p of PRESETS) applyPreset(s, p.tank, p.id, rng);

  hireTeam(s, rng);

  // Stock: every retail item, dry good, decor item, potted plant and floating plant.
  s.money = 100_000;
  for (const r of RETAIL_ITEMS) s.retail[r.id] = 8;
  for (const g of DRY_GOODS) s.dryGoods[g.id] = 30;
  s.foodUnits = 8000;
  for (const d of DECOR) if (d.kind !== 'plant') s.storage.decor[d.id] = 2;
  for (const d of DECOR) if (d.kind === 'plant') s.storage.plants.push({ uid: newId(s, 'pp'), defId: d.id, size: 0.8, health: 1, reservedBy: null });
  s.storage.floating = Object.fromEntries(FLOATING.map((f) => [f.id, 6]));
  const day = dayOf(s.minute);
  for (const sup of SUPPLIERS) refreshSupplierStock(s, rng, sup.id, day);
  // Every species available from some supplier with stock.
  for (const sp of SPECIES) {
    const sup = SUPPLIERS.find((x) => x.species.includes(sp.id));
    const st = sup && s.suppliers[sup.id].stock.find((x) => x.speciesId === sp.id);
    if (st) st.available = Math.max(st.available, 20);
  }
  s.player = { x: 15, y: 15, facing: 'up', floor: 'ground' };
  s.rngState = rng.state;
  return s;
}
