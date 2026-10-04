/**
 * EnclosureSystem: vivariums (humid, planted), terrariums (dry) and
 * paludariums (land plus a freshwater pool).
 *
 * An enclosure has a climate (humidity, air temperature, a basking spot
 * under a lamp, ventilation), a substrate that holds moisture, and
 * husbandry state (mould, waste, water dish, calcium in the diet, loose
 * feeder insects). Land animals read their needs from `SpeciesDef.terra`.
 * Paludariums also run the normal water simulation for their pool: fish
 * live there, and amphibians that sit in it feel its ammonia and nitrite.
 *
 * `terraIssues` (needs vs climate) is the single source of truth for land
 * care: stress, health damage, diagnostics and the UI all read it.
 */
import { clamp, clamp01, round, smooth } from '../core/math';
import { getDecor, getSubstrate, getTankSize } from '../data/catalog';
import { getSpecies } from '../data/species';
import type { SpeciesDef } from '../data/speciesTypes';
import { PALUDARIUM_WATER, TERRA_EQUIPMENT, VENT_LEVELS, VIVARIUM_ROOM_TEMP } from '../data/terra';
import { spend } from './economy';
import { appetite, eat, fishInTank } from './fish';
import { idleRefusal } from './idle';
import type { FishEntity, GameState, TankState, TerraState } from './types';

export interface TerraActionResult {
  ok: boolean;
  message: string;
  minutes: number;
}
const ok = (message: string, minutes: number): TerraActionResult => ({ ok: true, message, minutes });
const fail = (message: string): TerraActionResult => ({ ok: false, message, minutes: 0 });

export const ROOM_HUMIDITY = 45;

export function isEnclosure(t: Pick<TankState, 'habitat'>): boolean {
  return !!t.habitat;
}
/** Vivarium or terrarium: no water body at all. */
export function isLandOnly(t: Pick<TankState, 'habitat'>): boolean {
  return t.habitat === 'vivarium' || t.habitat === 'terrarium';
}
export function isPaludarium(t: Pick<TankState, 'habitat'>): boolean {
  return t.habitat === 'paludarium';
}
export function livesOn(sp: SpeciesDef): 'water' | 'land' | 'amphibious' {
  return sp.lives ?? 'water';
}
export function isLandAnimal(sp: SpeciesDef): boolean {
  return livesOn(sp) !== 'water';
}

/** Why a species cannot live in this tank's habitat (null when it can). Water type is checked separately. */
export function habitatRefusal(sp: SpeciesDef, tank: Pick<TankState, 'habitat' | 'name' | 'waterType'>): string | null {
  const lives = livesOn(sp);
  if (lives === 'water' && isLandOnly(tank)) return `${sp.commonName} lives in water; ${tank.name} is a ${tank.habitat} with no water.`;
  if (lives === 'water' && isPaludarium(tank) && sp.waterType !== 'freshwater') return `${sp.commonName} needs ${sp.waterType} water; a paludarium pool is freshwater.`;
  if (lives === 'land' && !tank.habitat) return `${sp.commonName} lives on land: it needs a vivarium or terrarium, not an aquarium.`;
  if (lives === 'amphibious' && !isPaludarium(tank)) return `${sp.commonName} needs a paludarium: land to climb out on and a pool to sit in.`;
  return null;
}

/** Heated for suitability checks: a heater in water, a basking lamp in an enclosure. */
export function setupHeated(t: TankState): boolean {
  return t.habitat ? t.terra?.heatLamp !== null && t.terra?.heatLamp !== undefined : !!t.heaterId;
}

/** Enclosure air volume in litres (a paludarium's land part). */
export function landVolume(tank: TankState): number {
  const full = getTankSize(tank.sizeId).litres;
  return isPaludarium(tank) ? Math.round(full * (1 - PALUDARIUM_WATER)) : full;
}

