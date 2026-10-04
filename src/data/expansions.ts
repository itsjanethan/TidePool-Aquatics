/**
 * Shop levels and expansions. Each expansion opens a floor (with its tanks),
 * unlocks species and costs money once requirements are met. Requirements
 * use real progress: reputation, customers served, capital and goals.
 */
import type { FloorId } from './floors';

export interface ExpansionTank {
  id: string;
  sizeId: string;
  heater: string | null;
  setpoint?: number;
  filter: string;
  substrate: string;
  background: string;
  waterType?: 'freshwater' | 'marine';
  decor: Array<[string, number, 0 | 1 | 2]>;
  /** Reef equipment fitted at build time. */
  reef?: { light: string; wavemaker: number };
  airStone?: boolean;
  /** Starting chemistry for active-soil tanks (pH and hardness already buffered). */
  water?: { ph?: number; gh?: number; nitrate?: number };
}

export interface ExpansionDef {
  id: string;
  level: number;
  floor: FloorId;
  name: string;
  blurb: string;
  cost: number;
  /** Extra daily rent once built. */
  rent: number;
  requires: { reputation: number; customersServed: number; capital: number; objectives: string[]; fishBred?: number; knowledge?: number };
  /** What opens up, for the progression screen. */
  unlocks: string[];
  tanks: ExpansionTank[];
}

