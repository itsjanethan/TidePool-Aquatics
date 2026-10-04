/**
 * ReefSystem: corals, reef chemistry and reef equipment.
 *
 * Corals are decor items of kind 'coral' that grow like plants but answer to
 * reef conditions: light (PAR) and water movement at their height on the
 * rockwork, nitrate, temperature, salinity, and for stony corals alkalinity,
 * calcium and magnesium. Stony corals use alkalinity and calcium to build
 * skeleton, so a growing reef needs dosing or water changes. Aggressive corals
 * sting neighbours within reach. Healthy colonies can be fragged into plugs
 * that sell from the frag rack.
 *
 * `assessCoral` is the single source of truth: the tick, diagnostics, the
 * aquascape preview and the coral info screens all read it.
 */
import { clamp, clamp01, round } from '../core/math';
import { getDecor, getFilter, type DecorDef } from '../data/catalog';
import {
  ALK_SWING_LIMIT, CALCIUM_PER_DKH, DOSE, DOSER_COST, FRAG_MIN_SIZE, FRAG_SIZE, PERCH_FLOW, PERCH_LABEL, PERCH_LIGHT, REEF_LIGHTS, REEF_TARGETS, SALT_MIX, WAVEMAKERS,
  type CoralTraits, type Perch, type ReefLightDef,
} from '../data/reef';
import { spend } from './economy';
import { newId } from './fish';
import { plantValue } from './plants';
import { idleRefusal } from './idle';
import { isMarine, MARINE_SAFE, TARGET_SALINITY } from './marine';
import { dayOf } from './time';
import type { DecorItem, GameState, PottedPlant, ReefState, TankState, WaterState } from './types';

export interface ReefActionResult {
  ok: boolean;
  message: string;
  minutes: number;
}
const ok = (message: string, minutes: number): ReefActionResult => ({ ok: true, message, minutes });
const fail = (message: string): ReefActionResult => ({ ok: false, message, minutes: 0 });

export function isCoral(defId: string): boolean {
  return getDecor(defId).kind === 'coral';
}

export function coralTraits(defId: string): CoralTraits {
  const t = getDecor(defId).coral;
  if (!t) throw new Error(`${defId} is not a coral`);
  return t;
}

export const GROUP_LABEL: Record<CoralTraits['group'], string> = { soft: 'Soft coral', lps: 'Large-polyp stony (LPS)', sps: 'Small-polyp stony (SPS)' };

// ---------------------------------------------------------------------------
// Chemistry

export interface ReefChem {
  alk: number;
  calcium: number;
  magnesium: number;
}

/** Alkalinity, calcium and magnesium of marine water (natural seawater until changed). */
export function reefChem(w: WaterState): ReefChem {
  return { alk: w.alk ?? SALT_MIX.alk, calcium: w.calcium ?? SALT_MIX.calcium, magnesium: w.magnesium ?? SALT_MIX.magnesium };
}

function setChem(w: WaterState, c: ReefChem): void {
  // Full precision: a few minutes of coral growth moves alkalinity by thousandths of a dKH.
  w.alk = clamp(c.alk, 0, 20);
  w.calcium = clamp(c.calcium, 0, 700);
  w.magnesium = clamp(c.magnesium, 0, 2000);
}

/** Water change on a marine tank: new salt mix moves the chemistry toward natural seawater; plain water dilutes it. */
export function chemAfterWaterChange(w: WaterState, fraction: number, withSalt: boolean): void {
  const c = reefChem(w);
  const f = clamp01(fraction);
  const mix = withSalt ? SALT_MIX : { alk: 0.5, calcium: 15, magnesium: 5 };
  setChem(w, { alk: c.alk * (1 - f) + mix.alk * f, calcium: c.calcium * (1 - f) + mix.calcium * f, magnesium: c.magnesium * (1 - f) + mix.magnesium * f });
}

// ---------------------------------------------------------------------------
// Equipment, light and flow

export function reefState(tank: TankState): ReefState {
  return tank.reef ?? { light: 'standard', wavemaker: 0 };
}

export function reefLight(tank: TankState): ReefLightDef {
  const id = reefState(tank).light;
  return REEF_LIGHTS.find((l) => l.id === id) ?? REEF_LIGHTS[0];
}

