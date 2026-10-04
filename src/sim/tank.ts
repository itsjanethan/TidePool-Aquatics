/**
 * TankSimulation: background tick for one tank plus player maintenance,
 * equipment and aquascaping actions.
 */
import { isMarine, salinityAfterChange, sgLabel, TARGET_SALINITY, tickMarine, topOff } from './marine';
import { idleRefusal } from './idle';
import { tickFloating } from './floating';
import { clamp, clamp01, round } from '../core/math';
import { AIR_PUMP, getDecor, getFilter, getHeater, getTankSize, getSubstrate, getBackground } from '../data/catalog';
import { getSpecies } from '../data/species';
import { VIVARIUM_ROOM_TEMP } from '../data/terra';
import { summarizeAquascape, type AquascapeSummary } from './aquascape';
import { stressTarget } from './compat';
import { spend } from './economy';
import { decorRefusal, MAX_DECOR, removeToStorage, tickPlants } from './plants';
import { chemAfterWaterChange, NEW_CORAL_SIZE, tickReef } from './reef';
import { grazeWeight, tickCleanupCrew } from './inverts';
import { effectiveTemp, feedEnclosure, habitatRefusal, isEnclosure, isLandOnly, isPaludarium, landFeedingNeed, livesOn, terraDamage, terraOf, tickTerrarium } from './terrarium';
import { appetite, eat, fishInTank, fishValue, killFish, newId, tickFish, type FishEnv } from './fish';
import { AMMONIA_PER_FOOD_EATEN, freshWater, liveRockWeight, tickWater, waterChange } from './water';
import type { FishEntity, GameState, TankState } from './types';

export interface TankTickContext {
  ambient: number;
  daylight: boolean;
  onDeath?: (fish: FishEntity, tank: TankState, cause: string) => void;
  onCoralDeath?: (name: string, tank: TankState, cause: string) => void;
}

export function createTank(id: string, name: string, sizeId: string, opts: Partial<TankState> = {}): TankState {
  const size = getTankSize(sizeId);
  return {
    id,
    name,
    sizeId,
    litres: size.litres,
    lengthCm: size.lengthCm,
    water: freshWater(20),
    filterId: 'sponge',
    filterCondition: 1,
    heaterId: null,
    heaterSetpoint: 25,
    heaterBroken: false,
    airStone: false,
    lightOn: true,
    substrateId: 'gravel',
    backgroundId: 'none',
    decor: [],
    algae: 0,
    glassDirt: 0,
    food: 0,
    lastFedMinute: 0,
    viewActive: false,
    lastMaintenance: {},
    ownedSubstrates: [],
    ownedBackgrounds: [],
    ...opts,
  } as TankState;
}

/** Food units that would satisfy every fish in the tank right now. */
export function feedingNeed(state: GameState, tank: TankState): number {
  return fishInTank(state, tank.id).reduce((s, f) => s + (appetite(f) * f.hunger) / 100, 0);
}

/** Ammonia excretion in mg/hour by a fish. */
export function excretion(f: FishEntity): number {
  const sp = getSpecies(f.speciesId);
  return 0.004 * sp.wasteFactor * f.sizeCm * f.sizeCm;
}