export function defaultTerra(habitat: NonNullable<TankState['habitat']>): TerraState {
  const humid = habitat !== 'terrarium';
  return {
    humidity: humid ? 75 : 45,
    airTemp: VIVARIUM_ROOM_TEMP,
    moisture: humid ? 0.7 : 0.2,
    mould: 0,
    waste: 0,
    vent: humid ? 0.25 : 0.8,
    mister: humid,
    heatLamp: null,
    uvb: false,
    bioactive: humid,
    calcium: 0.8,
    dish: 1,
  };
}

export function terraOf(tank: TankState): TerraState {
  return (tank.terra ??= defaultTerra(tank.habitat ?? 'vivarium'));
}

/** Basking spot temperature (lamp on in the day, thermostat-limited); otherwise the air. */
export function hotspot(tank: TankState): number {
  const t = terraOf(tank);
  if (t.heatLamp === null || !tank.lightOn) return t.airTemp;
  return Math.max(t.airTemp, Math.min(t.heatLamp, t.airTemp + 14));
}

/** Temperature an animal actually lives at: baskers move between the air and the warm spot. */
export function effectiveTemp(sp: SpeciesDef, tank: TankState): number {
  const t = terraOf(tank);
  if (!sp.terra?.basking) return t.airTemp;
  const ideal = sp.temperature.ideal;
  return clamp(ideal, t.airTemp, hotspot(tank));
}

/** Plants, branches, litter and climbing items in the enclosure. */
function scapeCounts(tank: TankState): { plants: number; climbing: number; litter: number; hides: number; warmHide: boolean } {
  let plants = 0;
  let climbing = 0;
  let litter = 0;
  let hides = 0;
  let warmHide = false;
  for (const d of tank.decor) {
    const def = getDecor(d.defId);
    if (def.kind === 'plant') plants++;
    if (def.provides.includes('climbing')) climbing++;
    if (def.provides.includes('litter')) litter++;
    if (def.cave) hides += def.caveSlots ?? 1;
    if (def.provides.includes('warm_hide')) warmHide = true;
  }
  return { plants, climbing, litter, hides, warmHide };
}

// ---------------------------------------------------------------------------
// Climate tick

export interface TerraTickContext {
  ambient: number;
  daylight: boolean;
}

