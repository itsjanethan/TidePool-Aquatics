/**
 * New game factory: the inherited starter shop.
 */
import { Rng } from '../core/rng';
import { FLOOR1 } from '../data/shopLayout';
import { emptyLedger } from './economy';
import { createFish } from './fish';
import { initObjectives } from './progression';
import { refreshSupplierStock, SUPPLIERS } from './supplier';
import { createTank } from './tank';
import type { DecorItem, GameState, TankState } from './types';

export const SAVE_VERSION = 1;
export const START_MINUTE = 8 * 60 + 40; // Day 1, 08:40

interface StarterTank {
  id: string;
  sizeId: string;
  heater: string | null;
  setpoint?: number;
  filter: string;
  substrate: string;
  background: string;
  decor: Array<[string, number, 0 | 1 | 2]>;
  stock: Array<[string, number]>;
  mature: boolean;
}

const STARTER_TANKS: StarterTank[] = [
  { id: 'A1', sizeId: 't40', heater: 'heater_50', setpoint: 25, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['java_fern', 0.25, 0], ['river_stone', 0.7, 2]], stock: [['guppy', 7]], mature: true },
  { id: 'A2', sizeId: 't40', heater: 'heater_50', setpoint: 26, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['hornwort', 0.8, 0]], stock: [['endler', 8]], mature: true },
  { id: 'A3', sizeId: 't40', heater: null, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['vallisneria', 0.2, 0], ['river_stone', 0.6, 1]], stock: [['white_cloud', 9]], mature: true },
  { id: 'A4', sizeId: 't60', heater: 'heater_50', setpoint: 24, filter: 'sponge', substrate: 'gravel', background: 'black', decor: [['amazon_sword', 0.3, 0], ['coconut_cave', 0.75, 1]], stock: [['neon_tetra', 12]], mature: true },
  { id: 'A5', sizeId: 't60', heater: 'heater_50', setpoint: 24, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['anubias', 0.6, 1]], stock: [['platy', 6]], mature: true },
  { id: 'A6', sizeId: 't60', heater: null, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['river_stone', 0.4, 1]], stock: [['zebra_danio', 8]], mature: true },
  { id: 'B1', sizeId: 't120', heater: 'heater_150', setpoint: 24.5, filter: 'hang_on', substrate: 'sand', background: 'rocky', decor: [['mopani', 0.35, 1], ['clay_cave', 0.7, 1], ['java_fern', 0.15, 0], ['amazon_sword', 0.85, 0]], stock: [['bronze_cory', 6], ['bristlenose', 2]], mature: true },
  { id: 'B2', sizeId: 't120', heater: null, filter: 'hang_on', substrate: 'gravel', background: 'blue', decor: [['anubias', 0.2, 1], ['river_stone', 0.75, 2]], stock: [['fancy_goldfish', 3]], mature: true },
  { id: 'C1', sizeId: 't60', heater: 'heater_50', setpoint: 26, filter: 'sponge', substrate: 'gravel', background: 'none', decor: [['limestone', 0.5, 1]], stock: [['molly', 4]], mature: true },
  { id: 'C2', sizeId: 't60', heater: 'heater_50', setpoint: 25, filter: 'sponge', substrate: 'bare', background: 'none', decor: [], stock: [], mature: false },
];

export function newGame(opts: { seed?: number; playerName?: string; shopName?: string } = {}): GameState {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const rng = new Rng(seed);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: 0,
    nextId: 0,
    playerName: opts.playerName?.trim() || 'Keeper',
    shopName: opts.shopName?.trim() || 'Tidepool Aquatics',
    createdAt: Date.now(),
    minute: START_MINUTE,
    money: 400,
    foodUnits: 600,
    dryGoods: { conditioner: 6, test_kit: 2, flake_food: 4, bacteria: 2 },
    prices: {},
    fish: {},
    tanks: {},
    tankOrder: [],
    customers: [],
    profiles: {},
    suppliers: {},
    orders: [],
    reputation: { quality: 35, welfare: 40, service: 35, cleanliness: 35, aquascape: 25, value: 40, knowledge: 30 },
    ledger: [],
    today: emptyLedger(1),
    log: [],
    player: { x: FLOOR1.playerStart.x, y: FLOOR1.playerStart.y, facing: 'up', floor: FLOOR1.id },
    unlocks: { floors: ['floor1'], marine: false, species: [], equipment: [] },
    objectives: initObjectives(),
    stats: { totalSales: 0, totalFishSold: 0, customersServed: 0, fishBred: 0, fishDied: 0, adviceGiven: 0, goodAdvice: 0 },
    settings: { speed: 1, tutorialSeen: false },
    flags: { devUsed: false, tutorialStep: 0 },
    lastCustomerSpawnMinute: 0,
  };

  for (const st of STARTER_TANKS) {
    const t: TankState = createTank(st.id, `Tank ${st.id}`, st.sizeId, {
      heaterId: st.heater,
      heaterSetpoint: st.setpoint ?? 25,
      filterId: st.filter,
      substrateId: st.substrate,
      backgroundId: st.background,
    });
    t.decor = st.decor.map(([defId, x, layer], i): DecorItem => ({ uid: `d_${st.id}_${i}`, defId, x, layer, flip: x > 0.5, health: 0.9 }));
    t.water.temperature = st.heater ? (st.setpoint ?? 25) : 19.5;
    if (st.mature) {
      t.water.aob = rng.range(0.75, 0.9);
      t.water.nob = rng.range(0.7, 0.85);
      t.water.nitrate = rng.range(12, 28);
      t.water.ph = 7.4 - t.water.nitrate * 0.008;
      t.algae = rng.range(0.05, 0.25);
      t.glassDirt = rng.range(0.15, 0.4);
      t.filterCondition = rng.range(0.55, 0.85);
    }
    state.tanks[t.id] = t;
    state.tankOrder.push(t.id);
    for (const [sid, n] of st.stock) {
      for (let i = 0; i < n; i++) {
        const sp = sid === 'fancy_goldfish' || sid === 'bristlenose' ? rng.range(0.4, 0.55) : undefined;
        createFish(state, rng, { speciesId: sid, origin: 'starter', originDetail: 'Inherited with the shop', tankId: t.id, purchaseCost: 0, sizeFraction: sp });
      }
    }
  }

  for (const s of SUPPLIERS) refreshSupplierStock(state, rng, s.id, 1);
  state.rngState = rng.state;
  return state;
}
