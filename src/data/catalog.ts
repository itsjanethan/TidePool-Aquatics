/**
 * Data catalogues for decor, equipment, tank sizes, dry goods and substrates.
 * Pure data. Gameplay effects are interpreted by sim/aquascape.ts, sim/water.ts.
 */

export type DecorKind = 'plant' | 'rock' | 'wood' | 'cave' | 'ornament';

export interface DecorDef {
  id: string;
  name: string;
  kind: DecorKind;
  cost: number;
  /** 0..1 cover contribution (hiding places). */
  cover: number;
  /** Provides a cave/territory. */
  cave: boolean;
  /** Visual width in tank-view pixels at reference scale. */
  width: number;
  height: number;
  /** Nitrate uptake (ppm/day) for live plants. */
  nutrientUptake: number;
  /** pH push per item (wood negative, limestone positive). */
  phEffect: number;
  /** 0..1 aesthetic value. */
  beauty: number;
  /** Tags used by species needs (needs_wood, needs_cave). */
  provides: string[];
  /** Art key used by renderer. */
  art: string;
  description: string;
  /** Plants: growth in size units per in-game day under good conditions. */
  growthRate?: number;
  /** Plants: size cap (1 = mature, above about 1.3 counts as overgrown). */
  maxSize?: number;
  /** Plants: resists being eaten by plant-unsafe fish. */
  tough?: boolean;
}

export const DECOR: DecorDef[] = [
  { id: 'java_fern', name: 'Java Fern', kind: 'plant', cost: 6, cover: 0.12, cave: false, width: 34, height: 56, nutrientUptake: 0.6, phEffect: 0, beauty: 0.55, provides: ['plants'], art: 'fern', description: 'Tough, slow-growing fern. Fish cannot kill it.', growthRate: 0.035, maxSize: 1.6, tough: true },
  { id: 'amazon_sword', name: 'Amazon Sword', kind: 'plant', cost: 8, cover: 0.16, cave: false, width: 46, height: 80, nutrientUptake: 1.2, phEffect: 0, beauty: 0.65, provides: ['plants'], art: 'sword', description: 'Broad-leaved centrepiece plant. Hungry for nutrients.', growthRate: 0.06, maxSize: 1.7 },
  { id: 'vallisneria', name: 'Vallisneria', kind: 'plant', cost: 5, cover: 0.14, cave: false, width: 40, height: 120, nutrientUptake: 1.0, phEffect: 0, beauty: 0.5, provides: ['plants', 'tall_plants'], art: 'vallis', description: 'Tall ribbon grass for backgrounds. Spreads quickly.', growthRate: 0.09, maxSize: 1.8 },
  { id: 'hornwort', name: 'Hornwort', kind: 'plant', cost: 3, cover: 0.18, cave: false, width: 30, height: 90, nutrientUptake: 1.5, phEffect: 0, beauty: 0.4, provides: ['plants', 'fry_cover'], art: 'hornwort', description: 'Fast, bushy stem plant. Excellent fry cover.', growthRate: 0.13, maxSize: 1.9 },
  { id: 'anubias', name: 'Anubias', kind: 'plant', cost: 9, cover: 0.08, cave: false, width: 30, height: 30, nutrientUptake: 0.4, phEffect: 0, beauty: 0.6, provides: ['plants'], art: 'anubias', description: 'Low, dark-leaved plant. Goldfish leave it alone.', growthRate: 0.025, maxSize: 1.5, tough: true },
  { id: 'river_stone', name: 'River Stones', kind: 'rock', cost: 4, cover: 0.04, cave: false, width: 40, height: 18, nutrientUptake: 0, phEffect: 0, beauty: 0.3, provides: ['rocks'], art: 'stones', description: 'Smooth, inert pebbles.' },
  { id: 'slate_stack', name: 'Slate Stack', kind: 'rock', cost: 10, cover: 0.1, cave: true, width: 52, height: 34, nutrientUptake: 0, phEffect: 0, beauty: 0.45, provides: ['rocks', 'cave'], art: 'slate', description: 'Layered slate with a crevice.' },
  { id: 'limestone', name: 'Holey Limestone', kind: 'rock', cost: 12, cover: 0.08, cave: true, width: 46, height: 40, nutrientUptake: 0, phEffect: 0.25, beauty: 0.4, provides: ['rocks', 'cave'], art: 'limestone', description: 'Raises pH and hardness. Livebearers like it.' },
  { id: 'mopani', name: 'Mopani Wood', kind: 'wood', cost: 14, cover: 0.12, cave: false, width: 64, height: 46, nutrientUptake: 0, phEffect: -0.15, beauty: 0.6, provides: ['wood'], art: 'mopani', description: 'Two-tone hardwood. Softens water slightly.' },
  { id: 'spider_wood', name: 'Spider Wood', kind: 'wood', cost: 16, cover: 0.14, cave: false, width: 70, height: 80, nutrientUptake: 0, phEffect: -0.1, beauty: 0.7, provides: ['wood'], art: 'spiderwood', description: 'Branching roots that reach for the surface.' },
  { id: 'clay_cave', name: 'Clay Cave', kind: 'cave', cost: 7, cover: 0.1, cave: true, width: 30, height: 18, nutrientUptake: 0, phEffect: 0, beauty: 0.2, provides: ['cave', 'breeding_cave'], art: 'claycave', description: 'A pleco breeding tube.' },
  { id: 'coconut_cave', name: 'Coconut Hut', kind: 'cave', cost: 5, cover: 0.09, cave: true, width: 34, height: 22, nutrientUptake: 0, phEffect: -0.05, beauty: 0.3, provides: ['cave'], art: 'coconut', description: 'Half a coconut shell. Rustic and cosy.' },
];

