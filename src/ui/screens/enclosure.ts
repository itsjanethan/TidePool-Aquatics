/**
 * Enclosure UI pieces (vivariums, terrariums, paludariums): the climate
 * check, the header line, and the equipment rows (vents, mister, basking
 * lamp, UVB, clean-up crew). Numbers come from sim/terrarium.ts.
 */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { getSpecies } from '../../data/species';
import { TERRA_EQUIPMENT, VENT_LEVELS } from '../../data/terra';
import { fishInTank } from '../../sim/fish';
import { addCleanupCrew, effectiveTemp, enclosureFeeder, feederStock, hotspot, isLandAnimal, isLandOnly, landVolume, setHeatLamp, setVent, terraOf, toggleMister, toggleUvb } from '../../sim/terrarium';
import type { GameState, TankState } from '../../sim/types';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { locked } from './locks';

interface Reading {
  label: string;
  value: string;
  level: 'good' | 'warn' | 'bad';
  note: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Climate and husbandry readings judged against the animals living here. */
export function climateReadings(state: GameState, tank: TankState): Reading[] {
  const t = terraOf(tank);
  const animals = [...new Set(fishInTank(state, tank.id).map((f) => f.speciesId))].map(getSpecies).filter(isLandAnimal);
  const out: Reading[] = [];
  const names = (list: typeof animals) => list.map((sp) => sp.commonName).join(', ');
  const dry = animals.filter((sp) => t.humidity < sp.terra!.humidity[0]);
  const wet = animals.filter((sp) => t.humidity > sp.terra!.humidity[1] + 3);
  out.push({
    label: 'Humidity', value: `${Math.round(t.humidity)}%`, level: dry.length || wet.length ? 'warn' : 'good',
    note: dry.length ? `Too dry for ${names(dry)} (${dry.map((sp) => `${sp.terra!.humidity[0]}%+`).join(', ')}). Mist or close the vents.` : wet.length ? `Too humid for ${names(wet)}. Open the vents.` : animals.length ? `Suits ${names(animals)}.` : 'Nobody living here yet.',
  });
  const cold = animals.filter((sp) => effectiveTemp(sp, tank) < sp.temperature.min);
  const hot = animals.filter((sp) => effectiveTemp(sp, tank) > sp.temperature.max);
  out.push({ label: 'Air temperature', value: `${t.airTemp.toFixed(1)}°C`, level: cold.length || hot.length ? 'bad' : 'good', note: cold.length ? `Too cold for ${names(cold)}.` : hot.length ? `Too hot for ${names(hot)}.` : 'Comfortable.' });
  const baskers = animals.filter((sp) => sp.terra!.basking);
  out.push({
    label: 'Basking spot', value: t.heatLamp === null ? 'none' : `${hotspot(tank).toFixed(0)}°C${tank.lightOn ? '' : ' (lamp off at night)'}`,
    level: baskers.length && t.heatLamp === null ? 'bad' : 'good',
    note: baskers.length ? `${names(baskers)} bask at about ${baskers[0].terra!.basking}°C.` : t.heatLamp === null ? 'No lamp. Frogs do not need one.' : 'A warm spot under the lamp.',
  });
  const stale = animals.filter((sp) => t.vent < sp.terra!.ventilation - 0.05);
  out.push({ label: 'Ventilation', value: VENT_LEVELS.find((v) => Math.abs(v.value - t.vent) < 0.01)?.label ?? pct(t.vent), level: stale.length ? 'warn' : 'good', note: stale.length ? `${names(stale)} want more air.` : 'Fresh enough.' });
  out.push({ label: 'Substrate moisture', value: pct(t.moisture), level: 'good', note: t.mister ? 'The mister keeps it damp.' : 'Dries out without misting.' });
  out.push({ label: 'Mould', value: pct(t.mould), level: t.mould > 0.5 ? 'bad' : t.mould > 0.3 ? 'warn' : 'good', note: t.mould > 0.3 ? 'Spot clean and ventilate.' : t.bioactive ? 'Springtails keep it in check.' : 'None to speak of.' });
  out.push({ label: 'Waste', value: pct(t.waste), level: t.waste > 0.6 ? 'bad' : t.waste > 0.4 ? 'warn' : 'good', note: t.bioactive ? 'Clean-up crew at work.' : 'Spot clean regularly.' });
  out.push({ label: 'Water dish', value: pct(t.dish), level: t.dish < 0.2 ? 'bad' : t.dish < 0.4 ? 'warn' : 'good', note: t.dish < 0.4 ? 'Refresh it.' : 'Fresh.' });
  if (animals.some((sp) => sp.terra!.calcium)) out.push({ label: 'Calcium', value: pct(t.calcium), level: t.calcium < 0.3 ? 'bad' : t.calcium < 0.5 ? 'warn' : 'good', note: t.uvb ? 'UVB helps them use it.' : 'Dusted feeds top it up.' });
  return out;
}

export function climateReportEl(state: GameState, tank: TankState): HTMLElement {
  return h('div', { class: 'readings' }, ...climateReadings(state, tank).map((r) =>
    h('div', { class: `reading ${r.level}` }, h('span', { class: 'r-label' }, r.label), h('span', { class: 'r-value' }, r.value), h('div', { class: 'r-note' }, r.note))));
}

/** One line for the tank header. */
export function enclosureLine(tank: TankState): string {
  const t = terraOf(tank);
  const kit = [t.mister ? 'mister' : '', t.heatLamp !== null ? `lamp ${t.heatLamp}°C` : '', t.uvb ? 'UVB' : '', t.bioactive ? 'bioactive' : ''].filter(Boolean).join(', ');
  return `${tank.habitat} · ${landVolume(tank)}L${isLandOnly(tank) ? '' : ` + ${tank.litres}L pool`} · ${Math.round(t.humidity)}% · ${t.airTemp.toFixed(1)}°C${kit ? ` · ${kit}` : ''}`;
}

/** The feeder stock line for the Feed row. */
export function feederRight(state: GameState, tank: TankState): string {
  const f = enclosureFeeder(state, tank);
  if (!f) return '';
  const st = feederStock(state, f);
  return `${st.name}: ${st.count}`;
}

/** Equipment rows for an enclosure. */
export function enclosureEquipment(c: GameController, tank: TankState, doIt: (fn: () => { ok: boolean; message: string; minutes: number }) => void, refresh: () => void): MenuItem[] {
  const s = c.state;
  const t = terraOf(tank);
  const vi = Math.max(0, VENT_LEVELS.findIndex((v) => Math.abs(v.value - t.vent) < 0.01));
  const vent = (d: number) => { c.perform(setVent(s, tank, VENT_LEVELS[Math.max(0, Math.min(VENT_LEVELS.length - 1, vi + d))].value)); refresh(); };
  const list: MenuItem[] = [
    { label: 'Climate', header: true },
    locked(c, 'maintenance', { label: 'Vents', right: VENT_LEVELS[vi]?.label ?? pct(t.vent), hint: 'Left/right. More air dries the enclosure and stops mould; less keeps humidity in for frogs.', onLeft: () => vent(-1), onRight: () => vent(1), action: () => vent(1) }),
    locked(c, 'buy', { label: t.mister ? 'Automatic mister: ON' : `Fit ${TERRA_EQUIPMENT.mister.name.toLowerCase()}`, right: t.mister ? 'switch off' : formatMoney(TERRA_EQUIPMENT.mister.cost), hint: TERRA_EQUIPMENT.mister.description, action: () => doIt(() => toggleMister(s, tank)) }),
  ];
  if (t.heatLamp === null) list.push(locked(c, 'buy', { label: `Fit ${TERRA_EQUIPMENT.heatLamp.name.toLowerCase()}`, right: formatMoney(TERRA_EQUIPMENT.heatLamp.cost), hint: TERRA_EQUIPMENT.heatLamp.description, action: () => doIt(() => setHeatLamp(s, tank, 32)) }));
  else {
    list.push(locked(c, 'maintenance', { label: 'Basking lamp thermostat', right: `${t.heatLamp}°C`, hint: 'Left/right to adjust. Desert geckos want about 32°C; frogs and crested geckos need no lamp.', onLeft: () => { c.perform(setHeatLamp(s, tank, t.heatLamp! - 1)); refresh(); }, onRight: () => { c.perform(setHeatLamp(s, tank, t.heatLamp! + 1)); refresh(); } }));
    list.push(locked(c, 'maintenance', { label: 'Remove basking lamp', action: () => doIt(() => setHeatLamp(s, tank, null)) }));
  }
  list.push(locked(c, 'buy', { label: t.uvb ? 'UVB tube: ON' : `Fit ${TERRA_EQUIPMENT.uvb.name}`, right: t.uvb ? 'remove' : formatMoney(TERRA_EQUIPMENT.uvb.cost), hint: TERRA_EQUIPMENT.uvb.description, action: () => doIt(() => toggleUvb(s, tank)) }));
  list.push(locked(c, 'buy', { label: t.bioactive ? 'Clean-up crew: living in the substrate' : `Add ${TERRA_EQUIPMENT.cleanupCrew.name.toLowerCase()}`, right: t.bioactive ? '' : formatMoney(TERRA_EQUIPMENT.cleanupCrew.cost), disabled: t.bioactive, hint: TERRA_EQUIPMENT.cleanupCrew.description, action: () => doIt(() => addCleanupCrew(s, tank)) }));
  return list;
}
