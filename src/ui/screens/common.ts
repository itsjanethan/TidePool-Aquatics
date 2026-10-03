/** Shared UI fragments: tank status, water readout, fish cards. */
import { paintFishPortrait } from '../../render/art/fishPainter';
import { phenotypeOf } from '../../sim/phenotype';
import { clamp, formatMoney, round } from '../../core/math';
import { getFilter, getHeater } from '../../data/catalog';
import { getSpecies } from '../../data/species';
import { summarizeAquascape } from '../../sim/aquascape';
import { stockingRatio, stressTarget } from '../../sim/compat';
import { fishPrice } from '../../sim/customers';
import { displayName, fishInTank, getMorph, isMature } from '../../sim/fish';
import { isFry, lifeStage } from '../../sim/breeding';
import { genotypeKnown, strainLabel, traitView } from '../../sim/genetics';
import { cycleStatus } from '../../sim/water';
import type { FishEntity, GameState, TankState } from '../../sim/types';
import { h, meter } from '../dom';

export function tankStatusLine(state: GameState, tank: TankState): string {
  const fish = fishInTank(state, tank.id);
  const avgHunger = fish.length ? fish.reduce((s, f) => s + f.hunger, 0) / fish.length : 0;
  const bits: string[] = [];
  if (fishInTank(state, tank.id, true).some((f) => !f.alive)) bits.push('Dead fish!');
  if (tank.water.ammonia > 0.25 || tank.water.nitrite > 0.25) bits.push('Toxic water');
  if (avgHunger > 60) bits.push('Hungry');
  if (tank.algae > 0.5) bits.push('Algae');
  if (tank.glassDirt > 0.6) bits.push('Dirty glass');
  if (tank.filterCondition < 0.35) bits.push('Filter clogged');
  if (tank.heaterBroken) bits.push('Heater broken');
  return bits.join(' · ') || 'All good';
}

export function tankHeader(state: GameState, tank: TankState): HTMLElement {
  const fish = fishInTank(state, tank.id);
  const ratio = stockingRatio(tank, fish);
  const cyc = cycleStatus(tank.water);
  const filter = getFilter(tank.filterId);
  const heater = tank.heaterId ? `${getHeater(tank.heaterId).name} (${tank.heaterSetpoint}°C)${tank.heaterBroken ? ' BROKEN' : ''}` : 'No heater';
  const scape = summarizeAquascape(tank);
  return h(
    'div',
    { class: 'tank-header' },
    h('div', { class: 'row' }, h('span', null, `${tank.litres}L · ${tank.lengthCm}cm long`), h('span', null, `${tank.water.temperature.toFixed(1)}°C`)),
    h('div', { class: 'row' }, h('span', null, `${filter.name} · ${heater}`)),
    h('div', { class: 'row' }, h('span', null, 'Stocking'), meter(Math.min(1, ratio), ratio > 1 ? 'bad' : ratio > 0.8 ? 'warn' : 'good'), h('span', null, `${Math.round(ratio * 100)}%`)),
    h('div', { class: 'row' }, h('span', null, 'Aquascape'), meter(scape.beauty / 100, 'blue'), h('span', null, `${Math.round(scape.beauty)}`)),
    h('div', { class: 'row' }, h('span', { class: `tag tag-${cyc}` }, cyc.toUpperCase()), tank.forSale === false ? h('span', { class: 'tag tag-closed' }, 'NOT FOR SALE') : h('span', null, ''), h('span', { class: 'status' }, tankStatusLine(state, tank))),
  );
}

interface Reading {
  label: string;
  value: string;
  level: 'good' | 'warn' | 'bad';
  note: string;
}

