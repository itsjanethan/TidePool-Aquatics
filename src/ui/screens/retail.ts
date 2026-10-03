/** Basement equipment retail: stock levels, buying in, prices and margins. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { getRetailItem } from '../../data/retail';
import { availableRetail, buyRetailStock, RETAIL_PRICE_PREFIX, retailItemsFor, retailMargin, retailPrice, retailUnlocked, stockSpace, stockSpaceUsed } from '../../sim/retail';
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import { locked } from './locks';

const CATEGORY_LABEL: Record<string, string> = {
  tank: 'Aquariums', filter: 'Filtration', heater: 'Heating', air: 'Air', lighting: 'Lighting', substrate: 'Substrate',
  maintenance: 'Maintenance', marine: 'Marine', bundle: 'Setup bundles',
};

export function openRetail(c: GameController): void {
  const s = c.state;
  if (!retailUnlocked(s)) {
    void c.ui.say(null, 'Equipment retail opens with the basement expansion (Shop Progression at the PC).');
    return;
  }
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [];
    let cat = '';
    for (const r of retailItemsFor(s)) {
      if (r.category !== cat) {
        cat = r.category;
        list.push({ label: CATEGORY_LABEL[cat] ?? cat, header: true });
      }
      const n = s.retail[r.id] ?? 0;
      list.push({
        label: r.name,
        right: `${n} in stock · ${formatMoney(retailPrice(s, r.id))}`,
        hint: `${r.description}${r.contains ? ` Contains: ${[...r.contains.map((x) => getRetailItem(x).name), ...(r.extras ?? [])].join(', ')}.` : ''} Buy-in ${formatMoney(r.wholesale)}, margin ${formatMoney(retailMargin(s, r.id))}. Uses ${r.space} space.`,
        className: n === 0 ? 'dim' : '',
        action: () => openRetailItem(c, r.id, () => scr.refresh(items())),
      });
    }
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const body = () => {
    const used = stockSpaceUsed(s);
    const cap = stockSpace(s);
    return h('div', null,
      h('div', { class: 'row' }, h('span', null, 'Stock space'), meter(used / cap, used / cap > 0.9 ? 'warn' : 'blue'), h('span', null, `${used} / ${cap}`)),
      h('div', { class: 'small' }, 'Equipment customers head for the basement racks. Bundles sell well to beginners and earn more than the parts.'));
  };
  const scr = c.ui.menu({ title: 'Equipment Retail', body, items: items(), className: 'wide tall' });
}

function openRetailItem(c: GameController, id: string, done: () => void): void {
  const s = c.state;
  const r = getRetailItem(id);
  const buy = (n: number) => {
    c.perform(buyRetailStock(s, id, n));
    scr.refresh(items());
    done();
  };
  const setPrice = (d: number) => {
    s.prices[RETAIL_PRICE_PREFIX + id] = Math.max(r.wholesale, round(retailPrice(s, id) + d, 2));
    scr.refresh(items());
    done();
  };
  const items = (): MenuItem[] => [
    locked(c, 'buy', { label: 'Buy 1', right: formatMoney(r.wholesale), action: () => buy(1) }),
    locked(c, 'buy', { label: 'Buy 5', right: formatMoney(r.wholesale * 5), action: () => buy(5) }),
    locked(c, 'price', { label: 'Price', right: formatMoney(retailPrice(s, id)), hint: `Left / Right to change by £1. Suggested ${formatMoney(r.retail)}.`, onLeft: () => setPrice(-1), onRight: () => setPrice(1) }),
    { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({
    title: r.name,
    body: () => h('div', null, h('div', { class: 'small' }, r.description), h('div', { class: 'row' }, h('span', null, 'In stock'), h('b', null, `${s.retail[id] ?? 0} (${availableRetail(s, id)} not reserved)`))),
    items: items(),
  });
}