export interface FilterDef {
  id: string;
  name: string;
  cost: number;
  /** Ammonia processing capacity in mg/hour when fully mature and clean. */
  capacity: number;
  /** Surface agitation contribution 0..1. */
  aeration: number;
  /** Max litres it is rated for. */
  ratedLitres: number;
  /** Mechanical filtration 0..1 (clears cloudiness and detritus). */
  mechanical: number;
  powerPerDay: number;
}

export const FILTERS: FilterDef[] = [
  { id: 'sponge', name: 'Sponge Filter', cost: 8, capacity: 2.6, aeration: 0.35, ratedLitres: 60, mechanical: 0.3, powerPerDay: 0.1 },
  { id: 'hang_on', name: 'Hang-on Filter', cost: 32, capacity: 5.5, aeration: 0.25, ratedLitres: 120, mechanical: 0.6, powerPerDay: 0.2 },
  { id: 'canister', name: 'Canister Filter', cost: 85, capacity: 11, aeration: 0.15, ratedLitres: 300, mechanical: 0.85, powerPerDay: 0.35 },
];

export interface HeaterDef {
  id: string;
  name: string;
  cost: number;
  /** Max degrees above ambient it can hold for its rated volume. */
  watts: number;
  powerPerDay: number;
}

export const HEATERS: HeaterDef[] = [
  { id: 'heater_50', name: '50W Heater', cost: 14, watts: 50, powerPerDay: 0.35 },
  { id: 'heater_150', name: '150W Heater', cost: 24, watts: 150, powerPerDay: 0.6 },
];

export const AIR_PUMP = { id: 'air_stone', name: 'Air Pump & Stone', cost: 9, powerPerDay: 0.05 };

export interface TankSizeDef {
  id: string;
  name: string;
  litres: number;
  lengthCm: number;
  heightCm: number;
  depthCm: number;
}

