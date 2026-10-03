/** Plant care UI shared by the tank menu, aquascape editor and stockroom. */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { getDecor, getFloating, PROPAGATION_TEXT } from '../../data/catalog';
import { coverLabel, scoopFloating, sellFloatingToTrade, totalFloating } from '../../sim/floating';
import { plantPrice, PLANT_PRICE_KEY } from '../../sim/customers';
import {
  availablePlants, CUTTING_AMOUNT, MIN_REMAINING, OVERGROWN, plantValue, removeToStorage, sellPlantsToTrade, sizeLabel, takeCutting, TRADE_RATE, trimPlant,
  type CuttingSize,
} from '../../sim/plants';
import type { DecorItem, PottedPlant, TankState } from '../../sim/types';
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';

/** Short status of one growing plant. */
export function plantStatus(d: DecorItem): string {
  return `${sizeLabel(d.size)} · ${Math.round(d.size * 100)}% · health ${Math.round(d.health * 100)}%`;
}

function plantCard(d: DecorItem): HTMLElement {
  const def = getDecor(d.defId);
  const max = def.maxSize ?? 1.5;
  return h('div', { class: 'fish-card' },
    h('div', { class: 'fish-name' }, def.name),
    h('div', { class: 'row' }, h('span', null, sizeLabel(d.size)), meter(d.size / max, d.size >= OVERGROWN ? 'warn' : 'good'), h('span', null, `${Math.round(d.size * 100)}%`)),
    h('div', { class: 'row' }, h('span', null, 'Health'), meter(d.health, d.health < 0.5 ? 'bad' : 'good'), h('span', null, `${Math.round(d.health * 100)}%`)),
    h('div', { class: 'small' }, def.description),
    h('div', { class: 'small' }, d.size >= OVERGROWN
      ? 'Overgrown: it is shading the tank and looks untidy. Take cuttings or trim it.'
      : 'Plants grow with light and nitrate. Bigger plants give bigger, more valuable cuttings.'),
  );
}

/** Actions on a growing plant: cuttings, trim, uproot. */
export function openPlantActions(c: GameController, tank: TankState, uid: string, onDone: () => void): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const d = tank.decor.find((x) => x.uid === uid);
    if (!d) return [{ label: 'Back', action: () => c.ui.remove(scr) }];
    const prop = PROPAGATION_TEXT[getDecor(d.defId).propagation ?? 'cuttings'];
    const list: MenuItem[] = [{ label: prop.verb, header: true }];
    for (const size of ['small', 'medium', 'large'] as CuttingSize[]) {
      const amount = CUTTING_AMOUNT[size];
      const possible = d.size - amount >= MIN_REMAINING;
      const value = plantValue({ defId: d.defId, size: amount, health: d.health * 0.95 });
      list.push({
        label: `${size[0].toUpperCase()}${size.slice(1)} ${prop.piece}`,
        right: possible ? `~${formatMoney(value)}` : 'too small',
        hint: possible
          ? `Leaves the plant at ${Math.round((d.size - amount) * 100)}%. The cutting goes to the stockroom to replant or sell.`
          : `The plant needs to reach ${Math.round((amount + MIN_REMAINING) * 100)}% first.`,
        disabled: !possible,
        action: () => {
          c.perform(takeCutting(s, tank, uid, size));
          scr.refresh(items());
          onDone();
        },
      });
    }
    list.push(
      { label: 'Trim back', disabled: d.size <= 1, hint: 'Cuts an overgrown plant back to mature size. The trimmings are thrown away.', action: () => { c.perform(trimPlant(s, tank, uid)); scr.refresh(items()); onDone(); } },
      { label: 'Uproot to stockroom', hint: 'Keeps the whole plant in a pot to replant elsewhere or sell.', action: () => { c.perform(removeToStorage(s, tank, uid)); c.ui.remove(scr); onDone(); } },
      { label: 'Back', action: () => c.ui.remove(scr) },
    );
    return list;
  };
  const scr = c.ui.menu({
    title: getDecor(tank.decor.find((x) => x.uid === uid)?.defId ?? 'java_fern').name,
    body: () => {
      const d = tank.decor.find((x) => x.uid === uid);
      return d ? plantCard(d) : h('div', null, 'Gone.');
    },
    items: items(),
    className: 'wide',
  });
}