/** Hourly enclosure climate and husbandry. Deterministic. */
export function tickTerrarium(state: GameState, tank: TankState, dtHours: number, ctx: TerraTickContext): void {
  const t = terraOf(tank);
  const alive = fishInTank(state, tank.id).filter((f) => isLandAnimal(getSpecies(f.speciesId)));
  const sc = scapeCounts(tank);
  const sub = getSubstrate(tank.substrateId).land?.moisture ?? 0.6;
  const lampOn = t.heatLamp !== null && ctx.daylight;
  // Moisture: mister and litter keep it up; ventilation, heat and dry substrates dry it out.
  // The automatic mister tops the substrate up toward damp, not to a swamp.
  const mist = t.mister && ctx.daylight ? 0.035 * Math.max(0, 0.85 - t.moisture) : 0;
  const evap = 0.0075 * (0.5 + t.vent) * (lampOn ? 1.6 : 1) * (1.4 - sub * 0.6) * (sc.plants || sc.litter ? 0.85 : 1);
  t.moisture = clamp01(t.moisture + (mist - evap * (0.2 + t.moisture)) * dtHours);
  // Humidity relaxes toward what the damp substrate, the pool and the vents allow.
  // A full water dish adds a little damp to a dry terrarium.
  const target = clamp(ROOM_HUMIDITY - 4 + t.moisture * 55 + (isPaludarium(tank) ? 8 : 0) + (isLandOnly(tank) ? t.dish * 4 : 0) - t.vent * 14 + Math.min(8, sc.plants * 2), 20, 100);
  t.humidity = smooth(t.humidity, target, 0.6, dtHours);
  // Air temperature: the room, lifted a little by the lamp in the day.
  const airTarget = ctx.ambient + (lampOn ? 3.5 : 0.5) - (t.vent > 0.6 ? 0.5 : 0);
  t.airTemp = smooth(t.airTemp, airTarget, 0.3, dtHours);
  // Waste: droppings and uneaten insects that die; the clean-up crew eats it.
  const droppings = alive.reduce((s, f) => s + f.sizeCm * 0.00025, 0) * (100 / landVolume(tank));
  const deadFeeders = isLandOnly(tank) ? tank.food * 0.04 : 0;
  if (isLandOnly(tank)) tank.food = Math.max(0, tank.food - tank.food * 0.04 * dtHours);
  t.waste = clamp01(t.waste + (droppings + deadFeeders * 0.05 - (t.bioactive ? 0.006 : 0)) * dtHours);
  // Mould: warm, stagnant, wet air with waste to feed on.
  const stale = t.humidity > 85 && t.vent < 0.45;
  const grow = stale ? 0.012 * (0.5 + t.waste * 2) * (1 - t.vent) : 0;
  const clear = 0.004 * t.vent + (t.bioactive ? 0.006 : 0);
  t.mould = clamp01(t.mould + (grow - clear) * dtHours);
  // Water dish fouls and dries over about three days (faster under a lamp).
  t.dish = clamp01(t.dish - (1 / 72) * (lampOn ? 1.3 : 1) * dtHours);
  // Calcium in the diet is used up; UVB makes it last.
  const needy = alive.some((f) => getSpecies(f.speciesId).terra?.calcium);
  if (needy) t.calcium = clamp01(t.calcium - (t.uvb ? 0.04 : 0.07) * (dtHours / 24));
  // Land plants grow with light and damp air; very dry air or deep shade holds them back.
  for (const d of tank.decor) {
    const def = getDecor(d.defId);
    if (def.kind !== 'plant' || !def.land) continue;
    const damp = clamp((t.humidity - 35) / 40, 0, 1);
    const lit = tank.lightOn ? 1 : 0;
    d.health = clamp01(d.health + (damp > 0.3 ? 0.004 : -0.006) * dtHours);
    d.size = clamp(d.size + ((def.growthRate ?? 0.03) / 12) * lit * damp * d.health * Math.max(0, 1 - d.size / (def.maxSize ?? 1.5)) * dtHours * 1.4, 0.1, def.maxSize ?? 1.5);
  }
  // Glass: condensation and smears.
  tank.glassDirt = clamp01(tank.glassDirt + (0.02 + (t.humidity > 85 ? 0.03 : 0)) * (dtHours / 24));
  // Land-only enclosures have no water to cloud or grow algae in.
  if (isLandOnly(tank)) {
    tank.algae = Math.max(0, tank.algae - 0.01 * dtHours);
    tank.water.temperature = t.airTemp;
  }
}

// ---------------------------------------------------------------------------
// Needs vs conditions (shared by stress, damage, diagnostics and UI)

export interface TerraIssue {
  key: 'humidity_low' | 'humidity_high' | 'cold' | 'hot' | 'basking' | 'ventilation' | 'mould' | 'waste' | 'dish' | 'calcium' | 'uvb' | 'hides' | 'climbing' | 'pool' | 'crickets' | 'space' | 'rival';
  text: string;
  /** Stress added (0..40). */
  stress: number;
  /** Health lost per hour. */
  damage: number;
}