export const TANK_SIZES: TankSizeDef[] = [
  { id: 't40', name: 'Small (40L)', litres: 40, lengthCm: 50, heightCm: 30, depthCm: 27 },
  { id: 't60', name: 'Standard (60L)', litres: 60, lengthCm: 60, heightCm: 33, depthCm: 30 },
  { id: 't120', name: 'Large (120L)', litres: 120, lengthCm: 100, heightCm: 40, depthCm: 30 },
];

export interface SubstrateDef {
  id: string;
  name: string;
  cost: number;
  colourA: string;
  colourB: string;
  /** Tags provided (needs_sand). */
  provides: string[];
  beauty: number;
}

export const SUBSTRATES: SubstrateDef[] = [
  { id: 'gravel', name: 'Natural Gravel', cost: 0, colourA: '#8a7a62', colourB: '#b4a284', provides: [], beauty: 0.3 },
  { id: 'sand', name: 'Fine Sand', cost: 10, colourA: '#d8c69a', colourB: '#e8dab6', provides: ['sand'], beauty: 0.45 },
  { id: 'black_gravel', name: 'Black Gravel', cost: 12, colourA: '#2a2a30', colourB: '#4a4a52', provides: [], beauty: 0.45 },
  { id: 'bare', name: 'Bare Bottom', cost: 0, colourA: '#5a6a74', colourB: '#6a7a84', provides: [], beauty: 0 },
];

export interface BackgroundDef {
  id: string;
  name: string;
  cost: number;
  beauty: number;
}

export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'none', name: 'Clear Glass', cost: 0, beauty: 0 },
  { id: 'black', name: 'Black Film', cost: 4, beauty: 0.3 },
  { id: 'blue', name: 'Blue Gradient', cost: 4, beauty: 0.25 },
  { id: 'rocky', name: 'Rock Wall Print', cost: 8, beauty: 0.4 },
];

export interface DryGoodDef {
  id: string;
  name: string;
  wholesale: number;
  retail: number;
  description: string;
}

/** Dry goods sold to customers as add-ons (bought by the shop in packs). */
export const DRY_GOODS: DryGoodDef[] = [
  { id: 'conditioner', name: 'Water Conditioner', wholesale: 2, retail: 4.5, description: 'Removes chlorine from tap water.' },
  { id: 'test_kit', name: 'Test Kit', wholesale: 9, retail: 18, description: 'Liquid test kit for ammonia, nitrite and nitrate.' },
  { id: 'flake_food', name: 'Flake Food', wholesale: 1.8, retail: 3.99, description: 'Staple food for community fish.' },
  { id: 'bacteria', name: 'Bacteria Starter', wholesale: 3, retail: 6.5, description: 'Helps a brand new tank begin to cycle.' },
];

/** Shop fish food stock: one tub gives this many food units. */
export const FOOD_TUB = { units: 400, cost: 6 };

const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
const DECOR_BY_ID = byId(DECOR);
const FILTER_BY_ID = byId(FILTERS);
const HEATER_BY_ID = byId(HEATERS);
const SIZE_BY_ID = byId(TANK_SIZES);
const SUB_BY_ID = byId(SUBSTRATES);
const BG_BY_ID = byId(BACKGROUNDS);
const DRY_BY_ID = byId(DRY_GOODS);

function must<T>(m: Map<string, T>, id: string, kind: string): T {
  const v = m.get(id);
  if (!v) throw new Error(`Unknown ${kind}: ${id}`);
  return v;
}

export const getDecor = (id: string) => must(DECOR_BY_ID, id, 'decor');
export const getFilter = (id: string) => must(FILTER_BY_ID, id, 'filter');
export const getHeater = (id: string) => must(HEATER_BY_ID, id, 'heater');
export const getTankSize = (id: string) => must(SIZE_BY_ID, id, 'tank size');
export const getSubstrate = (id: string) => must(SUB_BY_ID, id, 'substrate');
export const getBackground = (id: string) => must(BG_BY_ID, id, 'background');
export const getDryGood = (id: string) => must(DRY_BY_ID, id, 'dry good');