/** Water movement index of the tank (0..1.2): filter return, skimmer, air and wavemaker. */
export function tankFlow(tank: TankState): number {
  const filter = getFilter(tank.filterId);
  const filterFlow = (filter.id === 'canister' ? 0.22 : filter.id === 'hang_on' ? 0.2 : 0.08) * (0.5 + 0.5 * tank.filterCondition);
  const wm = WAVEMAKERS.find((w) => w.level === reefState(tank).wavemaker)?.flow ?? 0;
  return round(clamp(filterFlow + (tank.skimmer ? 0.04 : 0) + (tank.airStone ? 0.04 : 0) + wm, 0, 1.2), 3);
}

/** Rock a coral at x could sit on: rock or cave decor whose width covers x. */
export function rockUnder(tank: TankState, x: number, exceptUid?: string): DecorItem | null {
  const scale = clamp(Math.sqrt(60 / tank.lengthCm), 0.6, 1.1);
  let best: DecorItem | null = null;
  let bd = Infinity;
  for (const d of tank.decor) {
    if (d.uid === exceptUid) continue;
    const def = getDecor(d.defId);
    if (def.kind !== 'rock' && def.kind !== 'cave') continue;
    const half = (def.width * scale) / 864 + 0.02;
    const dist = Math.abs(d.x - x);
    if (dist <= half && dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

/** Where a coral sits: layer 0 top of the rockwork, 1 middle, 2 sand. Without rock under it, it sits on the sand. */
export function perchOf(tank: TankState, item: Pick<DecorItem, 'x' | 'layer' | 'uid'>): { perch: Perch; rock: DecorItem | null } {
  if (item.layer === 2) return { perch: 'sand', rock: null };
  const rock = rockUnder(tank, item.x, item.uid);
  if (!rock) return { perch: 'sand', rock: null };
  return { perch: item.layer === 0 ? 'top' : 'mid', rock };
}

/** Daytime light (PAR) and water movement at a coral's spot. */
export function coralEnv(tank: TankState, item: Pick<DecorItem, 'x' | 'layer' | 'uid'>): { perch: Perch; rock: DecorItem | null; par: number; flow: number } {
  const { perch, rock } = perchOf(tank, item);
  const clarity = 1 - tank.water.cloudiness * 0.5;
  const par = Math.round(reefLight(tank).par * PERCH_LIGHT[perch] * clarity);
  const flow = round(tankFlow(tank) * PERCH_FLOW[perch], 2);
  return { perch, rock, par, flow };
}

// ---------------------------------------------------------------------------
// Assessment

export interface CoralNote {
  key: 'light' | 'flow' | 'nitrate' | 'temperature' | 'salinity' | 'alk' | 'calcium' | 'magnesium' | 'swing' | 'sting' | 'water' | 'ok';
  text: string;
  good: boolean;
}

export interface CoralAssessment {
  traits: CoralTraits;
  perch: Perch;
  onRock: boolean;
  par: number;
  flow: number;
  /** 0..1 multiplier on growth from conditions. */
  growthFactor: number;
  /** Health lost per day (0 = none). */
  damagePerDay: number;
  /** Bleaching added per day. */
  bleachPerDay: number;
  /** Size gained per day at current health, after crowding. */
  growthPerDay: number;
  /** Alkalinity used per day (dKH in this tank). */
  alkUsePerDay: number;
  notes: CoralNote[];
  /** Neighbours this coral stings and corals stinging it. */
  stings: string[];
  stungBy: string[];
}

const flowWord = (f: number) => (f < 0.3 ? 'gentle' : f < 0.6 ? 'moderate' : 'strong');
const PERCH_RANK: Record<Perch, number> = { top: 0, mid: 1, sand: 2 };

/** Within sting reach: close side to side and no more than one height apart. */
function inReach(tank: TankState, attacker: DecorItem, target: DecorItem): boolean {
  const t = getDecor(attacker.defId).coral;
  if (!t || t.sting <= 0) return false;
  const reach = t.reach * (0.6 + 0.4 * Math.min(1.5, attacker.size));
  if (Math.abs(attacker.x - target.x) > reach) return false;
  return Math.abs(PERCH_RANK[perchOf(tank, attacker).perch] - PERCH_RANK[perchOf(tank, target).perch]) <= 1;
}

/** Everything that affects one coral where it is (or where a preview puts it). */
export function assessCoral(tank: TankState, item: DecorItem): CoralAssessment {
  const t = coralTraits(item.defId);
  const env = coralEnv(tank, item);
  const w = tank.water;
  const notes: CoralNote[] = [];
  let growth = 1;
  let dmg = 0;
  let bleach = 0;
  const sens = 0.4 + t.sensitivity;
  const marine = isMarine(tank);
  if (!marine) {
    notes.push({ key: 'water', text: 'Corals only live in saltwater.', good: false });
    dmg += 2;
    growth = 0;
  }
  // Light.
  if (env.par < t.par[0]) {
    const r = env.par / t.par[0];
    growth *= r;
    if (r < 0.6) dmg += (0.6 - r) * 0.08 * sens;
    notes.push({ key: 'light', text: `Too dim: ${env.par} PAR here, wants ${t.par[0]}-${t.par[1]}. ${env.perch === 'top' ? 'A stronger reef light would help.' : 'Higher on the rock or a stronger light.'}`, good: false });
  } else if (env.par > t.par[1]) {
    const over = (env.par - t.par[1]) / t.par[1];
    bleach += over * 0.25 * sens;
    growth *= Math.max(0.2, 1 - over);
    notes.push({ key: 'light', text: `Too bright: ${env.par} PAR here, wants ${t.par[0]}-${t.par[1]}. It will bleach; move it lower.`, good: false });
  } else notes.push({ key: 'light', text: `Light fine: ${env.par} PAR (wants ${t.par[0]}-${t.par[1]})`, good: true });
  // Water movement.
  if (env.flow < t.flow[0]) {
    const r = env.flow / t.flow[0];
    growth *= 0.5 + 0.5 * r;
    dmg += (1 - r) * 0.03 * sens;
    notes.push({ key: 'flow', text: `Too little water movement (${flowWord(env.flow)}, ${env.flow.toFixed(2)}; wants ${t.flow[0]}-${t.flow[1]}): waste settles on it. Add a wavemaker or move it higher.`, good: false });
  } else if (env.flow > t.flow[1]) {
    const over = env.flow - t.flow[1];
    growth *= Math.max(0.3, 1 - over * 2);
    dmg += over * 0.05 * sens;
    notes.push({ key: 'flow', text: `Too much flow (${flowWord(env.flow)}, ${env.flow.toFixed(2)}; wants ${t.flow[0]}-${t.flow[1]}): polyps stay shut. Move it lower or turn the wavemaker down.`, good: false });
  } else notes.push({ key: 'flow', text: `Flow fine: ${flowWord(env.flow)} (${env.flow.toFixed(2)})`, good: true });
  // Nutrients.
  if (w.nitrate > t.nitrate[1]) {
    const over = (w.nitrate - t.nitrate[1]) / t.nitrate[1];
    dmg += over * 0.035 * sens;
    growth *= Math.max(0.3, 1 - over * 0.5);
    notes.push({ key: 'nitrate', text: `Nitrate ${Math.round(w.nitrate)} ppm is too high (wants under ${t.nitrate[1]}): browning and slow decline.`, good: false });
  } else if (w.nitrate < t.nitrate[0]) {
    growth *= 0.65;
    if (t.group === 'sps') dmg += 0.01;
    notes.push({ key: 'nitrate', text: `Nitrate ${w.nitrate.toFixed(1)} ppm is too low (wants ${t.nitrate[0]}+): pale and hungry.`, good: false });
  }
  // Temperature and salinity.
  if (w.temperature > 28.5) {
    bleach += (w.temperature - 28.5) * 0.15 * sens;
    notes.push({ key: 'temperature', text: `${w.temperature.toFixed(1)}°C is too warm: heat bleaches corals.`, good: false });
  } else if (w.temperature < 23) {
    dmg += (23 - w.temperature) * 0.04 * sens;
    growth *= 0.5;
    notes.push({ key: 'temperature', text: `${w.temperature.toFixed(1)}°C is too cold for corals.`, good: false });
  }
  if (marine) {
    const sal = w.salinity ?? TARGET_SALINITY;
    const off = sal < MARINE_SAFE[0] ? MARINE_SAFE[0] - sal : sal > MARINE_SAFE[1] ? sal - MARINE_SAFE[1] : 0;
    if (off > 0) {
      dmg += off * 0.06 * sens;
      notes.push({ key: 'salinity', text: 'Salinity out of range.', good: false });
    }
  }
  // Skeleton chemistry (stony corals).
  const c = reefChem(w);
  let calcEff = 1;
  if (t.group !== 'soft') {
    if (c.alk < 7) {
      dmg += (7 - c.alk) * 0.035 * sens;
      calcEff *= clamp(c.alk / 7, 0, 1);
      notes.push({ key: 'alk', text: `Alkalinity ${c.alk.toFixed(1)} dKH is low (wants ${REEF_TARGETS.alk[0]}-${REEF_TARGETS.alk[1]}): tissue starts to recede.`, good: false });
    } else if (c.alk > 11.5 && t.group === 'sps') {
      dmg += (c.alk - 11.5) * 0.05 * sens;
      notes.push({ key: 'alk', text: `Alkalinity ${c.alk.toFixed(1)} dKH is too high: burnt tips on SPS.`, good: false });
    }
    if (c.calcium < 360) {
      calcEff *= clamp((c.calcium - 280) / 80, 0.1, 1);
      notes.push({ key: 'calcium', text: `Calcium ${Math.round(c.calcium)} ppm is low (wants ${REEF_TARGETS.calcium[0]}+): it cannot build skeleton.`, good: false });
    }
    if (c.magnesium < 1150) {
      calcEff *= 0.75;
      notes.push({ key: 'magnesium', text: `Magnesium ${Math.round(c.magnesium)} ppm is low (wants ${REEF_TARGETS.magnesium[0]}+): calcium and alkalinity drop out of the water.`, good: false });
    }
    const swing = reefState(tank).alkSwing ?? 0;
    if (swing > ALK_SWING_LIMIT) {
      dmg += (swing - ALK_SWING_LIMIT) * 0.06 * sens;
      notes.push({ key: 'swing', text: `Alkalinity swung ${swing.toFixed(1)} dKH today: stony corals need it steady (under ${ALK_SWING_LIMIT}).`, good: false });
    }
  }
  growth *= calcEff;
  // Stinging neighbours.
  const stings: string[] = [];
  const stungBy: string[] = [];
  for (const o of tank.decor) {
    if (o.uid === item.uid) continue;
    const od = getDecor(o.defId);
    if (od.kind !== 'coral' || !od.coral) continue;
    if (od.coral.genus === t.genus) continue;
    if (inReach(tank, o, item)) {
      dmg += od.coral.sting * Math.min(1.2, o.size);
      stungBy.push(od.name);
    }
    if (inReach(tank, item, o)) stings.push(od.name);
  }
  if (stungBy.length) notes.push({ key: 'sting', text: `Stung by ${[...new Set(stungBy)].join(', ')}: move them further apart.`, good: false });
  if (stings.length) notes.push({ key: 'sting', text: `Its ${t.sting >= 0.2 ? 'sweeper tentacles' : 'chemicals'} reach ${[...new Set(stings)].join(', ')}.`, good: false });

  growth = clamp(growth, 0, 1);
  const crowd = Math.max(0, 1 - item.size / t.maxSize);
  const health = item.health ?? 1;
  const growthPerDay = t.growth * growth * health * (1 - (item.bleach ?? 0) * 0.7) * crowd;
  const alkUsePerDay = (t.calcify * item.size * growth * health * 100) / Math.max(20, tank.litres);
  if (notes.every((n) => n.good)) notes.push({ key: 'ok', text: 'Conditions suit it here.', good: true });
  return {
    traits: t,
    perch: env.perch,
    onRock: !!env.rock,
    par: env.par,
    flow: env.flow,
    growthFactor: round(growth, 3),
    damagePerDay: round(dmg, 4),
    bleachPerDay: round(bleach, 4),
    growthPerDay: round(growthPerDay, 4),
    alkUsePerDay: round(alkUsePerDay, 4),
    notes,
    stings: [...new Set(stings)],
    stungBy: [...new Set(stungBy)],
  };
}

/** Corals in a tank (decor items of kind coral). */
export function coralsIn(tank: TankState): DecorItem[] {
  return tank.decor.filter((d) => isCoral(d.defId));
}

/** Total alkalinity the corals use per day right now. */
export function reefDemand(tank: TankState): { alkPerDay: number; calciumPerDay: number } {
  const alk = coralsIn(tank).reduce((s, d) => s + assessCoral(tank, d).alkUsePerDay, 0);
  return { alkPerDay: round(alk, 3), calciumPerDay: round(alk * CALCIUM_PER_DKH, 2) };
}

// ---------------------------------------------------------------------------
// Tick

export interface ReefTickContext {
  onCoralDeath?: (name: string, tank: TankState, cause: string) => void;
}

/** Hourly reef update: chemistry use, dosing pump, coral health, bleaching and growth. */
export function tickReef(state: GameState, tank: TankState, dtHours: number, ctx: ReefTickContext = {}): void {
  if (!isMarine(tank)) {
    // Corals put into freshwater still die (assessCoral reports why).
    if (!tank.decor.some((d) => isCoral(d.defId))) return;
  }
  const w = tank.water;
  const dtDays = dtHours / 24;
  const corals = coralsIn(tank);
  // Daily alkalinity swing tracking.
  if (isMarine(tank)) {
    const r = (tank.reef ??= { light: 'standard', wavemaker: 0 });
    const day = dayOf(state.minute);
    const chem = reefChem(w);
    if (r.alkDayStart === undefined || r.day !== day) {
      r.day = day;
      r.alkDayStart = chem.alk;
      r.alkSwing = 0;
    }
    r.alkSwing = round(Math.max(r.alkSwing ?? 0, Math.abs(chem.alk - r.alkDayStart)), 3);
  }
  if (!corals.length && !tank.reef?.doser) return;

  const assessed = corals.map((d) => ({ d, a: assessCoral(tank, d) }));
  // Skeleton building uses alkalinity, calcium (and a little magnesium).
  if (isMarine(tank) && corals.length) {
    const c = reefChem(w);
    const mgFactor = c.magnesium < 1150 ? 1.3 : 1;
    const alkUse = assessed.reduce((s, x) => s + x.a.alkUsePerDay, 0) * dtDays * mgFactor;
    setChem(w, { alk: c.alk - alkUse, calcium: c.calcium - alkUse * CALCIUM_PER_DKH, magnesium: c.magnesium - alkUse * 1.2 });
  }
  // Dosing pump: brings alkalinity and calcium back toward target from stock, never faster than about 1 dKH a day.
  if (isMarine(tank) && tank.reef?.doser) runDoser(state, tank, dtHours);

  for (const { d, a } of assessed) {
    const def = getDecor(d.defId);
    d.bleach = clamp01((d.bleach ?? 0) + a.bleachPerDay * dtDays - (a.bleachPerDay === 0 ? 0.04 * dtDays : 0));
    const bleachHarm = (d.bleach ?? 0) > 0.6 ? ((d.bleach ?? 0) - 0.6) * 0.1 : 0;
    const harm = a.damagePerDay + bleachHarm;
    if (harm > 0.004) d.health = clamp01(d.health - harm * dtDays);
    else d.health = clamp01(d.health + 0.05 * dtDays);
    d.size = clamp(d.size + (a.growthPerDay * dtDays), 0.1, a.traits.maxSize);
    if (d.health <= 0.001) {
      tank.decor.splice(tank.decor.indexOf(d), 1);
      const cause = a.notes.find((n) => !n.good)?.key ?? 'poor conditions';
      ctx.onCoralDeath?.(def.name, tank, cause);
    }
  }
}

/** Stock units used per dose for this tank (one unit treats 100 L). */
export function doseUnits(tank: TankState): number {
  return Math.max(1, Math.ceil(tank.litres / 100));
}

/** Takes `units` (fractional) of a supplement: a whole unit leaves the stockroom when the pump starts on it. */
function drawStock(state: GameState, acc: { alk: number; calcium: number }, key: 'alk' | 'calcium', good: string, units: number): boolean {
  const next = acc[key] + units;
  const whole = Math.ceil(next - 1e-9) - Math.ceil(acc[key] - 1e-9);
  if ((state.dryGoods[good] ?? 0) < whole) return false;
  if (whole) state.dryGoods[good] -= whole;
  acc[key] = next;
  return true;
}

/** Most a dosing pump adds in a day: gradual, but enough for a busy SPS tank. */
export const DOSER_MAX_ALK_PER_DAY = 2.5;

function runDoser(state: GameState, tank: TankState, dtHours: number): void {
  const r = tank.reef!;
  const acc = (r.doserAcc ??= { alk: 0, calcium: 0 });
  const c = reefChem(tank.water);
  const scale = 100 / tank.litres;
  const alkTarget = 8.5;
  if (c.alk < alkTarget - 0.02) {
    const lift = Math.min(alkTarget - c.alk, (DOSER_MAX_ALK_PER_DAY / 24) * dtHours);
    if (drawStock(state, acc, 'alk', 'reef_alk', lift / (DOSE.alk * scale))) c.alk += lift;
  }
  if (c.calcium < SALT_MIX.calcium - 1) {
    const lift = Math.min(SALT_MIX.calcium - c.calcium, ((DOSER_MAX_ALK_PER_DAY * CALCIUM_PER_DKH * 1.2) / 24) * dtHours);
    if (drawStock(state, acc, 'calcium', 'reef_calcium', lift / (DOSE.calcium * scale))) c.calcium += lift;
  }
  setChem(tank.water, c);
}

// ---------------------------------------------------------------------------
// Player actions

export type DoseKind = 'alk' | 'calcium' | 'magnesium';
const DOSE_GOOD: Record<DoseKind, string> = { alk: 'reef_alk', calcium: 'reef_calcium', magnesium: 'reef_magnesium' };
const DOSE_NAME: Record<DoseKind, string> = { alk: 'alkalinity buffer', calcium: 'calcium supplement', magnesium: 'magnesium supplement' };

/** One measured dose for this tank's volume. */
export function doseReef(state: GameState, tank: TankState, kind: DoseKind): ReefActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Reef supplements are for marine tanks.');
  const units = doseUnits(tank);
  const good = DOSE_GOOD[kind];
  if ((state.dryGoods[good] ?? 0) < units) return fail(`Needs ${units} ${DOSE_NAME[kind]} (you have ${state.dryGoods[good] ?? 0}). Buy more in the stockroom.`);
  state.dryGoods[good] -= units;
  const c = reefChem(tank.water);
  const lift = DOSE[kind] * ((units * 100) / tank.litres);
  const before = c[kind];
  c[kind] += lift;
  setChem(tank.water, c);
  tank.lastMaintenance[`dose_${kind}`] = state.minute;
  const after = reefChem(tank.water)[kind];
  const unit = kind === 'alk' ? ' dKH' : ' ppm';
  const fmt = (v: number) => (kind === 'alk' ? v.toFixed(1) : `${Math.round(v)}`);
  return ok(`Dosed ${DOSE_NAME[kind]}: ${fmt(before)} → ${fmt(after)}${unit}.`, 3);
}

export function setReefLight(state: GameState, tank: TankState, lightId: string): ReefActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Reef lights are for marine tanks.');
  const light = REEF_LIGHTS.find((l) => l.id === lightId);
  if (!light) return fail('Unknown light.');
  const r = (tank.reef ??= { light: 'standard', wavemaker: 0 });
  if (r.light === lightId) return fail('That light is already fitted.');
  if (light.cost > 0 && !spend(state, light.cost, `${light.name} for ${tank.name}`)) return fail('Not enough money.');
  r.light = lightId;
  return ok(`Fitted the ${light.name}. Corals adjust to new light over a few days; watch for bleaching up high.`, 15);
}

export function setWavemaker(state: GameState, tank: TankState, level: number): ReefActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Wavemakers are for marine tanks.');
  const wm = WAVEMAKERS.find((w) => w.level === level);
  if (!wm) return fail('Unknown wavemaker.');
  const r = (tank.reef ??= { light: 'standard', wavemaker: 0 });
  if (r.wavemaker === level) return fail('Already set.');
  if (wm.cost > 0 && !spend(state, wm.cost, `${wm.name} for ${tank.name}`)) return fail('Not enough money.');
  r.wavemaker = level;
  return ok(level ? `Fitted a ${wm.name}.` : 'Wavemaker removed.', 8);
}