/** What is wrong for one land animal in this enclosure, in plain words with numbers. */
export function terraIssues(f: FishEntity, tank: TankState, mates: FishEntity[]): TerraIssue[] {
  const sp = getSpecies(f.speciesId);
  const need = sp.terra;
  const out: TerraIssue[] = [];
  if (!need || !isEnclosure(tank)) return out;
  const t = terraOf(tank);
  const sens = 0.5 + sp.sensitivity;
  const add = (i: TerraIssue) => out.push(i);
  const [hMin, hMax] = need.humidity;
  if (t.humidity < hMin) {
    const d = hMin - t.humidity;
    add({ key: 'humidity_low', text: `Too dry: ${Math.round(t.humidity)}% humidity, wants ${hMin}-${hMax}%. Mist, close the vents a little or fit a mister.`, stress: Math.min(35, 6 + d * 0.8), damage: d > 8 ? (d - 8) * 0.03 * sens : 0 });
  } else if (t.humidity > hMax + 3) {
    const d = t.humidity - hMax;
    add({ key: 'humidity_high', text: `Too humid: ${Math.round(t.humidity)}% humidity, wants ${hMin}-${hMax}%. Open the vents and mist less.`, stress: Math.min(30, 5 + d * 0.6), damage: d > 12 ? (d - 12) * 0.02 * sens : 0 });
  }
  const temp = effectiveTemp(sp, tank);
  if (temp < sp.temperature.min) add({ key: 'cold', text: `Too cold: ${temp.toFixed(1)}°C, wants ${sp.temperature.min}-${sp.temperature.max}°C.`, stress: 15, damage: (sp.temperature.min - temp) * 0.25 * sens });
  else if (temp > sp.temperature.max) add({ key: 'hot', text: `Too hot: ${temp.toFixed(1)}°C, wants ${sp.temperature.min}-${sp.temperature.max}°C.`, stress: 20, damage: (temp - sp.temperature.max) * 0.5 * sens });
  if (need.basking && hotspot(tank) < need.basking - 2 && tank.lightOn) add({ key: 'basking', text: `No basking spot: wants about ${need.basking}°C under a lamp to warm up and digest (now ${hotspot(tank).toFixed(0)}°C).`, stress: 10, damage: 0.01 });
  if (t.vent < need.ventilation - 0.05) add({ key: 'ventilation', text: `Stale air: ventilation ${Math.round(t.vent * 100)}%, wants ${Math.round(need.ventilation * 100)}%+. Open the vents.`, stress: 8 + (need.ventilation - t.vent) * 20, damage: (need.ventilation - t.vent) * 0.06 * sens });
  if (t.mould > 0.35) add({ key: 'mould', text: `Mould is spreading (${Math.round(t.mould * 100)}%). Spot clean, ventilate, or add a clean-up crew.`, stress: t.mould * 20, damage: Math.max(0, t.mould - 0.5) * 0.25 * sens });
  if (t.waste > 0.5) add({ key: 'waste', text: `Dirty enclosure (waste ${Math.round(t.waste * 100)}%). Spot clean.`, stress: (t.waste - 0.5) * 30, damage: Math.max(0, t.waste - 0.75) * 0.2 });
  if (t.dish < 0.2 && !(need.pool && isPaludarium(tank))) add({ key: 'dish', text: 'The water dish is empty or fouled. Refresh it.', stress: 10, damage: (0.2 - t.dish) * 0.6 });
  if (need.calcium && t.calcium < 0.3) add({ key: 'calcium', text: `Calcium low (${Math.round(t.calcium * 100)}%). Feed insects dusted with calcium; without it bones soften.`, stress: 4, damage: (0.3 - t.calcium) * 0.12 });
  if (need.uvb && !t.uvb) add({ key: 'uvb', text: 'Would benefit from a UVB tube: it helps it use calcium.', stress: 2, damage: 0 });
  const sc = scapeCounts(tank);
  const habitat = sp.habitat;
  const adults = mates.filter((m) => m.alive && getSpecies(m.speciesId).habitat?.caves && m.sizeCm >= m.adultSizeCm * 0.6).reduce((s, m) => s + (getSpecies(m.speciesId).habitat?.caves ?? 0), 0);
  if ((habitat?.caves ?? 0) > 0 && sc.hides < adults) add({ key: 'hides', text: `Not enough hides: ${sc.hides} for ${adults} wanted. Add cork bark or a slate cave.`, stress: 14, damage: 0 });
  if (need.basking && sp.habitat?.caves && sc.hides && !sc.warmHide) add({ key: 'hides', text: 'Wants one hide on the warm side (a slate cave under the lamp).', stress: 5, damage: 0 });
  if (need.climber && sc.climbing === 0 && sc.plants < 2) add({ key: 'climbing', text: 'A climber with nothing to climb: add a branch or a vine.', stress: 10, damage: 0 });
  if (need.pool && !isPaludarium(tank)) add({ key: 'pool', text: 'Needs a pool of water to sit in: keep it in a paludarium.', stress: 30, damage: 0.4 });
  // Crickets left loose at night nibble sleeping animals.
  if (!tank.lightOn && tank.food > appetite(f) * 3 && need.feeder === 'crickets' && !sp.behaviour.nocturnal) add({ key: 'crickets', text: 'Loose crickets are pestering it at night. Feed what it can eat; spot clean leftovers.', stress: 8, damage: 0.02 });
  // Space: enclosure volume for the animals living on land.
  const used = mates.filter((m) => m.alive && isLandAnimal(getSpecies(m.speciesId))).reduce((s, m) => s + landSpace(getSpecies(m.speciesId), m.sizeCm), 0);
  if (used > landVolume(tank)) add({ key: 'space', text: `Crowded: ${Math.round(used)}L of space wanted in ${landVolume(tank)}L.`, stress: Math.min(30, (used / landVolume(tank) - 1) * 40), damage: 0 });
  // Solitary animals and rival males.
  const same = mates.filter((m) => m.alive && m.id !== f.id && m.speciesId === f.speciesId && m.sizeCm >= m.adultSizeCm * 0.5);
  if (sp.tags.includes('solitary_strict') && same.length) add({ key: 'rival', text: `${sp.commonName} must live alone: they attack and eat each other.`, stress: 30, damage: 0.15 });
  if (sp.tags.includes('males_fight') && f.sex === 'male' && same.some((m) => m.sex === 'male')) add({ key: 'rival', text: 'Two adult males fight. Keep one male per enclosure.', stress: 25, damage: 0.05 });
  return out;
}

