/** Tank interaction menu and its sub-screens. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { FILTERS, getFilter, HEATERS } from '../../data/catalog';
import { getSpecies } from '../../data/species';
import { assessSpeciesForSetup } from '../../sim/compat';
import { fishPrice, priceRatio } from '../../sim/customers';
import { displayName, fishInTank, moveFish } from '../../sim/fish';
import {
  buyFilter, buyHeater, cleanFilter, cleanGlass, doWaterChange, feedingNeed, feedTank, removeDead, removeHeater,
  scrubAlgae, setHeater, toggleAirStone, useBacteriaStarter, vacuumSubstrate, type ActionResult,
} from '../../sim/tank';
import type { FishEntity } from '../../sim/types';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import type { MenuScreen } from '../ui';
import { fishCard, tankHeader, waterReportEl } from './common';

export function openTankMenu(c: GameController, tankId: string): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const items = (): MenuItem[] => {
    const n = fishInTank(s, tankId).length;
    return [
      { label: 'View Tank', hint: 'Watch your fish up close.', action: () => c.openTankView(tankId) },
      { label: 'Feed', right: `food: ${Math.floor(s.foodUnits)}`, action: () => openFeed(c, tankId, screen) },
      { label: `Livestock (${n})`, action: () => openLivestock(c, tankId) },
      { label: 'Water Test', hint: 'Takes 5 minutes.', action: () => openWaterTest(c, tankId) },
      { label: 'Maintenance', action: () => openMaintenance(c, tankId, screen) },
      { label: 'Equipment', action: () => openEquipment(c, tankId, screen) },
      { label: 'Aquascape', hint: 'Edit plants, rocks, wood and substrate.', action: () => c.openTankView(tankId, 'aquascape') },
      { label: 'Prices', action: () => openPrices(c, tankId) },
      { label: 'Close', action: () => c.ui.remove(screen) },
    ];
  };
  const screen: MenuScreen = c.ui.menu({ title: tank.name, items: items(), body: () => tankHeader(s, tank), className: 'tank-menu' });
  (screen as MenuScreen & { refreshAll?: () => void }).refreshAll = () => screen.refresh(items());
}

function refreshParent(parent: MenuScreen | undefined): void {
  const p = parent as (MenuScreen & { refreshAll?: () => void }) | undefined;
  p?.refreshAll?.();
}

function openFeed(c: GameController, tankId: string, parent: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const need = feedingNeed(s, tank);
  const run = (amount: 'light' | 'normal' | 'heavy') => {
    c.perform(feedTank(s, tank, amount));
    c.ui.remove(scr);
    refreshParent(parent);
  };
  const scr = c.ui.menu({
    title: 'Feed',
    body: h('div', null, need < 0.5 ? 'The fish are not very hungry.' : need > 3 ? 'The fish look hungry!' : 'The fish could eat.'),
    items: [
      { label: 'Light pinch', hint: 'Half a meal. Safest for water quality.', action: () => run('light') },
      { label: 'Normal feed', hint: 'What they will eat in a couple of minutes.', action: () => run('normal') },
      { label: 'Heavy feed', hint: 'Leftovers rot and pollute the water.', action: () => run('heavy') },
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
  });
}

export function openWaterTest(c: GameController, tankId: string): void {
  const s = c.state;
  c.sim!.advance(5);
  s.tanks[tankId].lastMaintenance.test = s.minute;
  const scr = c.ui.menu({
    title: `Water Test: ${s.tanks[tankId].name}`,
    body: () => waterReportEl(s, s.tanks[tankId]),
    items: [{ label: 'Done', action: () => c.ui.remove(scr) }],
    className: 'wide',
  });
}

function openMaintenance(c: GameController, tankId: string, parent: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const doIt = (fn: () => ActionResult) => {
    c.perform(fn());
    scr.refresh(items());
    refreshParent(parent);
  };
  const dead = () => fishInTank(s, tankId, true).filter((f) => !f.alive).length;
  const items = (): MenuItem[] => [
    { label: 'Water change 25%', right: '~20 min', hint: 'Lowers nitrate and toxins gently.', action: () => doIt(() => doWaterChange(s, tank, 0.25)) },
    { label: 'Water change 50%', right: '~30 min', hint: 'Big reset. Large changes stress fish a little.', action: () => doIt(() => doWaterChange(s, tank, 0.5)) },
    { label: 'Clean glass', right: '8 min', hint: `Glass dirt ${Math.round(tank.glassDirt * 100)}%`, action: () => doIt(() => cleanGlass(s, tank)) },
    { label: 'Scrub algae', right: '10 min', hint: `Algae ${Math.round(tank.algae * 100)}%`, action: () => doIt(() => scrubAlgae(s, tank)) },
    { label: 'Vacuum substrate', right: '15 min', hint: 'Removes rotting food and waste.', action: () => doIt(() => vacuumSubstrate(s, tank)) },
    { label: 'Rinse filter media', right: '12 min', hint: `Filter condition ${Math.round(tank.filterCondition * 100)}%`, action: () => doIt(() => cleanFilter(s, tank)) },
    { label: 'Remove dead fish', right: dead() ? `${dead()}` : '-', disabled: !dead(), action: () => doIt(() => removeDead(s, tank)) },
    { label: 'Dose bacteria starter', right: `stock ${s.dryGoods.bacteria ?? 0}`, hint: 'Speeds up cycling a new tank.', disabled: !(s.dryGoods.bacteria > 0), action: () => doIt(() => useBacteriaStarter(s, tank)) },
    { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({ title: `Maintenance: ${tank.name}`, items: items(), body: () => tankHeader(s, tank) });
}

function openEquipment(c: GameController, tankId: string, parent: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const doIt = (fn: () => ActionResult) => {
    c.perform(fn());
    scr.refresh(items());
    refreshParent(parent);
  };
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [{ label: 'Filters', header: true }];
    for (const f of FILTERS) {
      const current = tank.filterId === f.id;
      list.push({
        label: `${current ? '● ' : ''}${f.name}`,
        right: current ? 'installed' : formatMoney(f.cost),
        hint: `Rated ${f.ratedLitres}L. ${f.ratedLitres < tank.litres ? 'Undersized for this tank.' : ''}`,
        disabled: current,
        action: () => doIt(() => buyFilter(s, tank, f.id)),
      });
    }
    list.push({ label: 'Heating', header: true });
    if (tank.heaterId) {
      list.push({
        label: 'Thermostat',
        right: `${tank.heaterSetpoint.toFixed(1)}°C`,
        hint: tank.heaterBroken ? 'The heater is broken! Buy a replacement.' : 'Use left/right to adjust.',
        onLeft: () => { setHeater(tank, tank.heaterSetpoint - 0.5); scr.refresh(items()); },
        onRight: () => { setHeater(tank, tank.heaterSetpoint + 0.5); scr.refresh(items()); },
      });
      list.push({ label: 'Remove heater', hint: 'For coldwater species.', action: () => doIt(() => removeHeater(s, tank)) });
    }
    for (const ht of HEATERS) {
      const current = tank.heaterId === ht.id && !tank.heaterBroken;
      list.push({ label: `${current ? '● ' : ''}${ht.name}`, right: current ? 'installed' : formatMoney(ht.cost), disabled: current, hint: `${(ht.watts / tank.litres).toFixed(1)} W per litre`, action: () => doIt(() => buyHeater(s, tank, ht.id)) });
    }
    list.push({ label: 'Aeration', header: true });
    list.push({ label: tank.airStone ? 'Air stone: ON' : 'Install air stone', right: tank.airStone ? 'switch off' : '£9.00', hint: 'More oxygen, more bubbles.', action: () => doIt(() => toggleAirStone(s, tank)) });
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: `Equipment: ${tank.name}`, items: items(), body: () => h('div', null, `Current filter: ${getFilter(tank.filterId).name}. Money: ${formatMoney(s.money)}`) });
}

export function openPrices(c: GameController, tankId: string | null): void {
  const s = c.state;
  const speciesIds = tankId
    ? [...new Set(fishInTank(s, tankId).map((f) => f.speciesId))]
    : [...new Set(Object.values(s.fish).filter((f) => f.alive && f.tankId).map((f) => f.speciesId))];
  const items = (): MenuItem[] => {
    const list: MenuItem[] = speciesIds.map((id) => {
      const sp = getSpecies(id);
      const cur = s.prices[id] ?? sp.retailPrice;
      const ratio = priceRatio(s, id);
      const mood = ratio > 1.4 ? 'Most customers will find this expensive.' : ratio > 1.15 ? 'Pricier than usual.' : ratio < 0.85 ? 'Bargain! Low margins.' : 'A fair price.';
      const adj = (d: number) => {
        s.prices[id] = Math.max(0.2, round(cur + d, 2));
        scr.refresh(items());
      };
      return { label: sp.commonName, right: formatMoney(cur), hint: `Base price (adjusted per fish by size, colour and quality). Wholesale ~${formatMoney(sp.supplierCost)}. ${mood}`, onLeft: () => adj(-0.1), onRight: () => adj(0.1) };
    });
    if (!list.length) list.push({ label: 'No livestock to price.', disabled: true });
    list.push({ label: 'Reset to suggested', action: () => { for (const id of speciesIds) delete s.prices[id]; scr.refresh(items()); } });
    list.push({ label: 'Done', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Prices', items: items(), body: h('div', null, 'Left/right to change the base price per species.') });
}

export function openLivestock(c: GameController, tankId: string): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const fish = fishInTank(s, tankId, true).sort((a, b) => a.speciesId.localeCompare(b.speciesId) || b.sizeCm - a.sizeCm);
    const list: MenuItem[] = fish.map((f) => ({
      label: `${f.alive ? '' : '✝ '}${displayName(f)} ${f.sex === 'male' ? '♂' : f.sex === 'female' ? '♀' : ''}`,
      right: f.alive ? formatMoney(fishPrice(s, f)) : 'dead',
      hint: `${f.sizeCm.toFixed(1)}cm · health ${Math.round(f.health)} · stress ${Math.round(f.stress)}${f.reservedBy ? ' · reserved by a customer' : ''}`,
      action: () => openFishDetail(c, f, () => scr.refresh(items())),
    }));
    if (!list.length) list.push({ label: 'This tank is empty.', disabled: true });
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: `Livestock: ${s.tanks[tankId].name}`, items: items(), className: 'tall' });
}

function openFishDetail(c: GameController, f: FishEntity, onChange: () => void): void {
  const s = c.state;
  const sameSpecies = () => (f.tankId ? fishInTank(s, f.tankId).filter((x) => x.speciesId === f.speciesId && !x.reservedBy) : []);
  const scr = c.ui.menu({
    title: displayName(f),
    body: () => fishCard(s, f, true),
    className: 'wide',
    items: [
      { label: 'Move this fish', disabled: !f.alive || !!f.reservedBy, action: () => openMoveFish(c, [f], () => { c.ui.remove(scr); onChange(); }) },
      { label: `Move all ${getSpecies(f.speciesId).commonName} (${sameSpecies().length})`, disabled: !f.alive, action: () => openMoveFish(c, sameSpecies(), () => { c.ui.remove(scr); onChange(); }) },
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
  });
}

function openMoveFish(c: GameController, fish: FishEntity[], done: () => void): void {
  const s = c.state;
  if (!fish.length) return;
  const from = fish[0].tankId;
  const sp = getSpecies(fish[0].speciesId);
  const items: MenuItem[] = s.tankOrder
    .filter((id) => id !== from)
    .map((id) => {
      const t = s.tanks[id];
      const resident = [...new Set(fishInTank(s, id).map((x) => x.speciesId))];
      const res = assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: t.water.temperature, residentSpecies: resident });
      const warn = res.issues[0] ?? (t.water.ammonia > 0.25 ? 'Water is toxic!' : '');
      return {
        label: `${t.name}${res.score < 0.75 ? ' ⚠' : ''}`,
        right: `${t.litres}L ${t.water.temperature.toFixed(0)}°C`,
        hint: warn || `Contains: ${resident.map((r) => getSpecies(r).commonName).join(', ') || 'nothing'}`,
        action: () => {
          for (const f of fish) moveFish(f, id);
          c.sim!.advance(5 + fish.length);
          c.ui.toast(`Moved ${fish.length} fish to ${t.name}.`, 'good');
          c.ui.remove(scr);
          done();
        },
      };
    });
  items.push({ label: 'Cancel', action: () => c.ui.remove(scr) });
  const scr = c.ui.menu({ title: `Move ${fish.length} ${sp.commonName} to...`, items, className: 'tall' });
}