export function toggleDoser(state: GameState, tank: TankState): ReefActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Dosing pumps are for marine tanks.');
  const r = (tank.reef ??= { light: 'standard', wavemaker: 0 });
  if (r.doser) {
    r.doser = false;
    return ok('Dosing pump switched off.', 3);
  }
  if (!spend(state, DOSER_COST, `Dosing pump for ${tank.name}`)) return fail('Not enough money.');
  r.doser = true;
  return ok('Dosing pump fitted. It tops alkalinity and calcium up from your stockroom supplements.', 15);
}

/** Can this coral be fragged now? Returns the reason it cannot, or null. */
export function fragRefusal(state: GameState, item: DecorItem): string | null {
  if (!isCoral(item.defId)) return 'Only corals can be fragged.';
  if (item.size < FRAG_MIN_SIZE) return `Too small: let it grow to ${Math.round(FRAG_MIN_SIZE * 100)}% first (now ${Math.round(item.size * 100)}%).`;
  if (item.health < 0.6) return `Too weak to frag (health ${Math.round(item.health * 100)}%). Fix its conditions first.`;
  if ((item.bleach ?? 0) > 0.4) return 'Bleached corals should not be fragged until their colour returns.';
  if ((state.dryGoods.frag_plugs ?? 0) < 1) return 'You need frag plugs and glue. Buy a pack in the stockroom.';
  return null;
}