/** Climate mismatches for a species in an enclosure as it is now (for order and move checks). */
export function climateWarnings(tank: TankState, sp: SpeciesDef): string[] {
  const need = sp.terra;
  if (!need) return [];
  const t = terraOf(tank);
  const out: string[] = [];
  if (t.humidity < need.humidity[0] - 3 || t.humidity > need.humidity[1] + 5) out.push(`${tank.name} is at ${Math.round(t.humidity)}% humidity; ${sp.commonName} wants ${need.humidity[0]}-${need.humidity[1]}%.`);
  const temp = effectiveTemp(sp, tank);
  if (temp < sp.temperature.min - 0.5 || temp > sp.temperature.max + 0.5) out.push(`${tank.name} is ${temp.toFixed(0)}°C; ${sp.commonName} needs ${sp.temperature.min}-${sp.temperature.max}°C.`);
  if (need.basking && t.heatLamp === null) out.push(`${sp.commonName} needs a basking lamp (about ${need.basking}°C); ${tank.name} has none.`);
  if (t.vent < need.ventilation - 0.05) out.push(`${tank.name}'s vents are ${Math.round(t.vent * 100)}% open; ${sp.commonName} wants ${Math.round(need.ventilation * 100)}%+.`);
  return out;
}

/** Enclosure space one animal needs (litres), scaled for youngsters. */
export function landSpace(sp: SpeciesDef, sizeCm: number): number {
  const need = sp.terra?.space ?? 20;
  return need * clamp(sizeCm / sp.adultSizeCm, 0.4, 1);
}