export function tickTank(state: GameState, tank: TankState, dtHours: number, ctx: TankTickContext): void {
  const all = fishInTank(state, tank.id, true);
  const alive = all.filter((f) => f.alive);
  const scape = summarizeAquascape(tank);

  // Background feeding: when the tank view is open the renderer feeds fish on contact.
  let eatenAmmonia = 0;
  if (!tank.viewActive && tank.food > 0 && alive.length) {
    const hungriest = [...alive].sort((a, b) => b.hunger - a.hunger);
    // Fish only get a share per step so a heavy feed is not instantly vacuumed up.
    const perStep = Math.min(tank.food, tank.food * (1 - Math.exp(-3 * dtHours)) + 0.02);
    let pool = perStep;
    for (const f of hungriest) {
      const took = eat(f, pool);
      pool -= took;
      eatenAmmonia += took * AMMONIA_PER_FOOD_EATEN;
      if (pool <= 0) break;
    }
    tank.food = Math.max(0, tank.food - (perStep - pool));
  }

  // Corpses rot quickly and are eventually gone.
  let corpseAmmonia = 0;
  for (const f of all) {
    if (f.alive) continue;
    const sp = getSpecies(f.speciesId);
    corpseAmmonia += 0.015 * sp.wasteFactor * f.sizeCm * f.sizeCm;
    const days = state.minute / 1440 + 1 - (f.deathDay ?? 0);
    if (days > 2.5) f.tankId = null; // fully decomposed
  }

  // Enclosures: climate and husbandry. Land-only enclosures have no water to simulate.
  // The vivarium floor is a heated room, so enclosures and their pools sit at least that warm.
  if (isEnclosure(tank)) ctx = { ...ctx, ambient: Math.max(ctx.ambient, VIVARIUM_ROOM_TEMP) };
  if (isEnclosure(tank)) tickTerrarium(state, tank, dtHours, { ambient: ctx.ambient, daylight: ctx.daylight });
  if (isLandOnly(tank)) {
    if (corpseAmmonia > 0) terraOf(tank).waste = clamp01(terraOf(tank).waste + corpseAmmonia * 0.002 * dtHours);
    tickAnimals(state, tank, alive, scape, dtHours, ctx);
    return;
  }
  // Land animals in a paludarium leave waste on the bank, not in the pool.
  const inWater = alive.filter((f) => livesOn(getSpecies(f.speciesId)) !== 'land');
  const fishAmmonia = inWater.reduce((s, f) => s + excretion(f), 0);
  const oxygenDemand = inWater.reduce((s, f) => s + 0.0016 * f.sizeCm * f.sizeCm, 0) / tank.litres * 10;
  // Algae grazers count by strength: a pleco 1, a cherry shrimp a fraction (see inverts.ts).
  const grazers = alive.reduce((sum, f) => sum + grazeWeight(f), 0);
  // Scavengers (shrimp, hermits, mystery snails) clear leftovers and settled waste.
  tickCleanupCrew(tank, alive, dtHours);

  tickWater(
    tank,
    {
      fishAmmoniaPerHour: fishAmmonia + corpseAmmonia + eatenAmmonia / Math.max(dtHours, 1e-6),
      oxygenDemand,
      ambient: ctx.ambient,
      scape,
      grazers,
      daylight: ctx.daylight,
    },
    dtHours,
  );

  tickMarine(tank, dtHours, tank.decor.reduce((n, d) => n + liveRockWeight(d.defId), 0));
  // Corals grow, bleach or recede; stony corals use alkalinity and calcium.
  tickReef(state, tank, dtHours, { onCoralDeath: ctx.onCoralDeath });
  // Plants grow, get eaten by plant-unsafe fish, and recover.
  tickPlants(state, tank, dtHours);
  tickFloating(tank, dtHours);
  tickAnimals(state, tank, alive, scape, dtHours, ctx);
}

/** The environment one animal lives in: the water, or (land animals) the enclosure climate. */
export function animalEnv(f: FishEntity, tank: TankState, mates: FishEntity[], stress: number): FishEnv {
  const sp = getSpecies(f.speciesId);
  const water: FishEnv = {
    temperature: tank.water.temperature,
    ph: tank.water.ph,
    gh: tank.water.gh,
    ammonia: tank.water.ammonia,
    nitrite: tank.water.nitrite,
    nitrate: tank.water.nitrate,
    oxygen: tank.water.oxygen,
    litres: tank.litres,
    stressTarget: stress,
    salinity: tank.water.salinity ?? 0,
  };
  const wrong = habitatRefusal(sp, tank);
  const lives = livesOn(sp);
  if (lives === 'water') return wrong ? { ...water, extra: { damage: 6, causes: ['no water'] } } : water;
  if (!isEnclosure(tank)) return { ...water, extra: { damage: 6, causes: ['drowning'] } };
  // Land animals: no water chemistry, except amphibians sitting in a paludarium pool.
  const pool = lives === 'amphibious' && isPaludarium(tank);
  const td = terraDamage(f, tank, mates);
  return {
    temperature: effectiveTemp(sp, tank),
    ph: sp.ph.ideal,
    gh: sp.hardness.min,
    ammonia: pool ? tank.water.ammonia : 0,
    nitrite: pool ? tank.water.nitrite : 0,
    nitrate: pool ? tank.water.nitrate : 0,
    oxygen: 8,
    litres: tank.litres,
    stressTarget: stress,
    salinity: 0,
    extra: wrong ? { damage: td.damage + 1, causes: [...td.causes, 'wrong habitat'] } : td,
  };
}

