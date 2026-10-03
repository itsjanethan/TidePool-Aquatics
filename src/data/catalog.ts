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
  /** How many fish can claim a cave in it (default 1 when cave is true). */
  caveSlots?: number;
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
  /** Only for marine tanks. */
  marineOnly?: boolean;
  /** Art key used by renderer. */
  art: string;
  description: string;
  /** Plants: growth in size units per in-game day under good conditions. */
  growthRate?: number;
  /** Plants: size cap (1 = mature, above about 1.3 counts as overgrown). */
  maxSize?: number;
  /** Plants: resists being eaten by plant-unsafe fish. */
  tough?: boolean;
  /**
   * Plants: how the species propagates. Gameplay currently treats them all as
   * taking a piece off the parent; the wording and future mechanics differ.
   */
  propagation?: 'cuttings' | 'runners' | 'rhizome' | 'division';
}

/** How a plant species' propagation is described to the player. */
export const PROPAGATION_TEXT: Record<NonNullable<DecorDef['propagation']>, { verb: string; piece: string }> = {
  cuttings: { verb: 'Take a cutting', piece: 'cutting' },
  runners: { verb: 'Pot a runner plantlet', piece: 'runner plantlet' },
  rhizome: { verb: 'Divide the rhizome', piece: 'rhizome piece' },
  division: { verb: 'Split off a clump', piece: 'clump' },
};

