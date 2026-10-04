/**
 * TankDiagnostics: one source of truth for "is this tank OK, and if not,
 * why?". Derives structured issues from the existing systems (water
 * chemistry, stress, aquascape, habitat needs, stocking, hunger, health,
 * cleanliness, equipment) with numbers, affected fish, consequences and the
 * actions that help. The tank menu, overworld icons, staff AI and help all
 * read this module instead of keeping their own rules.
 */
import { isMarine, MARINE_SAFE, sgLabel, specificGravity, TARGET_SALINITY } from './marine';
import { clamp } from '../core/math';
import { DECOR, getDecor } from '../data/catalog';
import { getSpecies } from '../data/species';
import { summarizeAquascape, type AquascapeSummary } from './aquascape';
import { stockingRatio, stressTarget } from './compat';
import { appetite, fishInTank } from './fish';
import { coverPercent, tankNeeds, type TankNeeds } from './habitat';
import { previewFix, previewLine, wastePercent, type FixId } from './preview';
import { cycleStatus, waterQualityScore } from './water';
import { assessCoral, coralsIn, reefChem, reefState } from './reef';
import { ALK_SWING_LIMIT, REEF_TARGETS } from '../data/reef';
import { canEat, isInvert } from './inverts';
import type { FishEntity, GameState, TankState } from './types';

export type Severity = 'critical' | 'warning' | 'advice';
export type DiagCategory = 'livestock' | 'water' | 'cleanliness' | 'habitat' | 'stocking' | 'equipment';
/** Overworld icon for an issue. Each maps to exactly one meaning. */
export type AlertIcon = 'dead' | 'toxic' | 'sick' | 'hungry' | 'dirty' | 'attention';
/** Screens a recommendation can jump to. */
export type NavId = 'aquascape' | 'livestock' | 'equipment' | 'waterTest' | 'maintenance' | 'order' | 'reef';

export interface DiagAction {
  label: string;
  fix?: FixId;
  nav?: NavId;
  /** Predicted effect, e.g. "Ammonia 0.42 → 0.21 ppm · 30 min". */
  effect?: string;
}

export interface Diagnostic {
  id: string;
  severity: Severity;
  category: DiagCategory;
  icon: AlertIcon;
  title: string;
  explanation: string;
  value?: string;
  recommended?: string;
  affected: Array<{ label: string; count: number }>;
  consequences: string[];
  actions: DiagAction[];
  /** Glossary entry id for more help. */
  help?: string;
}

export interface TankScores {
  welfare: number;
  water: number;
  cleanliness: number;
  habitat: number;
  /** Capacity used, % (100 = full). */
  stocking: number;
}