function tickAnimals(state: GameState, tank: TankState, alive: FishEntity[], scape: AquascapeSummary, dtHours: number, ctx: TankTickContext): void {
  for (const f of alive) {
    const st = stressTarget(f, tank, alive, scape);
    const res = tickFish(f, animalEnv(f, tank, alive, st.total), tank, dtHours);
    if (res.died) {
      killFish(state, f, res.cause);
      ctx.onDeath?.(f, tank, res.cause);
    }
  }
}

// ---------------------------------------------------------------------------
// Player actions. Each returns a result with in-game minutes consumed.

export interface ActionResult {
  ok: boolean;
  message: string;
  minutes: number;
}

const ok = (message: string, minutes: number): ActionResult => ({ ok: true, message, minutes });
const fail = (message: string): ActionResult => ({ ok: false, message, minutes: 0 });

export type FeedAmount = 'light' | 'normal' | 'heavy';
export const FEED_MULTIPLIER: Record<FeedAmount, number> = { light: 0.5, normal: 1, heavy: 2.2 };

export function feedTank(state: GameState, tank: TankState, amount: FeedAmount): ActionResult {
  if (state.idle) return idleRefusal();
  // Enclosures: land animals get their feeder insects or gecko diet.
  if (isLandOnly(tank)) return feedEnclosure(state, tank, amount);
  if (isPaludarium(tank) && landFeedingNeed(state, tank) > 0.05) {
    const land = feedEnclosure(state, tank, amount);
    const poolFish = fishInTank(state, tank.id).filter((f) => livesOn(getSpecies(f.speciesId)) === 'water');
    if (!poolFish.length) return land;
    const water = feedFish(state, tank, amount, poolFish);
    return { ok: land.ok || water.ok, message: `${land.message} ${water.message}`, minutes: land.minutes + water.minutes };
  }
  return feedFish(state, tank, amount, fishInTank(state, tank.id));
}

function feedFish(state: GameState, tank: TankState, amount: FeedAmount, fish: FishEntity[]): ActionResult {
  if (!fish.length) {
    // Ghost feeding an empty tank is a valid (if slow) way to start cycling.
    const units = 1.5 * FEED_MULTIPLIER[amount];
    if (state.foodUnits < units) return fail('Out of fish food. Order more from the office PC.');
    state.foodUnits -= units;
    tank.food += units;
    tank.lastFedMinute = state.minute;
    return ok('You sprinkle food into the empty tank. It will rot and feed bacteria.', 2);
  }
  const need = Math.max(0.3, fish.reduce((s, f) => s + (appetite(f) * f.hunger) / 100, 0));
  const units = round(need * FEED_MULTIPLIER[amount], 2);
  if (state.foodUnits < units) return fail('Out of fish food. Order more from the office PC.');
  state.foodUnits = round(state.foodUnits - units, 2);
  tank.food += units;
  tank.lastFedMinute = state.minute;
  tank.lastMaintenance.feed = state.minute;
  const msg =
    amount === 'heavy'
      ? 'You tip in a generous helping. Uneaten food will foul the water.'
      : amount === 'light'
        ? 'A light pinch of food. They will still be a bit peckish.'
        : 'You feed the tank. The fish dart up eagerly.';
  return ok(msg, 3);
}

export function doWaterChange(state: GameState, tank: TankState, fraction: number): ActionResult {
  if (state.idle) return idleRefusal();
  let saltNote = '';
  if (isMarine(tank)) {
    // Mixing new saltwater uses salt; without it the change dilutes the tank.
    const packs = fraction > 0.3 ? 2 : 1;
    const withSalt = (state.dryGoods.salt_mix ?? 0) >= packs;
    if (withSalt) state.dryGoods.salt_mix -= packs;
    else saltNote = ' No salt mix left: the tank was topped up with plain water and salinity dropped!';
    const sal = salinityAfterChange(tank.water.salinity ?? TARGET_SALINITY, fraction, withSalt);
    chemAfterWaterChange(tank.water, fraction, withSalt);
    waterChange(tank, fraction);
    tank.water.salinity = sal;
    tank.water.ph = 8.2 * fraction + tank.water.ph * (1 - fraction);
  } else waterChange(tank, fraction);
  if (fraction > 0.5) for (const f of fishInTank(state, tank.id)) f.shock = Math.min(60, f.shock + 15);
  // Big changes push shrimp into moulting early; a sudden shift can make moults fail.
  if (fraction > 0.3) for (const f of fishInTank(state, tank.id)) if (getSpecies(f.speciesId).tags.includes('moults')) f.shock = Math.min(60, f.shock + 20);
  tank.lastMaintenance.waterChange = state.minute;
  const minutes = Math.round(12 + tank.litres * fraction * 0.35);
  return ok(`Changed ${Math.round(fraction * 100)}% of the water.${saltNote}`, minutes);
}