/** List of growing plants in a tank (from the tank menu). */
export function openTankPlants(c: GameController, tank: TankState): void {
  const items = (): MenuItem[] => {
    const plants = tank.decor.filter((d) => getDecor(d.defId).kind === 'plant');
    const list: MenuItem[] = plants.map((d) => ({
      label: getDecor(d.defId).name,
      right: `${sizeLabel(d.size)} ${Math.round(d.size * 100)}%`,
      hint: plantStatus(d),
      action: () => openPlantActions(c, tank, d.uid, () => scr.refresh(items())),
    }));
    if (!list.length) list.push({ label: 'No rooted plants yet. Add some with Aquascape.', disabled: true });
    const floats = Object.entries(tank.floating ?? {});
    if (floats.length) {
      list.push({ label: 'Floating plants', header: true });
      for (const [id, cov] of floats) {
        const def = getFloating(id);
        list.push({ label: `${def.name}: scoop half to stockroom`, right: `${coverLabel(cov)} ${Math.round(cov * 100)}%`, hint: `${def.description} Scooped portions can go in another tank or be sold.`, action: () => { c.perform(scoopFloating(c.state, tank, id, 0.5, true)); scr.refresh(items()); } });
        list.push({ label: `${def.name}: scoop most and bin it`, hint: 'Clears 80% of the cover. Nothing is kept.', action: () => { c.perform(scoopFloating(c.state, tank, id, 0.8, false)); scr.refresh(items()); } });
      }
    }
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({
    title: `Plants: ${tank.name}`,
    items: items(),
    body: () => {
      const total = totalFloating(tank);
      return h('div', { class: 'small' },
        'Plants grow over time. Propagate them, then replant or sell the pieces.',
        total > 0.75 ? h('div', { class: 'warn' }, `Floating plants cover ${Math.round(total * 100)}% of the surface: the plants below are starved of light.`) : null);
    },
  });
}

/** Groups loose potted plants by species and growth stage. */
export function groupPotted(plants: PottedPlant[]): Array<{ defId: string; stage: string; items: PottedPlant[] }> {
  const map = new Map<string, { defId: string; stage: string; items: PottedPlant[] }>();
  for (const p of plants) {
    const stage = sizeLabel(p.size);
    const k = `${p.defId}|${stage}`;
    if (!map.has(k)) map.set(k, { defId: p.defId, stage, items: [] });
    map.get(k)!.items.push(p);
  }
  return [...map.values()].sort((a, b) => a.defId.localeCompare(b.defId));
}

/** Stockroom section for potted plants: prices and trade sales. */
export function pottedPlantItems(c: GameController, refresh: () => void): MenuItem[] {
  const s = c.state;
  const groups = groupPotted(availablePlants(s));
  const mult = s.prices[PLANT_PRICE_KEY] ?? 1;
  const list: MenuItem[] = [{ label: 'Potted plants for sale', header: true }];
  list.push({
    label: 'Plant prices',
    right: `${Math.round(mult * 100)}%`,
    hint: 'Shelf price of all potted plants relative to normal value. Customers browse the plant shelf.',
    onLeft: () => { s.prices[PLANT_PRICE_KEY] = Math.max(0.5, Math.round((mult - 0.1) * 10) / 10); refresh(); },
    onRight: () => { s.prices[PLANT_PRICE_KEY] = Math.min(2, Math.round((mult + 0.1) * 10) / 10); refresh(); },
  });
  if (!groups.length) list.push({ label: 'No potted plants. Take cuttings from your tanks.', disabled: true });
  for (const g of groups) {
    const each = plantPrice(s, g.items[0]);
    list.push({
      label: `${getDecor(g.defId).name} (${g.stage}) ×${g.items.length}`,
      right: `${formatMoney(each)} each`,
      hint: `Confirm to sell one to the trade buyer for ${formatMoney(plantValue(g.items[0]) * TRADE_RATE)}. Customers usually pay the full shelf price.`,
      action: () => { c.perform(sellPlantsToTrade(s, [g.items[0].uid])); refresh(); },
    });
  }
  const floats = Object.entries(s.storage.floating ?? {}).filter(([, n]) => n > 0);
  if (floats.length) {
    list.push({ label: 'Floating plants', header: true });
    for (const [id, n] of floats) {
      const def = getFloating(id);
      list.push({
        label: `${def.name} ×${n} portions`,
        right: formatMoney(n * def.tradeValue),
        hint: `Float them in a tank from its Aquascape menu, or confirm to sell them all to the trade buyer.`,
        action: () => { c.perform(sellFloatingToTrade(s, id)); refresh(); },
      });
    }
  }
  return list;
}