export function waterReadings(state: GameState, tank: TankState): Reading[] {
  const w = tank.water;
  const fish = fishInTank(state, tank.id);
  const species = [...new Set(fish.map((f) => f.speciesId))].map(getSpecies);
  const out: Reading[] = [];
  const lvl = (bad: boolean, warn: boolean): Reading['level'] => (bad ? 'bad' : warn ? 'warn' : 'good');
  out.push({
    label: 'Ammonia', value: `${w.ammonia.toFixed(2)} ppm`, level: lvl(w.ammonia > 0.5, w.ammonia > 0.1),
    note: w.ammonia > 0.5 ? 'Toxic! Do a big water change and stop feeding.' : w.ammonia > 0.1 ? 'Detectable. The filter is struggling.' : 'Safe.',
  });
  out.push({
    label: 'Nitrite', value: `${w.nitrite.toFixed(2)} ppm`, level: lvl(w.nitrite > 0.5, w.nitrite > 0.1),
    note: w.nitrite > 0.1 ? 'Nitrite means the tank is still cycling. Water changes help.' : 'Safe.',
  });
  out.push({
    label: 'Nitrate', value: `${w.nitrate.toFixed(0)} ppm`, level: lvl(w.nitrate > 50, w.nitrate > 30),
    note: w.nitrate > 30 ? 'Getting high. Time for a water change.' : 'Fine. Plants and water changes keep it low.',
  });
  let tempNote = 'Comfortable for everyone.';
  let tempLevel: Reading['level'] = 'good';
  for (const sp of species) {
    if (w.temperature < sp.temperature.min) { tempNote = `Too cold for ${sp.commonName} (${sp.temperature.min}-${sp.temperature.max}°C).`; tempLevel = 'bad'; }
    else if (w.temperature > sp.temperature.max) { tempNote = `Too warm for ${sp.commonName} (${sp.temperature.min}-${sp.temperature.max}°C).`; tempLevel = 'bad'; }
  }
  out.push({ label: 'Temperature', value: `${w.temperature.toFixed(1)}°C`, level: tempLevel, note: tempNote });
  let phNote = 'Suits the current stock.';
  let phLevel: Reading['level'] = 'good';
  for (const sp of species) {
    if (w.ph < sp.ph.min || w.ph > sp.ph.max) { phNote = `${sp.commonName} prefer pH ${sp.ph.min}-${sp.ph.max}.`; phLevel = 'warn'; }
  }
  out.push({ label: 'pH', value: w.ph.toFixed(1), level: phLevel, note: phNote });
  let ghNote = 'Fine.';
  let ghLevel: Reading['level'] = 'good';
  for (const sp of species) {
    if (w.gh < sp.hardness.min) { ghNote = `Too soft for ${sp.commonName}. Limestone raises hardness.`; ghLevel = 'warn'; }
    if (w.gh > sp.hardness.max + 2) { ghNote = `Too hard for ${sp.commonName}.`; ghLevel = 'warn'; }
  }
  out.push({ label: 'Hardness', value: `${w.gh.toFixed(0)} dGH`, level: ghLevel, note: ghNote });
  out.push({
    label: 'Oxygen', value: `${w.oxygen.toFixed(1)} mg/L`, level: lvl(w.oxygen < 4.5, w.oxygen < 6),
    note: w.oxygen < 6 ? 'Low. Add an air stone or reduce stocking.' : 'Good.',
  });
  const cyc = cycleStatus(w);
  out.push({
    label: 'Filter bacteria', value: `${Math.round(w.aob * 100)}% / ${Math.round(w.nob * 100)}%`, level: cyc === 'cycled' ? 'good' : cyc === 'cycling' ? 'warn' : 'bad',
    note: cyc === 'cycled' ? 'Established and keeping up with the bioload.' : cyc === 'cycling' ? 'Bacteria are growing. Add fish slowly.' : 'Not cycled. Fish added now will suffer.',
  });
  out.push({
    label: 'Filter condition', value: `${Math.round(tank.filterCondition * 100)}%`, level: lvl(tank.filterCondition < 0.3, tank.filterCondition < 0.55),
    note: tank.filterCondition < 0.55 ? 'Clogging. Rinse the media in tank water.' : 'Flowing well.',
  });
  return out;
}

export function waterReportEl(state: GameState, tank: TankState): HTMLElement {
  const rows = waterReadings(state, tank).map((r) =>
    h('div', { class: `reading ${r.level}` }, h('span', { class: 'r-label' }, r.label), h('span', { class: 'r-value' }, r.value), h('div', { class: 'r-note' }, r.note)),
  );
  return h('div', { class: 'readings' }, ...rows);
}

/** Name shown for a fish: strain line, or morph and species. */
export function fishLabel(state: GameState, f: FishEntity): string {
  const strain = strainLabel(state, f);
  return strain ? `${strain} ${getSpecies(f.speciesId).commonName}` : displayName(f);
}