/** Marine: top off evaporation with RO water (uses one pack). */
export function topOffTank(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Only marine tanks need RO top-off.');
  if ((state.dryGoods.ro_water ?? 0) < 1) return fail('You need RO water. Buy some in the stockroom.');
  state.dryGoods.ro_water -= 1;
  topOff(tank);
  tank.lastMaintenance.topoff = state.minute;
  return ok(`Topped off with RO water. ${sgLabel(tank.water.salinity ?? TARGET_SALINITY)}.`, 6);
}

/** Marine: fit or remove a protein skimmer. */
export function toggleSkimmer(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  if (!isMarine(tank)) return fail('Skimmers are for marine tanks.');
  if (tank.skimmer) {
    tank.skimmer = false;
    return ok('Skimmer removed.', 5);
  }
  if (!spend(state, SKIMMER_COST, `Skimmer for ${tank.name}`)) return fail('Not enough money.');
  tank.skimmer = true;
  return ok('Protein skimmer fitted.', 10);
}

export const SKIMMER_COST = 85;

export function cleanGlass(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  tank.glassDirt = 0;
  tank.algae = clamp01(tank.algae - 0.35);
  tank.lastMaintenance.glass = state.minute;
  return ok('The glass sparkles again.', 8);
}

export function vacuumSubstrate(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  tank.water.detritus *= 0.3;
  tank.water.cloudiness *= 0.75;
  tank.food *= 0.2;
  // Gravel vacuuming removes some water too.
  waterChange(tank, 0.1);
  tank.lastMaintenance.vacuum = state.minute;
  return ok('You siphon muck out of the substrate.', 15);
}

export function cleanFilter(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  tank.filterCondition = 1;
  // Rinsing in old tank water keeps most bacteria.
  tank.water.aob = Math.max(0.02, tank.water.aob * 0.93);
  tank.water.nob = Math.max(0.02, tank.water.nob * 0.93);
  tank.lastMaintenance.filter = state.minute;
  return ok('Filter media rinsed in tank water. Flow restored.', 12);
}

export function scrubAlgae(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  tank.algae = clamp01(tank.algae * 0.25);
  tank.lastMaintenance.algae = state.minute;
  return ok('You scrub algae off the decor.', 10);
}

export function removeDead(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  const dead = fishInTank(state, tank.id, true).filter((f) => !f.alive);
  if (!dead.length) return fail('There are no dead fish in this tank.');
  for (const f of dead) f.tankId = null;
  return ok(`Removed ${dead.length} dead fish.`, 3);
}

export function useBacteriaStarter(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  if ((state.dryGoods.bacteria ?? 0) < 1) return fail('No bacteria starter in stock.');
  state.dryGoods.bacteria -= 1;
  tank.water.aob = clamp01(tank.water.aob + 0.12);
  tank.water.nob = clamp01(tank.water.nob + 0.1);
  return ok('You dose bacteria starter. The filter gets a head start.', 2);
}

export function buyFilter(state: GameState, tank: TankState, filterId: string): ActionResult {
  if (state.idle) return idleRefusal();
  const f = getFilter(filterId);
  if (tank.filterId === filterId) return fail('That filter is already installed.');
  if (!spend(state, f.cost, `${f.name} for ${tank.name}`)) return fail('Not enough money.');
  // Moving established media into the new filter keeps most bacteria.
  tank.filterId = filterId;
  tank.filterCondition = 1;
  tank.water.aob *= 0.85;
  tank.water.nob *= 0.85;
  return ok(`Installed a ${f.name}. You transferred the old media to keep the bacteria.`, 20);
}

export function buyHeater(state: GameState, tank: TankState, heaterId: string): ActionResult {
  if (state.idle) return idleRefusal();
  const h = getHeater(heaterId);
  if (tank.heaterId === heaterId && !tank.heaterBroken) return fail('That heater is already installed.');
  if (!spend(state, h.cost, `${h.name} for ${tank.name}`)) return fail('Not enough money.');
  tank.heaterId = heaterId;
  tank.heaterBroken = false;
  return ok(`Installed a ${h.name}.`, 10);
}