/** Damage per hour from enclosure problems, with causes for the death log. */
export function terraDamage(f: FishEntity, tank: TankState, mates: FishEntity[]): { damage: number; causes: string[] } {
  const issues = terraIssues(f, tank, mates).filter((i) => i.damage > 0);
  const label: Partial<Record<TerraIssue['key'], string>> = { humidity_low: 'dehydration', humidity_high: 'too humid', mould: 'mould infection', calcium: 'calcium deficiency', dish: 'dehydration', rival: 'fighting', pool: 'no water to sit in' };
  return { damage: issues.reduce((s, i) => s + i.damage, 0), causes: issues.map((i) => label[i.key] ?? i.key) };
}

// ---------------------------------------------------------------------------
// Player actions

/** Mist by hand: damp substrate, humid air for a while. */
export function mistEnclosure(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Only enclosures are misted.');
  const t = terraOf(tank);
  const before = t.humidity;
  t.moisture = clamp01(t.moisture + 0.18);
  t.humidity = clamp(t.humidity + 22, 0, 100);
  t.lastMist = state.minute;
  tank.lastMaintenance.mist = state.minute;
  return ok(`Misted ${tank.name}: humidity ${Math.round(before)}% → ${Math.round(t.humidity)}%.`, 2);
}

/** Spot clean: droppings, dead feeders and mouldy bits out. */
export function spotClean(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Spot cleaning is for enclosures.');
  const t = terraOf(tank);
  t.waste = round(t.waste * 0.1, 3);
  t.mould = round(t.mould * 0.4, 3);
  if (isLandOnly(tank)) tank.food *= 0.3;
  tank.lastMaintenance.spot = state.minute;
  return ok('Spot cleaned: droppings, dead insects and mouldy patches removed.', 8);
}

export function refreshDish(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Only enclosures have a water dish.');
  terraOf(tank).dish = 1;
  tank.lastMaintenance.dish = state.minute;
  return ok('Fresh water in the dish.', 2);
}

export function setVent(state: GameState, tank: TankState, vent: number): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Only enclosures have vents.');
  const t = terraOf(tank);
  t.vent = clamp01(vent);
  return ok(`Vents: ${VENT_LEVELS.find((v) => Math.abs(v.value - t.vent) < 0.01)?.label ?? `${Math.round(t.vent * 100)}% open`}.`, 1);
}

export function toggleMister(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Misters are for enclosures.');
  const t = terraOf(tank);
  if (t.mister) {
    t.mister = false;
    return ok('Mister switched off.', 2);
  }
  if (!spend(state, TERRA_EQUIPMENT.mister.cost, `Mister for ${tank.name}`)) return fail('Not enough money.');
  t.mister = true;
  return ok('Automatic mister fitted.', 10);
}

/** Fit a basking lamp at a temperature, change the thermostat, or remove it (null). */
export function setHeatLamp(state: GameState, tank: TankState, temp: number | null): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Basking lamps are for enclosures.');
  const t = terraOf(tank);
  if (temp === null) {
    t.heatLamp = null;
    return ok('Basking lamp removed.', 3);
  }
  if (t.heatLamp === null && !spend(state, TERRA_EQUIPMENT.heatLamp.cost, `Basking lamp for ${tank.name}`)) return fail('Not enough money.');
  t.heatLamp = clamp(Math.round(temp), 26, 40);
  return ok(`Basking lamp set to ${t.heatLamp}°C.`, 2);
}

export function toggleUvb(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('UVB tubes are for enclosures.');
  const t = terraOf(tank);
  if (t.uvb) {
    t.uvb = false;
    return ok('UVB tube removed.', 3);
  }
  if (!spend(state, TERRA_EQUIPMENT.uvb.cost, `UVB tube for ${tank.name}`)) return fail('Not enough money.');
  t.uvb = true;
  return ok('UVB tube fitted.', 8);
}

export function addCleanupCrew(state: GameState, tank: TankState): TerraActionResult {
  if (state.idle) return idleRefusal();
  if (!isEnclosure(tank)) return fail('Springtails and isopods live in enclosure substrate.');
  const t = terraOf(tank);
  if (t.bioactive) return fail('This enclosure already has a clean-up crew.');
  if (!spend(state, TERRA_EQUIPMENT.cleanupCrew.cost, `Clean-up crew for ${tank.name}`)) return fail('Not enough money.');
  t.bioactive = true;
  return ok('Springtails and isopods added. They will eat waste and mould.', 4);
}

