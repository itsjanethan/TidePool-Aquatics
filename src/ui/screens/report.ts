/** End-of-day report shown at opening time after the overnight simulation. */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { REP_LABELS } from '../../sim/reputation';
import type { DayReport } from '../../sim/simulation';
import type { RepDimension } from '../../sim/types';
import { h } from '../dom';

export function showDayReport(c: GameController, r: DayReport): void {
  const l = r.ledger;
  const net = l.income - l.expenses;
  const repLines = (Object.entries(r.repDeltas) as Array<[RepDimension, number]>)
    .filter(([, d]) => Math.abs(d) >= 0.3)
    .map(([k, d]) => h('div', { class: `row small ${d > 0 ? 'good' : 'bad'}` }, h('span', null, REP_LABELS[k]), h('span', null, `${d > 0 ? '+' : ''}${d.toFixed(1)}`)));
  const body = h('div', { class: 'report' },
    h('div', { class: 'row' }, h('span', null, 'Income'), h('b', { class: 'good' }, formatMoney(l.income))),
    h('div', { class: 'row' }, h('span', null, 'Expenses (incl. rent & power)'), h('b', { class: 'bad' }, formatMoney(l.expenses))),
    h('div', { class: 'row' }, h('span', null, 'Net'), h('b', { class: net >= 0 ? 'good' : 'bad' }, formatMoney(net))),
    h('div', { class: 'row small' }, h('span', null, `Rent ${formatMoney(r.rent)} · Electricity ${formatMoney(r.electricity)}${r.wages ? ` · Wages ${formatMoney(r.wages)}` : ""}`)),
    h('div', { class: 'row' }, h('span', null, 'Customers served / lost'), h('span', null, `${l.customersServed} / ${l.customersLost}`)),
    h('div', { class: 'row' }, h('span', null, 'Fish sold'), h('span', null, String(l.fishSold))),
    h('div', { class: 'row' }, h('span', null, 'Fish deaths'), h('span', { class: l.deaths ? 'bad' : '' }, String(l.deaths))),
    repLines.length ? h('div', { class: 'section-title' }, 'Reputation changes') : null,
    ...repLines,
    r.deliveries.length ? h('div', { class: 'section-title' }, 'Deliveries this morning') : null,
    ...r.deliveries.map((d) => h('div', { class: 'small' }, d)),
  );
  const scr = c.ui.menu({ title: `Day ${l.day} Summary`, body, items: [{ label: 'Open the shop', action: () => c.ui.remove(scr) }], className: 'wide' });
}