function stars(q: number): string {
  const n = Math.max(1, Math.min(5, Math.round(q * 5)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function relative(state: GameState, id: string | null): string {
  if (!id) return 'unknown';
  const r = state.fish[id];
  if (!r) return 'no longer in the shop';
  const where = r.tankId ? state.tanks[r.tankId]?.name ?? '' : r.alive ? 'sold' : 'died';
  return `${fishLabel(state, r)}${where ? ` (${where})` : ''}`;
}

/**
 * Fish information with progressive disclosure: the compact card answers
 * "is this fish OK and what is it worth"; the detailed card adds life stage,
 * breeding, family, inherited traits and history.
 */
export function fishCard(state: GameState, f: FishEntity, detailed = false): HTMLElement {
  const sp = getSpecies(f.speciesId);
  const morph = getMorph(sp, f.morphId);
  const tank = f.tankId ? state.tanks[f.tankId] : null;
  const sexText = f.sex === 'male' ? '♂ Male' : f.sex === 'female' ? '♀ Female' : 'Unsexed';
  const rows: HTMLElement[] = [
    h('div', { class: 'fish-name' }, fishLabel(state, f), f.alive ? '' : ' (dead)'),
    h('div', { class: 'fish-sci' }, `${sp.commonName} · ${sp.scientificName}`),
    h('div', { class: 'row' }, h('span', null, `${sexText} · ${lifeStage(f)}`), h('span', null, `${f.sizeCm.toFixed(1)}cm`)),
    h('div', { class: 'row' }, h('span', null, 'Health'), meter(f.health / 100, f.health < 40 ? 'bad' : f.health < 70 ? 'warn' : 'good')),
    h('div', { class: 'row' }, h('span', null, 'Fullness'), meter(1 - f.hunger / 100, f.hunger > 70 ? 'bad' : f.hunger > 45 ? 'warn' : 'good')),
    h('div', { class: 'row' }, h('span', null, 'Stress'), meter(f.stress / 100, f.stress > 60 ? 'bad' : f.stress > 35 ? 'warn' : 'good')),
  ];
  if (f.alive) rows.push(h('div', { class: 'row' }, h('span', null, `Quality ${stars(f.quality)}`), h('b', null, isFry(f) ? 'Too young to sell' : formatMoney(fishPrice(state, f)))));
  if (f.pregnancy) rows.push(h('div', { class: 'good small' }, `Pregnant: about ${Math.max(1, Math.ceil(f.pregnancy.daysRemaining))} day(s) to go.`));
  if (tank && f.alive) {
    const st = stressTarget(f, tank, fishInTank(state, tank.id), summarizeAquascape(tank));
    if (st.reasons.length) rows.push(h('div', { class: 'fish-issues' }, 'Bothered by: ', st.reasons.slice(0, 3).map((r) => r.reason).join(', ')));
  }
  if (detailed) rows.unshift(specimen(f));
  if (detailed) {
    const sec = (t: string) => h('div', { class: 'section-title' }, t);
    const line = (t: string) => h('div', { class: 'small' }, t);
    rows.push(sec('About'));
    rows.push(line(`Age ${round(f.ageDays, 0)} days. Grows to about ${f.adultSizeCm.toFixed(1)}cm. Look: ${morph.name}.`));
    rows.push(line(f.origin === 'bred' ? `Bred in your shop (generation F${f.generation}). ${f.originDetail}.` : `Origin: ${f.originDetail || f.origin}.`));
    if (f.alive && !isFry(f)) {
      rows.push(sec('Breeding'));
      rows.push(line(!isMature(f) ? `Not mature yet (matures at about ${sp.maturityDays} days).` : f.breedingReadiness >= 0.5 ? 'In breeding condition.' : 'Not in breeding condition: needs good food, health and calm.'));
      rows.push(line(`${sp.breeding.notes}`));
    }
    rows.push(sec('Family'));
    rows.push(line(`Mother: ${relative(state, f.parents.motherId)}`));
    rows.push(line(`Father: ${relative(state, f.parents.fatherId)}`));
    rows.push(line(`Offspring: ${f.offspringCount}`));
    const traits = traitView(f);
    if (traits.length) {
      rows.push(sec('Traits'));
      for (const t of traits) rows.push(line(`${t.name}: ${t.shown}${t.carries ? ` (carries ${t.carries})` : ''}`));
      if (!genotypeKnown(f)) rows.push(line('Hidden traits are revealed once this fish has offspring.'));
    }
    rows.push(sec('Care'));
    rows.push(h('div', { class: 'fish-desc tip' }, sp.careTip));
    rows.push(line(`Needs ${sp.temperature.min}-${sp.temperature.max}°C, pH ${sp.ph.min}-${sp.ph.max}, ${sp.minTankLitres}L+, groups of ${sp.minGroupSize}+.`));
    rows.push(line(`Tanks: ${f.tankHistory.join(' > ')}`));
    if (!f.alive) rows.push(h('div', { class: 'fish-issues' }, `Died: ${f.deathCause}`));
  }
  return h('div', { class: 'fish-card' }, ...rows);
}

export function speciesSummary(state: GameState, tankId: string): string {
  const counts = new Map<string, number>();
  for (const f of fishInTank(state, tankId)) counts.set(f.speciesId, (counts.get(f.speciesId) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${getSpecies(id).commonName} x${n}`).join(', ') || 'Empty';
}

/** A large painted portrait of this individual (same painter as the tank sprites). */
export function specimen(f: FishEntity): HTMLElement {
  const img = paintFishPortrait(phenotypeOf(f), Math.round(150 * clamp(f.sizeCm / f.adultSizeCm, 0.4, 1.05)));
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d')?.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  cv.className = 'specimen-canvas';
  if (!f.alive) cv.style.transform = 'scaleY(-1)';
  return h('div', { class: 'specimen' }, cv);
}