export const EXPANSIONS: ExpansionDef[] = [
  {
    id: 'coldwater', level: 2, floor: 'upstairs', name: 'Coldwater & Temperate Floor',
    blurb: 'Open the upstairs room: six big unheated tanks for hardy temperate fish.',
    cost: 1500, rent: 12,
    requires: { reputation: 45, customersServed: 40, capital: 1800, objectives: ['serve_10', 'rep_50'] },
    unlocks: ['Upstairs floor with 6 large tanks (200L and 300L)', 'Medaka, rosy barb, hillstream loach and paradise fish', 'Better job applicants'],
    tanks: [
      { id: 'U1', sizeId: 't200', heater: null, filter: 'canister', substrate: 'river_pebbles', background: 'rocky', decor: [['river_stone', 0.3, 1], ['vallisneria', 0.8, 0]] },
      { id: 'U2', sizeId: 't200', heater: null, filter: 'canister', substrate: 'gravel', background: 'none', decor: [['hornwort', 0.2, 0], ['anubias', 0.6, 1]] },
      { id: 'U3', sizeId: 't200', heater: null, filter: 'canister', substrate: 'sand', background: 'blue', decor: [['vallisneria', 0.2, 0]] },
      { id: 'U4', sizeId: 't200', heater: null, filter: 'canister', substrate: 'river_pebbles', background: 'rocky', decor: [['slate_stack', 0.5, 1]] },
      { id: 'U5', sizeId: 't300', heater: null, filter: 'canister', substrate: 'fine_gravel', background: 'black', decor: [['mopani', 0.4, 1], ['java_fern', 0.7, 0]] },
      { id: 'U6', sizeId: 't300', heater: null, filter: 'canister', substrate: 'aqua_soil', background: 'none', decor: [['amazon_sword', 0.3, 0], ['rotala', 0.8, 0]] },
    ],
  },
  {
    id: 'advanced', level: 3, floor: 'marine', name: 'Advanced Aquatics & Marine',
    blurb: 'A specialist floor: soft-water tropicals and the shop\'s first marine systems.',
    cost: 4000, rent: 20,
    requires: { reputation: 55, customersServed: 140, capital: 4500, objectives: ['aquascape'], fishBred: 15, knowledge: 55 },
    unlocks: ['Specialist floor with 6 tanks, 3 of them marine', 'German blue ram, clownfish, royal gramma and Banggai cardinal', 'Marine supplies: salt, RO water, live rock and skimmers'],
    tanks: [
      { id: 'M1', sizeId: 't200', heater: 'heater_300', setpoint: 25, filter: 'canister', substrate: 'sand', background: 'blue', waterType: 'marine', decor: [['live_rock', 0.3, 1], ['live_rock', 0.7, 1]] },
      { id: 'M2', sizeId: 't200', heater: 'heater_300', setpoint: 25, filter: 'canister', substrate: 'sand', background: 'blue', waterType: 'marine', decor: [['live_rock', 0.5, 1]] },
      { id: 'M3', sizeId: 't200', heater: 'heater_300', setpoint: 25, filter: 'canister', substrate: 'sand', background: 'black', waterType: 'marine', decor: [['live_rock', 0.4, 1]] },
      { id: 'M4', sizeId: 't120', heater: 'heater_150', setpoint: 28, filter: 'hang_on', substrate: 'sand', background: 'black', decor: [['spider_wood', 0.4, 0], ['amazon_sword', 0.75, 0], ['clay_cave', 0.2, 1]] },
      { id: 'M5', sizeId: 't120', heater: 'heater_150', setpoint: 27, filter: 'hang_on', substrate: 'aqua_soil', background: 'black', decor: [['mopani', 0.5, 1], ['cryptocoryne', 0.2, 2]] },
      { id: 'M6', sizeId: 't300', heater: 'heater_300', setpoint: 26, filter: 'canister', substrate: 'aqua_soil', background: 'rocky', decor: [['amazon_sword', 0.2, 0], ['spider_wood', 0.6, 0]] },
    ],
  },
  {
    id: 'basement', level: 4, floor: 'basement', name: 'Basement Warehouse & Retail',
    blurb: 'Convert the basement: equipment retail racks, quarantine tanks and storage.',
    cost: 3000, rent: 15,
    requires: { reputation: 60, customersServed: 260, capital: 3500, objectives: [] },
    unlocks: ['Equipment retail: tanks, filters, heaters and setup bundles', 'Customers who come in for equipment', 'Stock capacity 40 → 240 items', 'Two quarantine tanks'],
    tanks: [
      { id: 'Q1', sizeId: 't120', heater: 'heater_150', setpoint: 25, filter: 'sponge', substrate: 'bare', background: 'none', decor: [['java_fern', 0.5, 1]] },
      { id: 'Q2', sizeId: 't120', heater: 'heater_150', setpoint: 25, filter: 'sponge', substrate: 'bare', background: 'none', decor: [['anubias', 0.5, 1]] },
    ],
  },
  {
    id: 'reef', level: 5, floor: 'reef', name: 'Reef & Invertebrates',
    blurb: 'Coral reef systems with reef lighting and wavemakers, a frag rack, and nano tanks for shrimp and snails.',
    cost: 6500, rent: 25,
    requires: { reputation: 64, customersServed: 380, capital: 7000, objectives: [], fishBred: 30, knowledge: 60 },
    unlocks: [
      'Reef floor: three reef systems with reef LEDs and wavemakers, three nano tanks',
      'Corals: soft corals, LPS and SPS, with light, flow and chemistry needs',
      'Coral fragging and a frag rack customers buy from',
      'Cherry and crystal shrimp, Amano shrimp, nerite and mystery snails, cleaner shrimp, hermit crabs, turbo snails',
      'Reef supplements: alkalinity, calcium, magnesium; dosing pumps',
    ],
    tanks: [
      { id: 'R1', water: { nitrate: 3 }, sizeId: 't200', heater: 'heater_300', setpoint: 25.5, filter: 'canister', substrate: 'sand', background: 'blue', waterType: 'marine', reef: { light: 'reef_led', wavemaker: 1 }, decor: [['live_rock', 0.14, 1], ['reef_rock', 0.5, 1], ['live_rock', 0.86, 1], ['zoanthids', 0.42, 1], ['hammer', 0.58, 1], ['mushroom', 0.18, 2], ['gsp', 0.86, 1]] },
      { id: 'R2', water: { nitrate: 3 }, sizeId: 't300', heater: 'heater_300', setpoint: 25.5, filter: 'canister', substrate: 'sand', background: 'black', waterType: 'marine', reef: { light: 'reef_led_pro', wavemaker: 2 }, decor: [['live_rock', 0.12, 1], ['reef_rock', 0.42, 1], ['live_rock', 0.76, 1], ['live_rock', 0.9, 1], ['montipora', 0.42, 1], ['gsp', 0.83, 1]] },
      { id: 'R3', water: { nitrate: 3 }, sizeId: 't120', heater: 'heater_150', setpoint: 25.5, filter: 'canister', substrate: 'sand', background: 'black', waterType: 'marine', reef: { light: 'reef_led', wavemaker: 1 }, decor: [['live_rock', 0.25, 1], ['live_rock', 0.5, 1], ['live_rock', 0.75, 1]] },
      { id: 'F1', sizeId: 't60', heater: 'heater_50', setpoint: 23, filter: 'sponge', substrate: 'aqua_soil', background: 'black', decor: [['java_moss', 0.3, 2], ['java_fern', 0.65, 1], ['river_stone', 0.5, 2]] },
      { id: 'F2', sizeId: 't60', heater: 'heater_50', setpoint: 24, filter: 'sponge', substrate: 'fine_gravel', background: 'none', decor: [['anubias', 0.4, 1], ['limestone', 0.75, 1]] },
      { id: 'F3', sizeId: 't120', heater: 'heater_150', setpoint: 22, filter: 'sponge', substrate: 'shrimp_soil', background: 'black', water: { ph: 6.3, gh: 5 }, decor: [['java_moss', 0.25, 2], ['java_moss', 0.6, 2], ['cryptocoryne', 0.85, 1], ['mopani', 0.45, 0]] },
    ],
  },
];

export function getExpansion(id: string): ExpansionDef {
  const e = EXPANSIONS.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown expansion ${id}`);
  return e;
}