export const DECOR: DecorDef[] = [
  { id: 'java_fern', name: 'Java Fern', kind: 'plant', cost: 6, cover: 0.12, cave: false, width: 34, height: 56, nutrientUptake: 0.6, phEffect: 0, beauty: 0.55, provides: ['plants'], art: 'fern', description: 'Tough, slow-growing fern. Fish cannot kill it.', growthRate: 0.035, maxSize: 1.6, tough: true, propagation: 'rhizome' },
  { id: 'amazon_sword', name: 'Amazon Sword', kind: 'plant', cost: 8, cover: 0.16, cave: false, width: 46, height: 80, nutrientUptake: 1.2, phEffect: 0, beauty: 0.65, provides: ['plants'], art: 'sword', description: 'Broad-leaved centrepiece plant. Hungry for nutrients.', growthRate: 0.06, maxSize: 1.7, propagation: 'runners' },
  { id: 'vallisneria', name: 'Vallisneria', kind: 'plant', cost: 5, cover: 0.14, cave: false, width: 40, height: 120, nutrientUptake: 1.0, phEffect: 0, beauty: 0.5, provides: ['plants', 'tall_plants'], art: 'vallis', description: 'Tall ribbon grass for backgrounds. Spreads quickly.', growthRate: 0.09, maxSize: 1.8, propagation: 'runners' },
  { id: 'hornwort', name: 'Hornwort', kind: 'plant', cost: 3, cover: 0.18, cave: false, width: 30, height: 90, nutrientUptake: 1.5, phEffect: 0, beauty: 0.4, provides: ['plants', 'fry_cover'], art: 'hornwort', description: 'Fast, bushy stem plant. Excellent fry cover.', growthRate: 0.13, maxSize: 1.9, propagation: 'cuttings' },
  { id: 'rotala', name: 'Rotala', kind: 'plant', cost: 5, cover: 0.12, cave: false, width: 26, height: 100, nutrientUptake: 1.3, phEffect: 0, beauty: 0.65, provides: ['plants'], art: 'rotala', description: 'Delicate stem plant with pink tips under strong light.', growthRate: 0.11, maxSize: 1.9, propagation: 'cuttings' },
  { id: 'cryptocoryne', name: 'Cryptocoryne', kind: 'plant', cost: 7, cover: 0.09, cave: false, width: 34, height: 40, nutrientUptake: 0.7, phEffect: 0, beauty: 0.55, provides: ['plants'], art: 'crypt', description: 'Low, wavy bronze-green rosettes for the foreground.', growthRate: 0.03, maxSize: 1.6, propagation: 'runners' },
  { id: 'java_moss', name: 'Java Moss', kind: 'plant', cost: 4, cover: 0.2, cave: false, width: 40, height: 20, nutrientUptake: 0.5, phEffect: 0, beauty: 0.5, provides: ['plants', 'fry_cover'], art: 'moss', description: 'Fuzzy moss clumps. Perfect cover for eggs and fry.', growthRate: 0.07, maxSize: 1.8, tough: true, propagation: 'division' },
  { id: 'anubias', name: 'Anubias', kind: 'plant', cost: 9, cover: 0.08, cave: false, width: 30, height: 30, nutrientUptake: 0.4, phEffect: 0, beauty: 0.6, provides: ['plants'], art: 'anubias', description: 'Low, dark-leaved plant. Goldfish leave it alone.', growthRate: 0.025, maxSize: 1.5, tough: true, propagation: 'rhizome' },
  { id: 'river_stone', name: 'River Stones', kind: 'rock', cost: 4, cover: 0.04, cave: false, width: 50, height: 26, nutrientUptake: 0, phEffect: 0, beauty: 0.3, provides: ['rocks'], art: 'stones', description: 'Smooth, inert pebbles.' },
  { id: 'slate_stack', name: 'Slate Stack', kind: 'rock', cost: 10, cover: 0.1, cave: true, caveSlots: 2, width: 62, height: 42, nutrientUptake: 0, phEffect: 0, beauty: 0.45, provides: ['rocks', 'cave'], art: 'slate', description: 'Layered slate with a crevice.' },
  { id: 'limestone', name: 'Holey Limestone', kind: 'rock', cost: 12, cover: 0.08, cave: true, caveSlots: 2, width: 46, height: 40, nutrientUptake: 0, phEffect: 0.25, beauty: 0.4, provides: ['rocks', 'cave'], art: 'limestone', description: 'Raises pH and hardness. Livebearers like it.' },
  { id: 'mopani', name: 'Mopani Wood', kind: 'wood', cost: 14, cover: 0.12, cave: false, width: 78, height: 62, nutrientUptake: 0, phEffect: -0.15, beauty: 0.6, provides: ['wood'], art: 'mopani', description: 'Two-tone hardwood. Softens water slightly.' },
  { id: 'spider_wood', name: 'Spider Wood', kind: 'wood', cost: 16, cover: 0.14, cave: false, width: 70, height: 80, nutrientUptake: 0, phEffect: -0.1, beauty: 0.7, provides: ['wood'], art: 'spiderwood', description: 'Branching roots that reach for the surface.' },
  { id: 'clay_cave', name: 'Clay Cave', kind: 'cave', cost: 7, cover: 0.1, cave: true, width: 30, height: 18, nutrientUptake: 0, phEffect: 0, beauty: 0.2, provides: ['cave', 'breeding_cave'], art: 'claycave', description: 'A pleco breeding tube.' },
  { id: 'live_rock', name: 'Live Rock', kind: 'rock', cost: 28, cover: 0.14, cave: true, caveSlots: 2, width: 66, height: 46, nutrientUptake: 0, phEffect: 0.1, beauty: 0.6, provides: ['rocks', 'cave', 'live_rock'], art: 'liverock', marineOnly: true, description: 'Porous reef rock full of bacteria: extra biological filtration and hiding places in marine tanks.' },
  { id: 'coconut_cave', name: 'Coconut Hut', kind: 'cave', cost: 5, cover: 0.09, cave: true, width: 34, height: 22, nutrientUptake: 0, phEffect: -0.05, beauty: 0.3, provides: ['cave'], art: 'coconut', description: 'Half a coconut shell. Rustic and cosy.' },
];

/**
 * Floating plants are simulated as surface coverage per species (0..1 of the
 * surface), not as individual items: duckweed can have thousands of fronds.
 */
export interface FloatingDef {
  id: string;
  name: string;
  /** Price of one portion when bought. */
  cost: number;
  /** Retail-ish value of one portion when sold to the trade buyer. */
  tradeValue: number;
  /** Logistic growth rate per in-game day at good light and nutrients. */
  growthRate: number;
  /** Light blocked at full coverage (0..1). */
  shade: number;
  /** Nitrate removed per day at full coverage (ppm). */
  uptake: number;
  /** Fry/shy-fish cover added at full coverage. */
  cover: number;
  art: 'duckweed' | 'frogbit' | 'redroot';
  description: string;
}

/** One portion covers this fraction of a 60cm surface (scaled by tank length). */
export const FLOATING_PORTION = 0.05;