export function removeHeater(_state: GameState, tank: TankState): ActionResult {
  if (_state.idle) return idleRefusal();
  if (!tank.heaterId) return fail('No heater installed.');
  tank.heaterId = null;
  return ok('Heater removed. This tank will drift to room temperature.', 5);
}

export function toggleAirStone(state: GameState, tank: TankState): ActionResult {
  if (state.idle) return idleRefusal();
  if (tank.airStone) {
    tank.airStone = false;
    return ok('Air stone switched off.', 2);
  }
  if (!spend(state, AIR_PUMP.cost, `Air pump for ${tank.name}`)) return fail('Not enough money.');
  tank.airStone = true;
  return ok('Air stone installed. Bubbles!', 8);
}

export function setHeater(tank: TankState, temp: number): void {
  tank.heaterSetpoint = clamp(Math.round(temp * 2) / 2, 18, 30);
}

export function addDecor(state: GameState, tank: TankState, defId: string, x: number, layer: 0 | 1 | 2): ActionResult {
  if (state.idle) return idleRefusal();
  const def = getDecor(defId);
  if (tank.decor.length >= MAX_DECOR) return fail('This tank is full of decor.');
  const why = decorRefusal(state, tank, defId, true);
  if (why) return fail(why);
  if (!spend(state, def.cost, `${def.name} for ${tank.name}`)) return fail('Not enough money.');
  // New plants arrive as young nursery plants and corals as small colonies; both grow into the tank.
  tank.decor.push({ uid: newId(state, 'd'), defId, x: clamp01(x), layer, flip: x > 0.5, health: 1, size: def.kind === 'plant' ? 0.6 : def.kind === 'coral' ? NEW_CORAL_SIZE : 1 });
  for (const f of fishInTank(state, tank.id)) f.shock = Math.min(60, f.shock + 3);
  return ok(`Placed ${def.name}.`, 5);
}

/** Removing decor keeps it: it goes to the stockroom (see plants.ts). */
export function removeDecorItem(state: GameState, tank: TankState, uid: string): ActionResult {
  if (state.idle) return idleRefusal();
  return removeToStorage(state, tank, uid);
}

export function ownsSubstrate(tank: TankState, id: string): boolean {
  return id === tank.substrateId || id === 'bare' || getSubstrate(id).cost === 0 || (tank.ownedSubstrates ?? []).includes(id);
}

export function ownsBackground(tank: TankState, id: string): boolean {
  return id === tank.backgroundId || getBackground(id).cost === 0 || (tank.ownedBackgrounds ?? []).includes(id);
}

export function setSubstrate(state: GameState, tank: TankState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const s = getSubstrate(id);
  if (tank.substrateId === id) return fail('Already using that substrate.');
  const owned = ownsSubstrate(tank, id);
  if (!owned && !spend(state, s.cost, `${s.name} for ${tank.name}`)) return fail('Not enough money.');
  tank.ownedSubstrates = [...new Set([...(tank.ownedSubstrates ?? []), tank.substrateId, id])];
  tank.substrateId = id;
  tank.water.cloudiness = clamp01(tank.water.cloudiness + 0.35);
  for (const f of fishInTank(state, tank.id)) f.shock = Math.min(60, f.shock + 15);
  return ok(`Substrate replaced with ${s.name}. The water is cloudy for a while.`, 30);
}

export function setBackground(state: GameState, tank: TankState, id: string): ActionResult {
  if (state.idle) return idleRefusal();
  const b = getBackground(id);
  if (tank.backgroundId === id) return fail('Already using that background.');
  const owned = ownsBackground(tank, id);
  if (!owned && !spend(state, b.cost, `${b.name} for ${tank.name}`)) return fail('Not enough money.');
  tank.ownedBackgrounds = [...new Set([...(tank.ownedBackgrounds ?? []), tank.backgroundId, id])];
  tank.backgroundId = id;
  return ok(`Applied ${b.name}.`, 10);
}

/** Total value of living stock in a tank at suggested prices (for UI). */
export function tankStockValue(state: GameState, tank: TankState): number {
  return fishInTank(state, tank.id).reduce((s, f) => s + fishValue(f), 0);
}