export interface TankReport {
  status: 'good' | 'attention' | 'urgent' | 'empty';
  scores: TankScores;
  issues: Diagnostic[];
  needs: TankNeeds;
  scape: AquascapeSummary;
  coverPct: number;
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

export const STATUS_LABEL: Record<TankReport['status'], string> = {
  good: 'Good',
  attention: 'Needs attention',
  urgent: 'Urgent',
  empty: 'Empty',
};

/** Groups fish by species into "6 Corydoras" style labels. */
function bySpecies(fish: FishEntity[]): Array<{ label: string; count: number }> {
  const m = new Map<string, number>();
  for (const f of fish) m.set(f.speciesId, (m.get(f.speciesId) ?? 0) + 1);
  return [...m.entries()].map(([sid, count]) => ({ label: getSpecies(sid).commonName, count })).sort((a, b) => b.count - a.count);
}

/** Decor that may go in this tank (marine: rock and caves only; live rock is marine only). */
export function decorFits(tank: Pick<TankState, 'waterType'>, d: (typeof DECOR)[number]): boolean {
  return tank.waterType === 'marine' ? d.kind !== 'plant' && d.kind !== 'wood' : !d.marineOnly;
}

/** Decor suggestions that add hiding cover in this tank, best value first. */
export function coverSuggestions(tank: TankState, limit = 3): Array<{ defId: string; label: string; gainPct: number }> {
  const sizeScale = 60 / Math.max(40, tank.lengthCm);
  return DECOR.filter((d) => d.cover > 0.05 && decorFits(tank, d))
    .map((d) => ({ defId: d.id, label: d.name, gainPct: Math.round(d.cover * sizeScale * 160), cost: d.cost }))
    .sort((a, b) => b.gainPct / Math.sqrt(b.cost) - a.gainPct / Math.sqrt(a.cost))
    .slice(0, limit)
    .map(({ defId, label, gainPct }) => ({ defId, label, gainPct }));
}

/** Decor that adds cave slots. */
export function caveSuggestions(limit = 3, tank: Pick<TankState, 'waterType'> = {}): Array<{ defId: string; label: string; slots: number }> {
  return DECOR.filter((d) => d.cave && decorFits(tank, d))
    .map((d) => ({ defId: d.id, label: d.name, slots: d.caveSlots ?? 1, cost: d.cost }))
    .sort((a, b) => b.slots / b.cost - a.slots / a.cost)
    .slice(0, limit)
    .map(({ defId, label, slots }) => ({ defId, label, slots }));
}

/**
 * Full diagnosis. `withPreviews` runs each suggested maintenance action on a
 * cloned state to attach exact before → after effects (UI only; slower).
 */
export function diagnoseTank(state: GameState, tank: TankState, withPreviews = false): TankReport {
  const all = fishInTank(state, tank.id, true);
  const alive = all.filter((f) => f.alive);
  const dead = all.filter((f) => !f.alive);
  const scape = summarizeAquascape(tank);
  const needs = tankNeeds(alive);
  const coverPct = coverPercent(scape);
  const w = tank.water;
  const issues: Diagnostic[] = [];
  const effect = (fix: FixId) => (withPreviews ? previewLine(previewFix(state, tank.id, fix)) : undefined);
  const fixAction = (fix: FixId, label: string): DiagAction => ({ label, fix, effect: effect(fix) });
  const add = (d: Omit<Diagnostic, 'affected' | 'consequences' | 'actions'> & Partial<Pick<Diagnostic, 'affected' | 'consequences' | 'actions'>>) =>
    issues.push({ affected: [], consequences: [], actions: [], ...d });

  // --- Livestock --------------------------------------------------------
  if (dead.length) {
    add({
      id: 'dead', severity: 'critical', category: 'livestock', icon: 'dead',
      title: `${dead.length} dead fish in the tank`,
      explanation: 'Dead fish rot quickly, releasing ammonia that poisons the rest. Customers are upset by them.',
      affected: bySpecies(dead),
      consequences: ['Ammonia spike', 'Fish welfare and cleanliness reputation', 'Customers react badly'],
      actions: [fixAction('removeDead', 'Remove dead fish')],
      help: 'icon_dead',
    });
  }

  // --- Water chemistry ----------------------------------------------------
  const toxic = (id: 'ammonia' | 'nitrite', v: number) => {
    if (v < 0.1 || !alive.length) return;
    const sev: Severity = v >= 0.5 ? 'critical' : v >= 0.25 ? 'warning' : 'advice';
    add({
      id, severity: sev, category: 'water', icon: sev === 'advice' ? 'attention' : 'toxic',
      title: `${id === 'ammonia' ? 'Ammonia' : 'Nitrite'} in the water`,
      explanation: id === 'ammonia'
        ? 'Ammonia comes from fish waste, rotting food and dead fish. Mature filter bacteria turn it into nitrite.'
        : 'Nitrite is made from ammonia by filter bacteria and turned into safer nitrate by a second group of bacteria.',
      value: `${v.toFixed(2)} ppm`, recommended: '0 ppm',
      affected: bySpecies(alive),
      consequences: ['Fish stress', v >= 0.25 ? 'Health loss and deaths' : 'Health loss if it rises'],
      actions: [fixAction('water50', '50% water change'), fixAction('water25', '25% water change'), { label: 'Feed less and check stocking', nav: 'livestock' }],
      help: id,
    });
  };
  toxic('ammonia', w.ammonia);
  toxic('nitrite', w.nitrite);
  if (w.nitrate > 40 && alive.length) {
    const sev: Severity = w.nitrate > 100 ? 'critical' : w.nitrate > 60 ? 'warning' : 'advice';
    add({
      id: 'nitrate', severity: sev, category: 'water', icon: sev === 'advice' ? 'attention' : 'dirty',
      title: 'Nitrate getting high',
      explanation: 'Nitrate builds up between water changes. It is far less toxic than ammonia, but high levels wear fish down and feed algae.',
      value: `${Math.round(w.nitrate)} ppm`, recommended: 'under 40 ppm',
      consequences: ['Long-term health', 'Algae growth'],
      actions: [fixAction('water25', '25% water change'), fixAction('water50', '50% water change'), { label: 'More plants or floating plants', nav: 'aquascape' }],
      help: 'nitrate',
    });
  }
  const cyc = cycleStatus(w);
  if (alive.length && cyc !== 'cycled') {
    add({
      id: 'cycle', severity: cyc === 'uncycled' ? 'critical' : 'warning', category: 'water', icon: 'toxic',
      title: cyc === 'uncycled' ? 'Tank is not cycled' : 'Tank is still cycling',
      explanation: 'Filter bacteria have not built up yet, so ammonia and nitrite from the fish are not being removed.',
      value: cyc, recommended: 'cycled',
      consequences: ['Ammonia and nitrite spikes', 'Deaths in new stock'],
      actions: [fixAction('water25', 'Small, frequent water changes'), { label: 'Bacteria starter (Maintenance)', nav: 'maintenance' }],
      help: 'cycle',
    });
  }
  // Temperature and pH against what each species present needs.
  const species = [...new Set(alive.map((f) => f.speciesId))].map(getSpecies);
  const cold = species.filter((sp) => w.temperature < sp.temperature.min);
  const hot = species.filter((sp) => w.temperature > sp.temperature.max);
  for (const [list, word] of [[cold, 'cold'], [hot, 'warm']] as const) {
    if (!list.length) continue;
    const off = Math.max(...list.map((sp) => (word === 'cold' ? sp.temperature.min - w.temperature : w.temperature - sp.temperature.max)));
    add({
      id: `temp_${word}`, severity: off > 3 ? 'critical' : 'warning', category: 'water', icon: off > 3 ? 'toxic' : 'attention',
      title: `Too ${word} for ${list.map((sp) => sp.commonName).join(', ')}`,
      explanation: word === 'cold' ? 'Tropical fish need a heater set within their range.' : 'Coldwater fish suffer in heated or summer-warm water; warm water also holds less oxygen.',
      value: `${w.temperature.toFixed(1)}°C`, recommended: list.map((sp) => `${sp.commonName} ${sp.temperature.min}-${sp.temperature.max}°C`).join(', '),
      affected: bySpecies(alive.filter((f) => list.some((sp) => sp.id === f.speciesId))),
      consequences: ['Stress', 'Health loss'],
      actions: [{ label: word === 'cold' ? 'Add or adjust a heater' : 'Turn the heater down or remove it', nav: 'equipment' }],
      help: 'temperature',
    });
  }
  const badPh = species.filter((sp) => w.ph < sp.ph.min || w.ph > sp.ph.max);
  if (badPh.length) {
    const phOff = Math.max(...badPh.map((sp) => Math.max(sp.ph.min - w.ph, w.ph - sp.ph.max)));
    add({
      id: 'ph', severity: phOff > 0.3 ? 'warning' : 'advice', category: 'water', icon: 'attention',
      title: `pH unsuitable for ${badPh.map((sp) => sp.commonName).join(', ')}`,
      explanation: 'Wood lowers pH; limestone raises it. Water changes bring it back toward tap water.',
      value: w.ph.toFixed(1), recommended: badPh.map((sp) => `${sp.commonName} ${sp.ph.min}-${sp.ph.max}`).join(', '),
      affected: bySpecies(alive.filter((f) => badPh.some((sp) => sp.id === f.speciesId))),
      consequences: ['Stress'],
      actions: [{ label: 'Change wood or rock', nav: 'aquascape' }, fixAction('water25', '25% water change')],
      help: 'ph',
    });
  }
  if (isMarine(tank)) {
    const sal = w.salinity ?? TARGET_SALINITY;
    const off = sal < MARINE_SAFE[0] ? MARINE_SAFE[0] - sal : sal > MARINE_SAFE[1] ? sal - MARINE_SAFE[1] : 0;
    const drift = Math.abs(sal - TARGET_SALINITY);
    if (off > 0 || drift > 0.8) {
      const high = sal > TARGET_SALINITY;
      add({
        id: 'salinity', severity: off > 1.5 ? 'critical' : off > 0 ? 'warning' : 'advice', category: 'water', icon: off > 1.5 ? 'toxic' : 'attention',
        title: high ? 'Salinity too high' : 'Salinity too low',
        explanation: high
          ? 'Water evaporates but salt stays behind, so salinity creeps up every day. Top off with RO (pure) water, never salt water.'
          : 'Salinity fell, usually from a water change without salt mix. Change water with properly mixed saltwater.',
        value: sgLabel(sal), recommended: `SG ${specificGravity(MARINE_SAFE[0]).toFixed(3)}-${specificGravity(MARINE_SAFE[1]).toFixed(3)}, ideally ${specificGravity(TARGET_SALINITY).toFixed(3)}`,
        affected: bySpecies(alive),
        consequences: off > 0 ? ['Stress', 'Health loss'] : ['Drifting out of range'],
        actions: high ? [fixAction('topoff', 'Top off with RO water')] : [fixAction('water25', '25% water change with salt mix')],
        help: 'salinity',
      });
    }
    const wrong = alive.filter((f) => getSpecies(f.speciesId).waterType !== 'marine');
    if (wrong.length) {
      add({
        id: 'wrong_water', severity: 'critical', category: 'livestock', icon: 'toxic',
        title: 'Freshwater fish in saltwater', explanation: 'Freshwater fish cannot survive in a marine tank. Move them now.',
        affected: bySpecies(wrong), consequences: ['Rapid death'], actions: [{ label: 'Move fish', nav: 'livestock' }], help: 'salinity',
      });
    }
  } else {
    const wrong = alive.filter((f) => getSpecies(f.speciesId).waterType === 'marine');
    if (wrong.length) {
      add({
        id: 'wrong_water', severity: 'critical', category: 'livestock', icon: 'toxic',
        title: 'Marine fish in freshwater', explanation: 'Marine fish cannot survive in freshwater. Move them to a marine tank now.',
        affected: bySpecies(wrong), consequences: ['Rapid death'], actions: [{ label: 'Move fish', nav: 'livestock' }], help: 'salinity',
      });
    }
  }
  if (w.oxygen < 5 && alive.length) {
    add({
      id: 'oxygen', severity: w.oxygen < 3.5 ? 'critical' : 'warning', category: 'water', icon: 'attention',
      title: 'Low oxygen',
      explanation: 'Warm water, heavy stocking and a still surface reduce oxygen. Fish gasp at the surface.',
      value: `${w.oxygen.toFixed(1)} mg/L`, recommended: 'above 6 mg/L',
      consequences: ['Stress', 'Health loss'],
      actions: [{ label: 'Add an air stone', nav: 'equipment' }],
      help: 'oxygen',
    });
  }

  // --- Reef: chemistry and corals ---------------------------------------------
  const corals = coralsIn(tank);
  if (corals.length) {
    const defs = corals.map((d) => getDecor(d.defId));
    const stony = defs.filter((d) => d.coral && d.coral.group !== 'soft');
    const sps = defs.filter((d) => d.coral?.group === 'sps');
    const chem = reefChem(w);
    const coralGroups = (list: typeof corals) => {
      const m = new Map<string, number>();
      for (const d of list) m.set(getDecor(d.defId).name, (m.get(getDecor(d.defId).name) ?? 0) + 1);
      return [...m.entries()].map(([label, count]) => ({ label, count }));
    };
    if (stony.length && chem.alk < REEF_TARGETS.alk[0]) {
      add({
        id: 'alk_low', severity: chem.alk < 6.5 ? 'critical' : 'warning', category: 'water', icon: chem.alk < 6.5 ? 'toxic' : 'attention',
        title: 'Alkalinity low for stony corals',
        explanation: 'Stony corals use alkalinity (carbonate) to build skeleton. When it runs low, growth stops and tissue starts to recede. Dose alkalinity buffer, or do a water change with salt mix.',
        value: `${chem.alk.toFixed(1)} dKH`, recommended: `${REEF_TARGETS.alk[0]}-${REEF_TARGETS.alk[1]} dKH`,
        affected: coralGroups(corals.filter((d) => getDecor(d.defId).coral?.group !== 'soft')),
        consequences: ['Stony corals stop growing', 'Tissue recession'],
        actions: [fixAction('doseAlk', 'Dose alkalinity buffer'), fixAction('water25', '25% water change with salt mix'), { label: 'Reef care: dosing pump', nav: 'reef' }],
        help: 'alkalinity',
      });
    }
    if (sps.length && chem.alk > 11.5) {
      add({
        id: 'alk_high', severity: 'warning', category: 'water', icon: 'attention',
        title: 'Alkalinity too high for SPS',
        explanation: 'Very high alkalinity burns the growing tips of small-polyp stony corals. Stop dosing alkalinity until it falls back.',
        value: `${chem.alk.toFixed(1)} dKH`, recommended: `${REEF_TARGETS.alk[0]}-${REEF_TARGETS.alk[1]} dKH`,
        consequences: ['Burnt tips on SPS'], actions: [fixAction('water25', '25% water change'), { label: 'Reef care', nav: 'reef' }], help: 'alkalinity',
      });
    }
    if (stony.length && chem.calcium < REEF_TARGETS.calcium[0]) {
      add({
        id: 'calcium_low', severity: chem.calcium < 360 ? 'warning' : 'advice', category: 'water', icon: 'attention',
        title: 'Calcium low',
        explanation: 'Stony corals take calcium from the water with the alkalinity. Below about 360 ppm they cannot build skeleton.',
        value: `${Math.round(chem.calcium)} ppm`, recommended: `${REEF_TARGETS.calcium[0]}-${REEF_TARGETS.calcium[1]} ppm`,
        consequences: ['Stony corals stop growing'], actions: [fixAction('doseCa', 'Dose calcium'), fixAction('water25', '25% water change with salt mix')], help: 'calcium',
      });
    }
    if (stony.length && chem.magnesium < REEF_TARGETS.magnesium[0]) {
      add({
        id: 'magnesium_low', severity: chem.magnesium < 1150 ? 'warning' : 'advice', category: 'water', icon: 'attention',
        title: 'Magnesium low',
        explanation: 'Magnesium stops calcium and carbonate from dropping out of the water as grit. When it is low, alkalinity and calcium fall faster and are hard to hold.',
        value: `${Math.round(chem.magnesium)} ppm`, recommended: `${REEF_TARGETS.magnesium[0]}-${REEF_TARGETS.magnesium[1]} ppm`,
        consequences: ['Alkalinity and calcium fall faster', 'Slower coral growth'], actions: [fixAction('doseMg', 'Dose magnesium'), fixAction('water25', '25% water change with salt mix')], help: 'magnesium',
      });
    }
    const swing = reefState(tank).alkSwing ?? 0;
    if (stony.length && swing > ALK_SWING_LIMIT) {
      add({
        id: 'alk_swing', severity: 'warning', category: 'water', icon: 'attention',
        title: 'Alkalinity swinging',
        explanation: 'Big daily jumps in alkalinity stress stony corals more than a steady, slightly low level. Dose smaller amounts more often, or fit a dosing pump that tops up gradually.',
        value: `${swing.toFixed(1)} dKH today`, recommended: `under ${ALK_SWING_LIMIT} dKH a day`,
        consequences: ['Stony corals stressed'], actions: [{ label: 'Reef care: dosing pump', nav: 'reef' }], help: 'alkalinity',
      });
    }
    const assessed = corals.map((d) => ({ d, a: assessCoral(tank, d) }));
    const by = (key: string) => assessed.filter((x) => x.a.notes.some((n) => n.key === key && !n.good)).map((x) => x.d);
    const light = by('light');
    if (light.length) {
      const bright = light.filter((d) => assessCoral(tank, d).bleachPerDay > 0);
      add({
        id: 'coral_light', severity: bright.length ? 'warning' : 'advice', category: 'habitat', icon: 'attention',
        title: bright.length ? 'Corals getting too much light' : 'Corals not getting enough light',
        explanation: 'Each coral wants a band of light (PAR). Light is strongest at the top of the rockwork and weakest on the sand. Move corals up or down, or change the reef light.',
        affected: coralGroups(light),
        value: light.map((d) => { const a = assessCoral(tank, d); return `${getDecor(d.defId).name} ${a.par} PAR (wants ${a.traits.par[0]}-${a.traits.par[1]})`; }).slice(0, 3).join('; '),
        consequences: bright.length ? ['Bleaching', 'Health loss'] : ['Slow growth', 'Slow decline if very dim'],
        actions: [{ label: 'Move corals (Aquascape)', nav: 'aquascape' }, { label: 'Reef care: lighting', nav: 'reef' }],
        help: 'par',
      });
    }
    const flow = by('flow');
    if (flow.length) {
      add({
        id: 'coral_flow', severity: 'advice', category: 'habitat', icon: 'attention',
        title: 'Water movement wrong for some corals',
        explanation: 'Corals need water moving over them to bring food and carry waste away; too much and they stay shut. Flow is strongest high on the rockwork.',
        affected: coralGroups(flow),
        consequences: ['Slow growth', 'Polyps retracted or waste settling'],
        actions: [{ label: 'Move corals (Aquascape)', nav: 'aquascape' }, { label: 'Reef care: wavemaker', nav: 'reef' }],
        help: 'flow',
      });
    }
    const stung = assessed.filter((x) => x.a.stungBy.length).map((x) => x.d);
    if (stung.length) {
      add({
        id: 'coral_sting', severity: 'warning', category: 'habitat', icon: 'attention',
        title: 'Corals stinging each other',
        explanation: 'Aggressive corals reach neighbours with sweeper tentacles or chemicals. Give them space: move them further apart side to side, or to a different height.',
        affected: coralGroups(stung),
        value: [...new Set(assessed.flatMap((x) => x.a.stungBy))].join(', ') + ' doing the stinging',
        consequences: ['Health loss on the stung coral'],
        actions: [{ label: 'Move corals (Aquascape)', nav: 'aquascape' }],
        help: 'coral_aggression',
      });
    }
    const nitrate = by('nitrate');
    if (nitrate.length && w.nitrate > 1) {
      add({
        id: 'coral_nutrients', severity: 'advice', category: 'water', icon: 'attention',
        title: 'Nitrate wrong for some corals',
        explanation: 'Soft corals cope with some nitrate; SPS want very little. Water changes, a skimmer and fewer fish lower it.',
        affected: coralGroups(nitrate), value: `${Math.round(w.nitrate)} ppm`,
        consequences: ['Browning', 'Slow decline'], actions: [fixAction('water25', '25% water change')], help: 'nitrate',
      });
    }
    const weak = corals.filter((d) => d.health < 0.5 || (d.bleach ?? 0) > 0.4);
    if (weak.length) {
      add({
        id: 'coral_sick', severity: weak.some((d) => d.health < 0.25) ? 'critical' : 'warning', category: 'livestock', icon: 'sick',
        title: `${weak.length} coral${weak.length > 1 ? 's' : ''} in poor health`,
        explanation: 'Corals recover once light, flow and chemistry suit them. Open Reef care to see what each coral is missing.',
        affected: coralGroups(weak), consequences: ['Death risk', 'Cannot be fragged', 'Customers notice pale corals'],
        actions: [{ label: 'Reef care', nav: 'reef' }],
        help: 'bleaching',
      });
    }
  }

  // --- Invertebrates ------------------------------------------------------------
  const inverts = alive.filter((f) => isInvert(getSpecies(f.speciesId)));
  if (inverts.length) {
    const atRisk = inverts.filter((p) => alive.some((h) => canEat(getSpecies(h.speciesId), h.sizeCm, getSpecies(p.speciesId), p.sizeCm)));
    if (atRisk.length) {
      const hunters = [...new Set(alive.filter((h) => atRisk.some((p) => canEat(getSpecies(h.speciesId), h.sizeCm, getSpecies(p.speciesId), p.sizeCm))).map((h) => getSpecies(h.speciesId).commonName))];
      add({
        id: 'predation', severity: 'warning', category: 'stocking', icon: 'attention',
        title: 'Invertebrates are being hunted',
        explanation: `${hunters.join(', ')} will eat shrimp small enough to swallow, and hermit crabs kill snails for their shells. Cover slows it down; separate tanks stop it.`,
        affected: bySpecies(atRisk), consequences: ['Inverts eaten', 'Stress'],
        actions: [{ label: 'Move them apart', nav: 'livestock' }, { label: 'Add cover (moss, rock)', nav: 'aquascape' }],
        help: 'inverts',
      });
    }
    const soft = inverts.filter((f) => { const sp = getSpecies(f.speciesId); return (sp.tags.includes('shell_builder') || sp.tags.includes('moults')) && w.gh < sp.hardness.min; });
    if (soft.length) {
      add({
        id: 'minerals', severity: 'warning', category: 'water', icon: 'attention',
        title: 'Water too soft for shells and moulting',
        explanation: 'Snails build shell and shrimp build new skin from minerals in the water. In soft water shells erode and moults fail. Limestone or a tap-water change raises hardness; active shrimp soil lowers it.',
        value: `${w.gh.toFixed(0)} dGH`, recommended: soft.map((f) => getSpecies(f.speciesId)).filter((sp, i, a) => a.indexOf(sp) === i).map((sp) => `${sp.commonName} ${sp.hardness.min}+`).join(', '),
        affected: bySpecies(soft), consequences: ['Shell erosion', 'Failed moults', 'Deaths'],
        actions: [{ label: 'Add Holey Limestone', nav: 'aquascape' }, fixAction('water25', '25% water change (tap water is harder)')],
        help: 'minerals',
      });
    }
  }

  // --- Feeding and health -------------------------------------------------
  const hungry = alive.filter((f) => f.hunger > 60);
  const avgHunger = alive.length ? alive.reduce((s, f) => s + f.hunger, 0) / alive.length : 0;
  if (alive.length && (avgHunger > 55 || hungry.length >= Math.max(2, alive.length * 0.5))) {
    const want = alive.reduce((s, f) => s + (appetite(f) * f.hunger) / 100, 0);
    add({
      id: 'hungry', severity: avgHunger > 78 ? 'critical' : 'warning', category: 'livestock', icon: 'hungry',
      title: `${hungry.length} fish are hungry`,
      explanation: 'Hungry fish stop growing, get stressed and lose health. Feed what they can finish; leftovers foul the water.',
      value: `Average hunger ${Math.round(avgHunger)}%`, recommended: 'under 50%',
      affected: bySpecies(hungry),
      consequences: ['No growth', 'Stress', 'Health loss when starving'],
      actions: [{ ...fixAction('feed', 'Feed (normal)'), effect: withPreviews ? `Adds about ${want.toFixed(1)} portions: covers about 100% of what they want now${tank.food > 0.2 ? ` (plus ${tank.food.toFixed(1)} already in the water)` : ''}` : undefined }],
      help: 'icon_hungry',
    });
  }
  const sick = alive.filter((f) => f.health < 50);
  if (sick.length) {
    // Explain the real cause instead of assuming toxic water.
    const causes = new Map<string, number>();
    for (const f of sick) for (const r of stressTarget(f, tank, alive, scape).reasons.slice(0, 2)) causes.set(r.reason, (causes.get(r.reason) ?? 0) + 1);
    const top = [...causes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    add({
      id: 'sick', severity: sick.some((f) => f.health < 25) ? 'critical' : 'warning', category: 'livestock', icon: 'sick',
      title: `${sick.length} fish in poor health`,
      explanation: top.length ? `Main causes: ${top.join(', ')}. Health recovers once conditions are right.` : 'Health recovers slowly in good, calm conditions.',
      value: `Lowest health ${Math.round(Math.min(...sick.map((f) => f.health)))}%`, recommended: 'above 70%',
      affected: bySpecies(sick),
      consequences: ['Death risk', 'Cannot breed', 'Customers notice sick fish'],
      actions: [{ label: 'Inspect these fish', nav: 'livestock' }],
      help: 'health',
    });
  }

  // --- Stocking and social ------------------------------------------------
  const ratio = stockingRatio(tank, alive);
  if (ratio > 1) {
    add({
      id: 'overstocked', severity: ratio > 1.3 ? 'critical' : 'warning', category: 'stocking', icon: 'attention',
      title: 'Tank is overstocked',
      explanation: 'More fish than the tank and filter can support: waste builds faster and fish are stressed by crowding.',
      value: `${Math.round(ratio * 100)}%`, recommended: 'under 100% (80% is comfortable)',
      affected: bySpecies(alive),
      consequences: ['Stress', 'Faster ammonia and nitrate build-up'],
      actions: [{ label: 'Move or sell some fish', nav: 'livestock' }, { label: 'Upgrade the filter', nav: 'equipment' }],
      help: 'stocking',
    });
  }
  for (const sp of species) {
    const n = alive.filter((f) => f.speciesId === sp.id).length;
    if ((sp.social === 'shoal' || sp.social === 'group') && n < sp.minGroupSize) {
      add({
        id: `group_${sp.id}`, severity: 'warning', category: 'stocking', icon: 'attention',
        title: `${sp.commonName} need a bigger group`,
        explanation: `${sp.commonName} feel safe in groups. Too few and they hide and stress.`,
        value: `${n}`, recommended: `${sp.minGroupSize}+`,
        affected: [{ label: sp.commonName, count: n }],
        consequences: ['Stress', 'Hiding'],
        actions: [{ label: `Order more ${sp.commonName}`, nav: 'order' }],
        help: 'groups',
      });
    }
    if (tank.litres < sp.minTankLitres) {
      add({
        id: `small_${sp.id}`, severity: 'warning', category: 'stocking', icon: 'attention',
        title: `Tank too small for ${sp.commonName}`,
        explanation: 'Fish in undersized tanks are stunted and stressed.',
        value: `${tank.litres}L`, recommended: `${sp.minTankLitres}L+`,
        affected: [{ label: sp.commonName, count: n }],
        consequences: ['Stunted growth', 'Stress'],
        actions: [{ label: 'Move them to a bigger tank', nav: 'livestock' }],
        help: 'stocking',
      });
    }
  }
  const harassed = alive.filter((f) => stressTarget(f, tank, alive, scape).reasons.some((r) => r.reason === 'Harassed by tank mates' && r.amount > 8));
  if (harassed.length) {
    add({
      id: 'harassed', severity: 'warning', category: 'stocking', icon: 'attention',
      title: 'Fish are being harassed',
      explanation: 'Some tank mates are too big, too boisterous or nip fins.',
      affected: bySpecies(harassed),
      consequences: ['Stress', 'Torn fins'],
      actions: [{ label: 'Separate them', nav: 'livestock' }],
      help: 'compatibility',
    });
  }

  // --- Habitat -------------------------------------------------------------
  if (alive.length && coverPct < needs.coverPct - 2) {
    const short = needs.coverPct - coverPct;
    const shy = needs.coverBy.filter((c) => c.pct > coverPct);
    add({
      id: 'cover', severity: short > 20 ? 'warning' : 'advice', category: 'habitat', icon: 'attention',
      title: 'Not enough hiding cover',
      explanation: 'Plants, wood, caves and floating plants give shy fish and fry somewhere to hide.',
      value: `${coverPct}%`, recommended: `${needs.coverPct}% for these fish (short by ${short}%)`,
      affected: shy.map((c) => ({ label: getSpecies(c.speciesId).commonName, count: c.count })),
      consequences: ['Stress in shy fish', 'Fewer fry survive'],
      actions: coverSuggestions(tank).map((s) => ({ label: `${s.label}: +${s.gainPct}% cover when grown`, nav: 'aquascape' as const })),
      help: 'cover',
    });
  }
  if (needs.caveSlots > scape.caveSlots) {
    add({
      id: 'caves', severity: 'warning', category: 'habitat', icon: 'attention',
      title: 'Not enough caves',
      explanation: 'Cave-dwelling fish each want a cave of their own; without one they fight and stress.',
      value: `${scape.caveSlots} / ${needs.caveSlots} cave spaces`, recommended: `${needs.caveSlots}`,
      affected: needs.caveBy.map((c) => ({ label: getSpecies(c.speciesId).commonName, count: c.count })),
      consequences: ['Stress', 'Territory fights', 'Cave spawners cannot breed'],
      actions: caveSuggestions(3, tank).map((s) => ({ label: `${s.label}: +${s.slots} cave space${s.slots > 1 ? 's' : ''}`, nav: 'aquascape' as const })),
      help: 'caves',
    });
  }
  if (needs.openSpace > 0 && scape.openSpace < needs.openSpace) {
    add({
      id: 'openspace', severity: 'advice', category: 'habitat', icon: 'attention',
      title: 'Not enough open swimming space',
      explanation: 'Active schooling fish need clear water to swim in. Move tall decor to the back or remove some.',
      value: `${Math.round(scape.openSpace * 100)}%`, recommended: `${Math.round(needs.openSpace * 100)}%+`,
      affected: needs.openBy.map((sid) => ({ label: getSpecies(sid).commonName, count: alive.filter((f) => f.speciesId === sid).length })),
      consequences: ['Stress'],
      actions: [{ label: 'Rearrange or remove decor', nav: 'aquascape' }],
      help: 'openspace',
    });
  }
  if (needs.sandBy.length && !scape.provides.has('sand')) {
    add({
      id: 'sand', severity: 'advice', category: 'habitat', icon: 'attention', title: 'Bottom sifters prefer sand',
      explanation: 'Sifting through gravel wears down barbels. A soft sand substrate keeps them happy.',
      affected: needs.sandBy.map((sid) => ({ label: getSpecies(sid).commonName, count: alive.filter((f) => f.speciesId === sid).length })),
      consequences: ['Mild stress'], actions: [{ label: 'Change substrate to sand', nav: 'aquascape' }], help: 'substrate',
    });
  }
  if (needs.woodBy.length && !scape.provides.has('wood')) {
    add({
      id: 'wood', severity: 'advice', category: 'habitat', icon: 'attention', title: 'Plecos want wood to rasp',
      explanation: 'Wood is part of a pleco diet and aids digestion.',
      affected: needs.woodBy.map((sid) => ({ label: getSpecies(sid).commonName, count: alive.filter((f) => f.speciesId === sid).length })),
      consequences: ['Mild stress'], actions: [{ label: 'Add Mopani or Spider Wood', nav: 'aquascape' }], help: 'wood',
    });
  }

  // --- Cleanliness and equipment -------------------------------------------
  if (tank.glassDirt > 0.3) {
    add({
      id: 'glass', severity: tank.glassDirt > 0.6 ? 'warning' : 'advice', category: 'cleanliness', icon: 'dirty',
      title: 'Dirty glass',
      explanation: 'Film and algae on the glass hide your fish. Customers notice.',
      value: `${Math.round(tank.glassDirt * 100)}% dirty`, recommended: 'clean',
      consequences: ['Customer impression', 'Tank beauty', 'Cleanliness reputation'],
      actions: [fixAction('glass', 'Clean the glass')],
      help: 'glass',
    });
  }
  if (tank.algae > 0.3) {
    add({
      id: 'algae', severity: tank.algae > 0.6 ? 'warning' : 'advice', category: 'cleanliness', icon: 'dirty',
      title: 'Algae growing',
      explanation: 'Light plus nitrate feeds algae. Plants, grazers, floating plants and water changes all slow it.',
      value: `${Math.round(tank.algae * 100)}%`, recommended: 'under 30%',
      consequences: ['Tank beauty', 'Cleanliness reputation'],
      actions: [fixAction('algae', 'Scrub algae'), fixAction('glass', 'Clean the glass (also removes some algae)')],
      help: 'algae',
    });
  }
  const waste = wastePercent(w.detritus);
  if (waste > 45 || tank.food > 3) {
    add({
      id: 'waste', severity: waste > 75 ? 'warning' : 'advice', category: 'cleanliness', icon: 'dirty',
      title: 'Waste building up in the substrate',
      explanation: 'Fish waste and uneaten food rot into ammonia and cloud the water.',
      value: `Waste ${waste}%, uneaten food ${tank.food.toFixed(1)}`, recommended: 'waste under 40%',
      consequences: ['Ammonia', 'Cloudy water'],
      actions: [fixAction('vacuum', 'Vacuum the substrate')],
      help: 'waste',
    });
  }
  if (w.cloudiness > 0.3) {
    add({
      id: 'cloudy', severity: 'warning', category: 'cleanliness', icon: 'dirty',
      title: 'Cloudy water',
      explanation: 'Usually a bacterial bloom in a new tank or suspended waste. Mechanical filtration clears it.',
      value: `${Math.round(w.cloudiness * 100)}%`, recommended: 'clear',
      consequences: ['Tank beauty', 'Customer impression'],
      actions: [fixAction('vacuum', 'Vacuum the substrate'), fixAction('filter', 'Rinse the filter')],
      help: 'cloudiness',
    });
  }
  if (tank.filterCondition < 0.4) {
    add({
      id: 'filter', severity: tank.filterCondition < 0.2 ? 'critical' : 'warning', category: 'equipment', icon: 'attention',
      title: 'Filter clogged',
      explanation: 'A clogged filter moves less water, so bacteria process less waste and the water clears more slowly.',
      value: `${Math.round(tank.filterCondition * 100)}% flow`, recommended: 'over 60%',
      consequences: ['Weaker filtration', 'Cloudy water', 'Ammonia risk'],
      actions: [fixAction('filter', 'Rinse the filter')],
      help: 'filter',
    });
  }
  if (tank.heaterBroken) {
    add({
      id: 'heater', severity: 'critical', category: 'equipment', icon: 'attention',
      title: 'Heater broken',
      explanation: 'The water will drift to room temperature.',
      consequences: ['Temperature crash for tropical fish'],
      actions: [{ label: 'Replace the heater', nav: 'equipment' }],
      help: 'temperature',
    });
  }

  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  // --- Scores -----------------------------------------------------------------
  const welfare = alive.length ? alive.reduce((s, f) => s + f.health * 0.6 + (100 - f.stress) * 0.4, 0) / alive.length : 100;
  const tempPenalty = (cold.length + hot.length) * 15 + badPh.length * 8;
  const water = clamp(waterQualityScore(w) - tempPenalty, 0, 100);
  const cleanliness = clamp(100 - tank.glassDirt * 35 - tank.algae * 35 - w.cloudiness * 40 - Math.max(0, waste - 30) * 0.4, 0, 100);
  const coverScore = needs.coverPct ? Math.min(1, coverPct / needs.coverPct) : 1;
  const caveScore = needs.caveSlots ? Math.min(1, scape.caveSlots / needs.caveSlots) : 1;
  const habitat = clamp(100 * (0.55 * coverScore + 0.3 * caveScore + 0.15 * (needs.openSpace ? Math.min(1, scape.openSpace / needs.openSpace) : 1)) - (issues.some((i) => i.id === 'sand' || i.id === 'wood') ? 8 : 0), 0, 100);
  const status: TankReport['status'] = !all.length ? (issues.length ? 'attention' : 'empty') : issues.some((i) => i.severity === 'critical') ? 'urgent' : issues.some((i) => i.severity === 'warning') ? 'attention' : 'good';
  return {
    status,
    scores: { welfare: Math.round(welfare), water: Math.round(water), cleanliness: Math.round(cleanliness), habitat: Math.round(habitat), stocking: Math.round(ratio * 100) },
    issues,
    needs,
    scape,
    coverPct,
  };
}

/** The icon the overworld shows for a tank: its most serious warning, or none. */
export function tankAlert(state: GameState, tank: TankState): AlertIcon | null {
  const top = diagnoseTank(state, tank).issues.find((i) => i.severity !== 'advice');
  return top ? top.icon : null;
}

/** Decor kinds that fix a diagnostic (for staff suggestions). */
export function decorForIssue(id: string): string[] {
  if (id === 'cover') return coverSuggestions({ lengthCm: 60 } as TankState, 5).map((s) => s.defId);
  if (id === 'caves') return caveSuggestions(5).map((s) => s.defId);
  if (id === 'wood') return DECOR.filter((d) => d.kind === 'wood').map((d) => d.id);
  return [];
}

export function decorName(defId: string): string {
  return getDecor(defId).name;
}