/** Cuts a frag: the colony shrinks a little and a frag on a plug goes to the frag rack. */
export function fragCoral(state: GameState, tank: TankState, uid: string): ReefActionResult {
  if (state.idle) return idleRefusal();
  const d = tank.decor.find((x) => x.uid === uid);
  if (!d) return fail('That coral is gone.');
  const why = fragRefusal(state, d);
  if (why) return fail(why);
  state.dryGoods.frag_plugs -= 1;
  d.size = round(d.size - FRAG_SIZE, 3);
  d.health = clamp01(d.health - 0.03);
  const frag: PottedPlant = { uid: newId(state, 'fr'), defId: d.defId, size: FRAG_SIZE, health: clamp(d.health * 0.95, 0.3, 1), reservedBy: null };
  state.storage.plants.push(frag);
  const def = getDecor(d.defId);
  return ok(`Cut a ${def.name} frag onto a plug (worth about £${livingValue(frag).toFixed(2)}). It is on the frag rack.`, 10);
}

/** Retail value of a coral frag or colony (same formula as plants.ts plantValue). */
export function livingValue(p: { defId: string; size: number; health: number }): number {
  return plantValue(p);
}

/** Frags waiting on the rack (not reserved). */
export function availableFrags(state: GameState): PottedPlant[] {
  return state.storage.plants.filter((p) => !p.reservedBy && isCoral(p.defId));
}

export function fragLabel(p: PottedPlant): string {
  return `${getDecor(p.defId).name} ${p.size < 0.45 ? 'frag' : p.size < 0.9 ? 'mini colony' : 'colony'}`;
}

/** New corals bought from the catalogue arrive as small colonies. */
export const NEW_CORAL_SIZE = 0.5;

export function coralSizeLabel(size: number): string {
  if (size < 0.45) return 'Frag';
  if (size < 0.9) return 'Small colony';
  if (size < 1.4) return 'Colony';
  return 'Large colony';
}

/** One-line placement summary for the aquascape screen. */
export function perchText(perch: Perch, onRock: boolean, layer: number): string {
  if (perch === 'sand' && layer < 2 && !onRock) return 'No rock here: it would sit on the sand bed';
  return `On the ${PERCH_LABEL[perch]}`;
}

export function defIsCoral(def: DecorDef): boolean {
  return def.kind === 'coral';
}
