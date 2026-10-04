/** Office PC: supplier orders, stockroom, ledger, reputation, goals, end day. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { DRY_GOODS, FOOD_TUB } from '../../data/catalog';
import { getSpecies } from '../../data/species';
import { lineWarnings, orderWarnings, projectedStocking } from '../../sim/orderCheck';
import { incomingCount, incomingSummary } from '../../sim/incoming';
import { openAllIncoming, outlookEl } from './incoming';
import { dailyRunningCosts } from '../../sim/economy';
import { fishInTank } from '../../sim/fish';
import { OBJECTIVES, markObjective } from '../../sim/progression';
import { overallReputation, REP_DIMENSIONS, REP_LABELS, repStars } from '../../sim/reputation';
import { buyDryGood, buyFoodTub, getSupplier, placeOrder, refreshSupplierStock, suppliersFor } from '../../sim/supplier';
import { dateString, dayOf, isShopOpen, minuteOfDay, OPEN_HOUR } from '../../sim/time';

const beforeOpening = (m: number) => minuteOfDay(m) < OPEN_HOUR * 60;
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import { openPrices } from './tankMenu';
import { speciesSummary } from './common';
import { exportSave, openImport, openLoad, openSaveSlots, openSettings, openStats } from './pause';
import { AUTOSAVE_TEXT } from '../../game/GameController';
import { pottedPlantItems } from './plants';
import { sellStoredDecor } from '../../sim/plants';
import { getDecor } from '../../data/catalog';
import { locked } from './locks';
import { openStaffHub } from './staff';
import { openProgression } from './progression';
import { openRetail } from './retail';
import { openTanksOverview } from './overview';
import { retailUnlocked } from '../../sim/retail';
import { openProposals } from '../../sim/staff';

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
    })).map((it) => locked(c, 'sell', it)),
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
        c.idle ? h('div', { class: 'warn small' }, 'IDLE MODE · BUSINESS PAUSED') : null,
        h('div', { class: 'row' }, h('span', null, 'Pending deliveries'), h('span', null, String(s.orders.length))),
        h('div', { class: 'small save-status' }, c.lastSaveText())),
    items: [],
  });
  const items = (): MenuItem[] => {
    const props = openProposals(s).length;
    return [
      { label: 'Game', header: true },
      { label: 'Save game', hint: `Save to one of three slots. ${AUTOSAVE_TEXT}${c.idle ? ' Saving in Idle Mode is safe; loading resumes normal play.' : ''}`, action: () => void openSaveSlots(c, 'save', false, () => scr.renderBody()) },
      { label: 'Load game', hint: 'Load a slot or the autosave. A loaded game always starts with the business running.', action: () => void openLoad(c) },
      { label: 'Export save', hint: 'Make a backup copy you can import on any device or browser.', action: () => exportSave(c) },
      { label: 'Import save', hint: 'Restore a backup made with Export save.', action: () => void openImport(c) },
      { label: 'Settings', hint: 'Game speed, picture, sound, text size and controls.', action: () => openSettings(c) },
      c.idle
        ? { label: 'Resume Business', right: 'Idle Mode on', hint: 'Leave Idle Mode: time, customers, staff and fish care start again.', action: () => { c.exitIdle(); refresh(); } }
        : { label: 'Idle Mode', hint: 'Pause the business and just watch. Nothing is bought, sold, eaten or dirtied while idle.', action: () => { c.enterIdle(); refresh(); } },
      { label: 'Help', right: 'H', action: () => c.openHelp() },
      { label: 'Shop', header: true },
      locked(c, 'order', { label: 'Order livestock', hint: 'Buy fish from suppliers. Delivered at opening time.', action: () => openSuppliers(c) }),
      { label: 'All tanks', hint: 'Every tank on every floor with its status and worst problem, most urgent first.', action: () => openTanksOverview(c) },
      { label: 'Incoming deliveries', right: s.orders.length ? `${s.orders.length} order${s.orders.length > 1 ? 's' : ''}` : 'none', hint: 'Livestock on order: what, for which tank, arriving when. Cancel from here.', action: () => openAllIncoming(c) },
      { label: 'Stockroom', hint: 'Food, dry goods, potted plants and stored decor.', action: () => openStockroom(c) },
      ...(retailUnlocked(s) ? [{ label: 'Equipment retail', hint: 'Basement stock: tanks, filters, heaters, bundles.', action: () => openRetail(c) }] : []),
      { label: `Staff (${s.staff.length})`, right: props ? `${props} suggestion${props > 1 ? 's' : ''}` : '', hint: 'Your team, hiring, roles and staff suggestions.', action: () => openStaffHub(c) },
      { label: 'Shop Progression', right: `Level ${s.shopLevel}`, hint: 'Expansions: new floors, species and equipment retail.', action: () => openProgression(c) },
      locked(c, 'price', { label: 'Prices', action: () => openPrices(c, null) }),
      { label: 'Accounts', action: () => openLedger(c) },
      { label: 'Reputation', action: () => openReputation(c) },
      { label: 'Goals', action: () => openGoals(c) },
      { label: 'Statistics', action: () => openStats(c) },
      { label: 'Day', header: true },
      locked(c, 'time', beforeOpening(s.minute)
        ? { label: 'Wait until opening (09:00)', hint: 'The shop opens and the game autosaves.', action: () => c.endDay() }
        : { label: isShopOpen(s.minute) ? 'Close early & end day' : 'End day', hint: 'Sleep until opening time tomorrow. Tanks keep running overnight. The game autosaves when the shop opens.', action: () => {
            void c.ui.confirm('End the day and skip to tomorrow morning?').then((y) => y && c.endDay());
          } }),
      { label: 'Log off', action: () => c.ui.remove(scr) },
    ];
  };
  const refresh = () => scr.refresh(items());
  refresh();
}

export function openSuppliers(c: GameController): void {
  const items: MenuItem[] = suppliersFor(c.state).map((sup) => ({
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
  if (!s.suppliers[supplierId]) refreshSupplierStock(s, c.sim!.rng, supplierId, dayOf(s.minute));
  const stock = s.suppliers[supplierId]?.stock ?? [];
  const cart: CartLine[] = [];
  const unitCost = (sid: string) => stock.find((x) => x.speciesId === sid)?.unitCost ?? 0;
  const inCart = (sid: string, except?: CartLine) => cart.filter((l) => l.speciesId === sid && l !== except).reduce((n, l) => n + l.quantity, 0);
  const total = () => round(cart.reduce((t, l) => t + l.quantity * unitCost(l.speciesId), 0), 2);
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [{ label: cart.length ? `Your order (${cart.length} line${cart.length > 1 ? 's' : ''})` : 'Your order is empty', header: true }];
    for (const line of cart) {
      const sp = getSpecies(line.speciesId);
      const warns = lineWarnings(s, line, cart).filter((w) => w.severity === 'warn');
      list.push({
        label: `${line.quantity} x ${sp.commonName} to ${s.tanks[line.tankId].name}${warns.length ? ' ⚠' : ''}`,
        right: formatMoney(line.quantity * unitCost(line.speciesId)),
        hint: warns.length ? `${warns[0].text}${warns.length > 1 ? ` (+${warns.length - 1} more)` : ''} Confirm to edit.` : 'No problems spotted. Confirm to change the quantity or destination, or remove this line.',
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
      action: async () => {
        const warns = orderWarnings(s, cart).filter((w) => w.severity === 'warn');
        if (warns.length) {
          const shown = warns.slice(0, 4).map((w) => `- ${w.text}`).join('\n');
          const more = warns.length > 4 ? `\n(and ${warns.length - 4} more)` : '';
          if (!(await c.ui.confirm(`Before you order:\n${shown}${more}\nPlace the order anyway?`))) return;
        }
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
    body: () => {
      const fish = cart.reduce((n, l) => n + l.quantity, 0);
      const tanks = [...new Set(cart.map((l) => l.tankId))];
      const warns = orderWarnings(s, cart).filter((w) => w.severity === 'warn').length;
      const arrive = dateString((dayOf(s.minute) - 1 + sup.deliveryDays) * 1440 + OPEN_HOUR * 60);
      return h('div', null,
        h('div', { class: 'small' }, sup.blurb),
        h('div', { class: 'row' }, h('span', null, `${fish} fish to ${tanks.length} tank${tanks.length === 1 ? '' : 's'}`), h('b', null, `Total ${formatMoney(total())}`)),
        h('div', { class: 'row small' }, h('span', null, `Arrives ${arrive}, 09:00`), h('span', null, `Balance ${formatMoney(s.money)}`)),
        tanks.length ? h('div', { class: 'small' }, tanks.map((id) => `${s.tanks[id].name} ${Math.round(projectedStocking(s, id, cart) * 100)}%${incomingCount(s, id) ? ` (incl. ${incomingCount(s, id)} already on order)` : ''}`).join(' · ') + ' stocked after delivery') : null,
        warns ? h('div', { class: 'warn small' }, `${warns} warning${warns > 1 ? 's' : ''}. Lines marked ⚠ have problems.`) : null);
    },
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
  const assess = () => lineWarnings(s, draft, [...cart.filter((l) => l !== line), draft]);
  const items = (): MenuItem[] => {
    const t = s.tanks[draft.tankId];
    const res = assess();
    const warns = res.filter((w) => w.severity === 'warn');
    const step = (d: number) => {
      draft.quantity = Math.max(1, Math.min(maxQty(), draft.quantity + d));
      scr.refresh(items());
    };
    const jump = () => {
      draft.quantity = draft.quantity >= maxQty() ? 1 : Math.min(maxQty(), draft.quantity < 5 ? 5 : draft.quantity + 5);
      scr.refresh(items());
    };
    const chooseTank = () => {
      const pickItems: MenuItem[] = s.tankOrder.map((id) => {
        const tk = s.tanks[id];
        const trial = { ...draft, tankId: id };
        const ws = lineWarnings(s, trial, [...cart.filter((l) => l !== line), trial]).filter((w) => w.severity === 'warn');
        const total = projectedStocking(s, id, [...cart.filter((l) => l !== line), trial]);
        const inc = incomingSummary(s, id);
        return {
          label: `${tk.name}${inc ? ' · on order' : ''}${ws.length ? ' ⚠' : ''}`,
          right: `${Math.round(total * 100)}% after`,
          hint: `${tk.litres}L ${tk.water.temperature.toFixed(0)}°C. ${speciesSummary(s, id) || 'Empty'}.${inc ? ` ${inc}.` : ''}${ws.length ? ` ⚠ ${ws[0].text}` : ''}`,
          action: () => { draft.tankId = id; c.ui.remove(pick); scr.refresh(items()); },
        };
      });
      pickItems.push({ label: 'Back', action: () => c.ui.remove(pick) });
      const pick = c.ui.menu({ title: `Deliver ${draft.quantity} ${sp.commonName} to…`, body: h('div', { class: 'small' }, '"after" = stocking once this line and anything already on order arrive. "on order" = livestock already ordered for that tank.'), items: pickItems, className: 'wide tall' });
      pick.menu.select(Math.max(0, s.tankOrder.indexOf(draft.tankId)));
    };
    const cycle = (d: number) => {
      const i = s.tankOrder.indexOf(draft.tankId);
      draft.tankId = s.tankOrder[(i + d + s.tankOrder.length) % s.tankOrder.length];
      scr.refresh(items());
    };
    const list: MenuItem[] = [
      { label: 'Quantity', right: `${draft.quantity} x ${formatMoney(st.unitCost)}`, hint: `Left / Right: 1 at a time. Confirm: jump by 5. Up to ${maxQty()} available.`, onLeft: () => step(-1), onRight: () => step(1), action: jump },
      {
        label: `Deliver to ${t.name}${warns.length ? ' ⚠' : ''}`,
        right: `${t.litres}L ${t.water.temperature.toFixed(0)}°C`,
        hint: warns[0]?.text ?? `Looks suitable. Currently: ${speciesSummary(s, t.id) || 'empty'}.${incomingSummary(s, t.id) ? ` ${incomingSummary(s, t.id)}.` : ''}`,
        onLeft: () => cycle(-1),
        onRight: () => cycle(1),
        action: () => chooseTank(),
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
        h('div', { class: 'small' }, `${sp.description} Needs ${sp.temperature.min}-${sp.temperature.max}°C, pH ${sp.ph.min}-${sp.ph.max}, ${sp.minTankLitres}L+, groups of ${sp.minGroupSize}+.`),
        h('div', { class: 'section-title' }, `${s.tanks[draft.tankId].name} with this line`),
        outlookEl(c, draft.tankId, [...cart.filter((l) => l !== line), draft], 'in this order'),
        res.length
          ? h('div', null, ...res.map((w) => h('div', { class: `${w.severity === 'warn' ? 'warn' : 'dim'} small` }, `${w.severity === 'warn' ? '⚠ ' : ''}${w.text}`)))
          : h('div', { class: 'good small' }, 'Suitable for the chosen tank.'),
        h('div', { class: 'dim small' }, 'Warnings are advice only. You can still order.'));
    },
    items: items(),
    className: 'wide',
  });
}

export function openStockroom(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => [
    { label: 'Fish food', header: true },
    locked(c, 'buy', { label: `Buy food tub (+${FOOD_TUB.units})`, right: formatMoney(FOOD_TUB.cost), hint: `In stock: ${Math.floor(s.foodUnits)} portions`, action: () => { const r = buyFoodTub(s); c.ui.toast(r.message, r.ok ? 'good' : 'warn'); scr.refresh(items()); } }),
    { label: 'Dry goods for sale (packs of 5)', header: true },
    ...DRY_GOODS.filter((g) => (!g.marine || s.unlocks.marine) && (!g.floor || s.unlocks.floors.includes(g.floor))).map((g) => locked(c, 'buy', {
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
