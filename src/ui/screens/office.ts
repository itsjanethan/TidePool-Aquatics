/** Office PC: supplier orders, stockroom, ledger, reputation, goals, end day. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { DRY_GOODS, FOOD_TUB } from '../../data/catalog';
import { getSpecies } from '../../data/species';
import { assessSpeciesForSetup } from '../../sim/compat';
import { dailyRunningCosts } from '../../sim/economy';
import { fishInTank } from '../../sim/fish';
import { OBJECTIVES, markObjective } from '../../sim/progression';
import { overallReputation, REP_DIMENSIONS, REP_LABELS, repStars } from '../../sim/reputation';
import { buyDryGood, buyFoodTub, getSupplier, placeOrder, SUPPLIERS } from '../../sim/supplier';
import { dayOf, isShopOpen, minuteOfDay, OPEN_HOUR } from '../../sim/time';

const beforeOpening = (m: number) => minuteOfDay(m) < OPEN_HOUR * 60;
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import { openPrices } from './tankMenu';
import { speciesSummary } from './common';
import { openSaveSlots } from './pause';
import { pottedPlantItems } from './plants';
import { sellStoredDecor } from '../../sim/plants';
import { getDecor } from '../../data/catalog';

function storedDecorItems(c: GameController, refresh: () => void): MenuItem[] {
  const s = c.state;
  const entries = Object.entries(s.storage.decor).filter(([, n]) => n > 0);
  if (!entries.length) return [];
  return [
    { label: 'Stored decor', header: true },
    ...entries.map(([id, n]) => ({
      label: `${getDecor(id).name} ×${n}`,
      right: 'Owned',
      hint: `Place it from a tank's Aquascape menu, or confirm to sell one second-hand for ${formatMoney(getDecor(id).cost * 0.4)}.`,
      action: () => { c.perform(sellStoredDecor(s, id)); refresh(); },
    })),
  ];
}

export function openOffice(c: GameController): void {
  const s = c.state;
  const scr = c.ui.menu({
    title: 'Office PC',
    body: () =>
      h('div', null,
        h('div', { class: 'row' }, h('span', null, 'Balance'), h('b', null, formatMoney(s.money))),
        h('div', { class: 'row' }, h('span', null, 'Daily running costs'), h('span', null, formatMoney(dailyRunningCosts(s).total))),
        h('div', { class: 'row' }, h('span', null, 'Pending deliveries'), h('span', null, String(s.orders.length))),
        h('div', { class: 'small save-status' }, c.lastSaveText())),
    items: [
      { label: 'Save game', hint: 'Save to one of three slots. The game also autosaves every morning at 09:00.', action: () => void openSaveSlots(c, 'save', false, () => scr.renderBody()) },
      { label: 'Order livestock', hint: 'Buy fish from suppliers. Delivered at opening time.', action: () => openSuppliers(c) },
      { label: 'Stockroom', hint: 'Fish food and dry goods to sell.', action: () => openStockroom(c) },
      { label: 'Prices', action: () => openPrices(c, null) },
      { label: 'Accounts', action: () => openLedger(c) },
      { label: 'Reputation', action: () => openReputation(c) },
      { label: 'Goals', action: () => openGoals(c) },
      beforeOpening(s.minute)
        ? { label: 'Wait until opening (09:00)', action: () => c.endDay() }
        : { label: isShopOpen(s.minute) ? 'Close early & end day' : 'End day', hint: 'Sleep until opening time tomorrow. Tanks keep running overnight.', action: () => {
            void c.ui.confirm('End the day and skip to tomorrow morning?').then((y) => y && c.endDay());
          } },
      { label: 'Log off', action: () => c.ui.remove(scr) },
    ],
  });
}

export function openSuppliers(c: GameController): void {
  const items: MenuItem[] = SUPPLIERS.map((sup) => ({
    label: sup.name,
    right: `${sup.deliveryDays}d`,
    hint: sup.blurb,
    action: () => openOrder(c, sup.id),
  }));
  items.push({ label: 'Back', action: () => c.ui.remove(scr) });
  const scr = c.ui.menu({ title: 'Suppliers', items });
}

interface CartLine {
  speciesId: string;
  quantity: number;
  tankId: string;
}

/** Cart-style order screen: each line has its own quantity and destination tank. */
function openOrder(c: GameController, supplierId: string): void {
  const s = c.state;
  const sup = getSupplier(supplierId);
  const stock = s.suppliers[supplierId]?.stock ?? [];
  const cart: CartLine[] = [];
  const unitCost = (sid: string) => stock.find((x) => x.speciesId === sid)?.unitCost ?? 0;
  const inCart = (sid: string, except?: CartLine) => cart.filter((l) => l.speciesId === sid && l !== except).reduce((n, l) => n + l.quantity, 0);
  const total = () => round(cart.reduce((t, l) => t + l.quantity * unitCost(l.speciesId), 0), 2);
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [{ label: cart.length ? `Your order (${cart.length} line${cart.length > 1 ? 's' : ''})` : 'Your order is empty', header: true }];
    for (const line of cart) {
      const sp = getSpecies(line.speciesId);
      list.push({
        label: `${line.quantity} x ${sp.commonName} to ${s.tanks[line.tankId].name}`,
        right: formatMoney(line.quantity * unitCost(line.speciesId)),
        hint: 'Confirm to change the quantity or destination, or remove this line.',
        action: () => editLine(c, supplierId, line, cart, () => scr.refresh(items())),
      });
    }
    list.push({ label: 'Add livestock', header: true });
    for (const st of stock) {
      const sp = getSpecies(st.speciesId);
      const left = st.available - inCart(st.speciesId);
      list.push({
        label: sp.commonName,
        right: `${left} left · ${formatMoney(st.unitCost)}`,
        hint: `${sp.section}, adult ${sp.adultSizeCm}cm, groups of ${sp.minGroupSize}+, needs ${sp.minTankLitres}L+. Retail around ${formatMoney(sp.retailPrice)}.`,
        disabled: left <= 0,
        action: () => {
          const home = s.tankOrder.find((id) => fishInTank(s, id).some((f) => f.speciesId === sp.id)) ?? s.tankOrder[s.tankOrder.length - 1];
          const line: CartLine = { speciesId: sp.id, quantity: Math.min(left, Math.max(1, sp.minGroupSize)), tankId: home };
          editLine(c, supplierId, line, cart, () => scr.refresh(items()), true);
        },
      });
    }
    list.push({
      label: `Place order (${formatMoney(total())})`,
      disabled: !cart.length,
      hint: `Charged now. Delivered ${sup.deliveryDays === 1 ? 'tomorrow' : `in ${sup.deliveryDays} days`} at opening time, straight into each line's tank.`,
      action: () => {
        const r = placeOrder(s, supplierId, cart, dayOf(s.minute));
        c.ui.toast(r.message, r.ok ? 'good' : 'warn');
        if (r.ok) {
          markObjective(s, 'order_stock');
          c.ui.remove(scr);
        }
      },
    });
    list.push({ label: 'Cancel', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({
    title: sup.name,
    body: () => h('div', null, `${sup.blurb} Balance ${formatMoney(s.money)}. Order total ${formatMoney(total())}.`),
    items: items(),
    className: 'tall wide',
  });
}

function editLine(c: GameController, supplierId: string, line: CartLine, cart: CartLine[], done: () => void, isNew = false): void {
  const s = c.state;
  const st = s.suppliers[supplierId].stock.find((x) => x.speciesId === line.speciesId)!;
  const sp = getSpecies(line.speciesId);
  const draft = { ...line };
  const maxQty = () => st.available - cart.filter((l) => l.speciesId === line.speciesId && l !== line).reduce((n, l) => n + l.quantity, 0);
  const assess = () => {
    const t = s.tanks[draft.tankId];
    const resident = [...new Set(fishInTank(s, t.id).map((f) => f.speciesId))];
    const incoming = cart.filter((l) => l !== line && l.tankId === t.id).map((l) => l.speciesId);
    return assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: t.water.temperature, residentSpecies: [...resident, ...incoming] });
  };
  const items = (): MenuItem[] => {
    const t = s.tanks[draft.tankId];
    const res = assess();
    const step = (d: number) => {
      draft.quantity = Math.max(1, Math.min(maxQty(), draft.quantity + d));
      scr.refresh(items());
    };
    const cycle = (d: number) => {
      const i = s.tankOrder.indexOf(draft.tankId);
      draft.tankId = s.tankOrder[(i + d + s.tankOrder.length) % s.tankOrder.length];
      scr.refresh(items());
    };
    const list: MenuItem[] = [
      { label: 'Quantity', right: `${draft.quantity} x ${formatMoney(st.unitCost)}`, hint: `Up to ${maxQty()} available.`, onLeft: () => step(-1), onRight: () => step(1) },
      {
        label: `Deliver to ${t.name}${res.score < 0.75 ? ' ⚠' : ''}`,
        right: `${t.litres}L ${t.water.temperature.toFixed(0)}°C`,
        hint: res.issues[0] ?? `Looks suitable. Currently: ${speciesSummary(s, t.id)}.`,
        onLeft: () => cycle(-1),
        onRight: () => cycle(1),
      },
      {
        label: isNew ? 'Add to order' : 'Update line',
        right: formatMoney(draft.quantity * st.unitCost),
        action: () => {
          Object.assign(line, draft);
          if (isNew) cart.push(line);
          c.ui.remove(scr);
          done();
        },
      },
    ];
    if (!isNew) list.push({ label: 'Remove line', action: () => { cart.splice(cart.indexOf(line), 1); c.ui.remove(scr); done(); } });
    list.push({ label: 'Cancel', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({
    title: `${sp.commonName}`,
    body: () => {
      const res = assess();
      return h('div', null,
        h('div', { class: 'small' }, `${sp.description} Needs ${sp.temperature.min}-${sp.temperature.max}°C, ${sp.minTankLitres}L+, groups of ${sp.minGroupSize}+.`),
        res.issues.length ? h('div', { class: 'warn small' }, res.issues.join(' ')) : h('div', { class: 'good small' }, 'Suitable for the chosen tank.'));
    },
    items: items(),
    className: 'wide',
  });
}

export function openStockroom(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => [
    { label: 'Fish food', header: true },
    { label: `Buy food tub (+${FOOD_TUB.units})`, right: formatMoney(FOOD_TUB.cost), hint: `In stock: ${Math.floor(s.foodUnits)} portions`, action: () => { const r = buyFoodTub(s); c.ui.toast(r.message, r.ok ? 'good' : 'warn'); scr.refresh(items()); } },
    { label: 'Dry goods for sale (packs of 5)', header: true },
    ...DRY_GOODS.map((g) => ({
      label: g.name,
      right: `${s.dryGoods[g.id] ?? 0} · ${formatMoney(g.wholesale * 5)}`,
      hint: `${g.description} Sells for ${formatMoney(g.retail)}.`,
      action: () => { const r = buyDryGood(s, g.id, 5); c.ui.toast(r.message, r.ok ? 'good' : 'warn'); scr.refresh(items()); },
    })),
    ...pottedPlantItems(c, () => scr.refresh(items())),
    ...storedDecorItems(c, () => scr.refresh(items())),
    { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({ title: 'Stockroom', items: items(), body: () => h('div', null, `Balance ${formatMoney(s.money)}. Customers may buy dry goods when you suggest them at the till or after good advice.`) });
}

function openLedger(c: GameController): void {
  const s = c.state;
  const days = [...s.ledger.slice(-6), s.today];
  const body = h('div', { class: 'ledger' },
    ...days.map((d) =>
      h('div', { class: 'row' }, h('span', null, d === s.today ? `Today (day ${d.day})` : `Day ${d.day}`), h('span', null, `+${formatMoney(d.income)} / -${formatMoney(d.expenses)}`), h('span', null, `${d.fishSold} fish, ${d.customersServed} served${d.customersLost ? `, ${d.customersLost} lost` : ''}`)),
    ),
    h('div', { class: 'row' }, h('span', null, 'All-time sales'), h('b', null, formatMoney(s.stats.totalSales))),
    h('div', { class: 'row' }, h('span', null, 'Fish sold / died'), h('span', null, `${s.stats.totalFishSold} / ${s.stats.fishDied}`)),
  );
  const scr = c.ui.menu({ title: 'Accounts', body, items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide' });
}

export function reputationEl(c: GameController): HTMLElement {
  const s = c.state;
  const overall = overallReputation(s);
  return h('div', { class: 'rep' },
    h('div', { class: 'row' }, h('b', null, 'Overall'), meter(overall / 100, 'gold'), h('span', null, `${repStars(overall)}★`)),
    ...REP_DIMENSIONS.map((d) => h('div', { class: 'row' }, h('span', null, REP_LABELS[d]), meter(s.reputation[d] / 100, 'blue'), h('span', null, `${Math.round(s.reputation[d])}`))),
    h('div', { class: 'small' }, 'Different customers care about different things. Enthusiasts value quality and advice; bargain hunters value price.'),
  );
}

function openReputation(c: GameController): void {
  const scr = c.ui.menu({ title: 'Reputation', body: () => reputationEl(c), items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide' });
}

export function openGoals(c: GameController): void {
  const s = c.state;
  const body = h('div', { class: 'goals' },
    ...OBJECTIVES.map((o) => {
      const done = s.objectives[o.id]?.done;
      return h('div', { class: `goal ${done ? 'done' : ''}` }, h('div', { class: 'row' }, h('span', null, `${done ? '✔' : '○'} ${o.title}`), h('span', null, o.reward ? `+£${o.reward}` : '')), done ? null : h('div', { class: 'small' }, o.hint));
    }),
  );
  const scr = c.ui.menu({ title: 'Goals', body, items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide tall' });
}
