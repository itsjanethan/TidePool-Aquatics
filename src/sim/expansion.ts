/**
 * Shop progression: checks expansion requirements and builds expansions
 * (new floor, its tanks, species and features). Pure game-state logic.
 */
import { getDecor } from '../data/catalog';
import { EXPANSIONS, getExpansion, type ExpansionDef } from '../data/expansions';
import { spend } from './economy';
import { idleRefusal } from './idle';
import { overallReputation } from './reputation';
import { createTank, type ActionResult } from './tank';
import { defaultTerra } from './terrarium';
import { PALUDARIUM_WATER, VIVARIUM_ROOM_TEMP } from '../data/terra';
import type { DecorItem, GameState } from './types';
import { OBJECTIVES } from './progression';

export interface Requirement {
  label: string;
  have: string;
  need: string;
  met: boolean;
}

export interface ExpansionStatus {
  def: ExpansionDef;
  built: boolean;
  /** The previous level is built (expansions open in order). */
  available: boolean;
  requirements: Requirement[];
  canBuy: boolean;
}

export function isBuilt(state: GameState, id: string): boolean {
  return state.unlocks.floors.includes(getExpansion(id).floor);
}

export function expansionStatus(state: GameState, id: string): ExpansionStatus {
  const def = getExpansion(id);
  const built = isBuilt(state, id);
  const available = def.level === state.shopLevel + 1 || built;
  const rep = overallReputation(state);
  const r = def.requires;
  const reqs: Requirement[] = [
    { label: 'Reputation', have: `${Math.round(rep)}`, need: `${r.reputation}`, met: rep >= r.reputation },
    { label: 'Customers served', have: `${state.stats.customersServed}`, need: `${r.customersServed}`, met: state.stats.customersServed >= r.customersServed },
    { label: 'Capital', have: `£${Math.floor(state.money)}`, need: `£${r.capital}`, met: state.money >= r.capital },
  ];
  if (r.knowledge) reqs.push({ label: 'Expert Advice reputation', have: `${Math.round(state.reputation.knowledge)}`, need: `${r.knowledge}`, met: state.reputation.knowledge >= r.knowledge });
  if (r.fishBred) reqs.push({ label: 'Fish bred', have: `${state.stats.fishBred}`, need: `${r.fishBred}`, met: state.stats.fishBred >= r.fishBred });
  for (const o of r.objectives) {
    const def2 = OBJECTIVES.find((x) => x.id === o);
    reqs.push({ label: `Goal: ${def2?.title ?? o}`, have: state.objectives[o]?.done ? 'done' : 'not yet', need: 'done', met: !!state.objectives[o]?.done });
  }
  if (!available && !built) reqs.unshift({ label: `Shop level ${def.level - 1}`, have: `level ${state.shopLevel}`, need: `level ${def.level - 1}`, met: false });
  return { def, built, available, requirements: reqs, canBuy: !built && available && reqs.every((q) => q.met) };
}

export function allExpansions(state: GameState): ExpansionStatus[] {
  return EXPANSIONS.map((e) => expansionStatus(state, e.id));
}

/** Pays for and opens an expansion: floor, tanks, species and features. */
export function buyExpansion(state: GameState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const st = expansionStatus(state, id);
  if (st.built) return { ok: false, message: 'Already built.', minutes: 0 };
  if (!st.canBuy) return { ok: false, message: 'Requirements not met yet.', minutes: 0 };
  const def = st.def;
  if (!spend(state, def.cost, `Expansion: ${def.name}`)) return { ok: false, message: 'Not enough money.', minutes: 0 };
  state.unlocks.floors.push(def.floor);
  state.shopLevel = Math.max(state.shopLevel, def.level);
  if (def.floor === 'marine') state.unlocks.marine = true;
  for (const et of def.tanks) {
    if (state.tanks[et.id]) continue;
    const t = createTank(et.id, `Tank ${et.id}`, et.sizeId, {
      heaterId: et.heater,
      heaterSetpoint: et.setpoint ?? 25,
      filterId: et.filter,
      substrateId: et.substrate,
      backgroundId: et.background,
    });
    t.waterType = et.waterType ?? 'freshwater';
    t.decor = et.decor.map(([defId, x, layer], i): DecorItem => ({ uid: `d_${et.id}_${i}`, defId, x, layer, flip: x > 0.5, health: 1, size: getDecor(defId).kind === 'plant' || getDecor(defId).kind === 'coral' ? 0.7 : 1 }));
    if (et.reef) t.reef = { ...et.reef };
    if (et.habitat) {
      // Enclosures: a climate instead of (or, in a paludarium, beside) the water.
      t.habitat = et.habitat;
      t.terra = { ...defaultTerra(et.habitat), ...et.terra };
      if (et.habitat === 'paludarium') t.litres = Math.round(t.litres * PALUDARIUM_WATER);
    }
    if (et.airStone) t.airStone = true;
    t.ownedSubstrates = [et.substrate];
    t.ownedBackgrounds = [et.background];
    // Enclosures (and paludarium pools) start at the heated vivarium room's temperature.
    t.water.temperature = et.heater ? (et.setpoint ?? 25) : et.habitat ? VIVARIUM_ROOM_TEMP : 17;
    // New systems arrive with seeded (half-cycled) filters, but they still need checking.
    t.water.aob = 0.45;
    t.water.nob = 0.35;
    if (t.waterType === 'marine') {
      t.water.salinity = 35;
      t.water.ph = 8.2;
      t.water.gh = 14;
      t.skimmer = true;
    }
    if (et.water) {
      // Active-soil tanks start buffered; reef systems start with a little nitrate for the corals.
      if (et.water.ph !== undefined) t.water.ph = et.water.ph;
      if (et.water.gh !== undefined) t.water.gh = et.water.gh;
      if (et.water.nitrate !== undefined) t.water.nitrate = et.water.nitrate;
    }
    state.tanks[t.id] = t;
    state.tankOrder.push(t.id);
  }
  return { ok: true, message: `${def.name} is open! New tanks are on the ${def.floor === 'basement' ? 'lower' : 'upper'} floor.`, minutes: 0 };
}

/** Extra daily rent for built expansions. */
export function expansionRent(state: GameState): number {
  return EXPANSIONS.filter((e) => state.unlocks.floors.includes(e.floor)).reduce((s, e) => s + e.rent, 0);
}