export const FLOATING: FloatingDef[] = [
  { id: 'duckweed', name: 'Duckweed', cost: 1.5, tradeValue: 0.25, growthRate: 0.6, shade: 0.5, uptake: 2.4, cover: 0.3, art: 'duckweed', description: 'Tiny floating leaves that double in days. Great at soaking up nitrate; scoop it often or it takes over.' },
  { id: 'frogbit', name: 'Amazon Frogbit', cost: 3, tradeValue: 0.6, growthRate: 0.18, shade: 0.65, uptake: 2.5, cover: 0.38, art: 'frogbit', description: 'Round floating leaves with long trailing roots. Fry love hiding in the roots.' },
  { id: 'red_root', name: 'Red Root Floater', cost: 4, tradeValue: 0.8, growthRate: 0.14, shade: 0.45, uptake: 2, cover: 0.3, art: 'redroot', description: 'Floating rosettes that blush red in bright light, with red dangling roots.' },
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
  { id: 'heater_300', name: '300W Heater', cost: 38, watts: 300, powerPerDay: 1.1 },
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
  { id: 't200', name: 'Extra Large (200L)', litres: 200, lengthCm: 120, heightCm: 45, depthCm: 37 },
  { id: 't300', name: 'Show Tank (300L)', litres: 300, lengthCm: 150, heightCm: 50, depthCm: 40 },
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
  /** Grain look for the renderer. */
  grain?: 'sand' | 'fine' | 'gravel' | 'coarse' | 'soil' | 'bare';
  /** Plant growth multiplier (nutrient-rich soils). */
  plantBonus?: number;
}

export const SUBSTRATES: SubstrateDef[] = [
  { id: 'gravel', name: 'Natural Gravel', cost: 0, colourA: '#8a7a62', colourB: '#b4a284', provides: [], beauty: 0.3, grain: 'gravel' },
  { id: 'sand', name: 'Fine Sand', cost: 10, colourA: '#d8c69a', colourB: '#e8dab6', provides: ['sand'], beauty: 0.45, grain: 'sand' },
  { id: 'fine_gravel', name: 'Fine Gravel', cost: 9, colourA: '#9a8c74', colourB: '#c4b49a', provides: [], beauty: 0.4, grain: 'fine' },
  { id: 'river_pebbles', name: 'River Pebbles', cost: 14, colourA: '#7a7e78', colourB: '#b8a88e', provides: [], beauty: 0.5, grain: 'coarse' },
  { id: 'aqua_soil', name: 'Planted Soil', cost: 18, colourA: '#2e2218', colourB: '#4a3828', provides: ['soil'], beauty: 0.5, grain: 'soil', plantBonus: 1.35 },
  { id: 'black_gravel', name: 'Black Gravel', cost: 12, colourA: '#2a2a30', colourB: '#4a4a52', provides: [], beauty: 0.45, grain: 'gravel' },
  { id: 'bare', name: 'Bare Bottom', cost: 0, colourA: '#5a6a74', colourB: '#6a7a84', provides: [], beauty: 0, grain: 'bare' },
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
  /** Only stocked once marine is unlocked. */
  marine?: boolean;
}

/** Dry goods sold to customers as add-ons (bought by the shop in packs). */
export const DRY_GOODS: DryGoodDef[] = [
  { id: 'conditioner', name: 'Water Conditioner', wholesale: 2, retail: 4.5, description: 'Removes chlorine from tap water.' },
  { id: 'test_kit', name: 'Test Kit', wholesale: 9, retail: 18, description: 'Liquid test kit for ammonia, nitrite and nitrate.' },
  { id: 'flake_food', name: 'Flake Food', wholesale: 1.8, retail: 3.99, description: 'Staple food for community fish.' },
  { id: 'bacteria', name: 'Bacteria Starter', wholesale: 3, retail: 6.5, description: 'Helps a brand new tank begin to cycle.' },
  { id: 'salt_mix', name: 'Marine Salt Mix', wholesale: 4, retail: 9, description: 'Reef salt for mixing new saltwater. Needed for marine water changes.', marine: true },
  { id: 'ro_water', name: 'RO Water (25L)', wholesale: 1.5, retail: 4, description: 'Pure reverse-osmosis water for topping up evaporation in marine tanks (salt does not evaporate).', marine: true },
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
const FLOAT_BY_ID = byId(FLOATING);

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
export const getFloating = (id: string) => must(FLOAT_BY_ID, id, 'floating plant');