/** The food the residents of an enclosure eat, by most animals. */
export function enclosureFeeder(state: GameState, tank: TankState): 'fruit_flies' | 'crickets' | 'fruit_diet' | null {
  const counts = new Map<string, number>();
  for (const f of fishInTank(state, tank.id)) {
    const fe = getSpecies(f.speciesId).terra?.feeder;
    if (fe) counts.set(fe, (counts.get(fe) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return (best?.[0] as 'fruit_flies' | 'crickets' | 'fruit_diet') ?? null;
}

const FEEDER_NAME = { fruit_flies: 'fruit flies', crickets: 'crickets', fruit_diet: 'gecko diet' } as const;

/** The stockroom dry good each feeder comes from. */
export const FEEDER_GOOD = { fruit_flies: 'fruit_flies', crickets: 'crickets', fruit_diet: 'gecko_diet' } as const;

/** Display name and stock of an enclosure's feeder. */
export function feederStock(state: GameState, feeder: keyof typeof FEEDER_GOOD): { name: string; count: number } {
  return { name: FEEDER_NAME[feeder], count: state.dryGoods[FEEDER_GOOD[feeder]] ?? 0 };
}

/** Food the land animals want right now, in food units. */
export function landFeedingNeed(state: GameState, tank: TankState): number {
  return fishInTank(state, tank.id).filter((f) => isLandAnimal(getSpecies(f.speciesId))).reduce((s, f) => s + (appetite(f) * f.hunger) / 100, 0);
}

/**
 * Feeds the land animals: one tub or culture of their feeder per feed, dusted
 * with calcium when there is dust in stock (and the animals need it). In a
 * paludarium, pool fish are fed separately with fish food.
 */
export function feedEnclosure(state: GameState, tank: TankState, amount: 'light' | 'normal' | 'heavy'): TerraActionResult {
  if (state.idle) return idleRefusal();
  const feeder = enclosureFeeder(state, tank);
  if (!feeder) return fail('No land animals here to feed.');
  const units = amount === 'heavy' ? 2 : 1;
  const good = FEEDER_GOOD[feeder];
  if ((state.dryGoods[good] ?? 0) < units) return fail(`Out of ${FEEDER_NAME[feeder]}. Buy more in the stockroom (office PC).`);
  state.dryGoods[good] -= units;
  const need = Math.max(0.2, landFeedingNeed(state, tank));
  const food = need * (amount === 'light' ? 0.5 : amount === 'heavy' ? 2 : 1);
  const t = terraOf(tank);
  const wantsCalcium = fishInTank(state, tank.id).some((f) => getSpecies(f.speciesId).terra?.calcium);
  let dusted = '';
  if (wantsCalcium && feeder !== 'fruit_diet') {
    if ((state.dryGoods.calcium_dust ?? 0) >= 1) {
      state.dryGoods.calcium_dust -= 1;
      t.calcium = clamp01(t.calcium + 0.35);
      dusted = ' Dusted with calcium.';
    } else dusted = ' Not dusted: no calcium dust left!';
  } else if (feeder === 'fruit_diet') t.calcium = clamp01(t.calcium + 0.3);
  // Land animals eat straight away if hungry; the rest stays loose in the enclosure.
  let pool = food;
  for (const f of fishInTank(state, tank.id).filter((x) => isLandAnimal(getSpecies(x.speciesId))).sort((a, b) => b.hunger - a.hunger)) pool -= eat(f, pool);
  if (isLandOnly(tank)) tank.food += Math.max(0, pool);
  tank.lastFedMinute = state.minute;
  tank.lastMaintenance.feed = state.minute;
  return ok(`Fed ${FEEDER_NAME[feeder]}.${dusted}`, 3);
}
