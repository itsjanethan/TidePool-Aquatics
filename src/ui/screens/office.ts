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

export function openOffice(c: GameController): void {
  const s = c.state;
  const scr = c.ui.menu({
    title: 'Office PC',
    body: () =>
      h('div', null,
        h('div', { class: 'row' }, h('span', null, 'Balance'), h('b', null, formatMoney(s.money))),
        h('div', { class: 'row' }, h('span', null, 'Daily running costs'), h('span', null, formatMoney(dailyRunningCosts(s).total))),
        h('div', { class: 'row' }, h('span', null, 'Pending deliveries'), h('span', null, String(s.orders.length)))),
    items: [
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

function openOrder(c: GameController, supplierId: string): void {
  const s = c.state;
  const sup = getSupplier(supplierId);
  const stock = s.suppliers[supplierId]?.stock ?? [];
  const qty: Record<string, number> = {};
  let tankIdx = Math.max(0, s.tankOrder.indexOf('C2'));
  const tankId = () => s.tankOrder[tankIdx];
  const total = () => round(stock.reduce((t, st) => t + (qty[st.speciesId] ?? 0) * st.unitCost, 0), 2);
  const items = (): MenuItem[] => {
    const t = s.tanks[tankId()];
    const resident = [...new Set(fishInTank(s, t.id).map((f) => f.speciesId))];
    const list: MenuItem[] = [
      {
        label: `Deliver to: ${t.name}`,
        right: `${t.litres}L`,
        hint: `${speciesSummary(s, t.id)} · ${t.water.temperature.toFixed(0)}°C${t.heaterId ? '' : ' unheated'}`,
        onLeft: () => { tankIdx = (tankIdx - 1 + s.tankOrder.length) % s.tankOrder.length; scr.refresh(items()); },
        onRight: () => { tankIdx = (tankIdx + 1) % s.tankOrder.length; scr.refresh(items()); },
      },
      { label: 'Livestock', header: true },
    ];
    for (const st of stock) {
      const sp = getSpecies(st.speciesId);
      const q = qty[st.speciesId] ?? 0;
      const res = assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: t.water.temperature, residentSpecies: [...resident, ...Object.keys(qty).filter((k) => qty[k] > 0)] });
      const adj = (d: number) => {
        qty[st.speciesId] = Math.max(0, Math.min(st.available, q + d));
        scr.refresh(items());
      };
      list.push({
        label: `${sp.commonName}${res.score < 0.75 ? ' ⚠' : ''}`,
        right: `${q} x ${formatMoney(st.unitCost)}`,
        hint: `${st.available} available · retail ~${formatMoney(sp.retailPrice)} · ${res.issues[0] ?? `${sp.section}, groups of ${sp.minGroupSize}+`}`,
        disabled: st.available <= 0,
        onLeft: () => adj(-1),
        onRight: () => adj(1),
        action: () => adj(sp.minGroupSize > 1 ? sp.minGroupSize : 1),
      });
    }
    list.push({
      label: `Place order (${formatMoney(total())})`,
      disabled: total() <= 0,
      action: () => {
        const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([speciesId, quantity]) => ({ speciesId, quantity, tankId: tankId() }));
        const r = placeOrder(s, supplierId, lines, dayOf(s.minute));
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
    body: () => h('div', null, `${sup.blurb} Balance ${formatMoney(s.money)}. Left/right sets quantity. Delivery in ${sup.deliveryDays} day(s) at opening time.`),
    items: items(),
    className: 'tall wide',
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
