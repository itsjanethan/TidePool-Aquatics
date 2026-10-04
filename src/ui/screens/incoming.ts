/** Incoming livestock screens: per tank (tank menu) and for the whole shop (office PC). */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { getSpecies } from '../../data/species';
import { arrivalText, incomingForTank, tankOutlook } from '../../sim/incoming';
import type { PlannedLine } from '../../sim/orderCheck';
import { cancelOrder, cancelRefund, getSupplier } from '../../sim/supplier';
import { dayOf } from '../../sim/time';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { locked } from './locks';

const name = (sid: string) => getSpecies(sid).commonName;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Current inhabitants, livestock on order (what, how many, when, which
 * order), the tank after delivery and the stocking breakdown. Pass planned
 * lines (a cart line being edited) to include them; they are never counted
 * twice with placed orders.
 */
export function outlookEl(c: GameController, tankId: string, planned: PlannedLine[] = [], plannedLabel = 'this order'): HTMLElement {
  const s = c.state;
  const o = tankOutlook(s, tankId, planned);
  const rows: HTMLElement[] = [];
  rows.push(h('div', { class: 'small' }, h('span', { class: 'ol-k' }, 'In the tank: '), o.current.length ? o.current.map((x) => `${x.count} ${name(x.speciesId)}`).join(', ') : 'empty'));
  if (o.incoming.length) {
    for (const l of o.incoming) {
      rows.push(h('div', { class: 'small incoming-line' }, h('span', { class: 'ol-k' }, 'On order: '), `${l.quantity} ${name(l.speciesId)}, arriving ${arrivalText(s, l.arrivalDay)} (order ${l.orderId}, ${l.supplierName})`));
    }
  } else rows.push(h('div', { class: 'small dim' }, 'Nothing on order for this tank.'));
  const plannedHere = planned.filter((p) => p.tankId === tankId && !p.orderId);
  if (o.incoming.length || plannedHere.length) {
    rows.push(h('div', { class: 'small' }, h('span', { class: 'ol-k' }, 'After delivery: '), o.after.map((x) => `${x.count} ${name(x.speciesId)}${x.incoming ? ` (+${x.incoming})` : ''}`).join(', ')));
  }
  const st = o.stocking;
  const parts = [`${pct(st.now)} now`];
  if (st.ordered > 0.005) parts.push(`+ ${pct(st.ordered)} on order`);
  if (st.planned > 0.005) parts.push(`+ ${pct(st.planned)} ${plannedLabel}`);
  rows.push(h('div', { class: `small ${st.total > 1.05 ? 'bad' : st.total > 0.9 ? 'warn' : ''}` }, h('span', { class: 'ol-k' }, 'Stocking: '), `${parts.join(' ')}${parts.length > 1 ? ` = ${pct(st.total)}` : ''}${st.total > 1.05 ? ' (overstocked)' : st.total > 0.9 ? ' (nearly full)' : ''}`));
  return h('div', { class: 'outlook' }, ...rows);
}

function cancelItem(c: GameController, orderId: string, done: () => void): MenuItem {
  const s = c.state;
  const o = s.orders.find((x) => x.id === orderId)!;
  const refund = cancelRefund(o, dayOf(s.minute));
  return locked(c, 'order', {
    label: `Cancel order ${o.id}`,
    right: `refund ${formatMoney(refund)}`,
    hint: `${o.lines.map((l) => `${l.quantity} ${name(l.speciesId)} to ${s.tanks[l.tankId]?.name ?? '?'}`).join(', ')}. ${refund < o.total ? 'Already dispatched: 75% back.' : 'Placed today: full refund.'}`,
    action: () =>
      void c.ui.confirm(`Cancel order ${o.id} from ${getSupplier(o.supplierId).name} and get ${formatMoney(refund)} back?`).then((y) => {
        if (!y) return;
        const r = cancelOrder(s, o.id, dayOf(s.minute));
        c.ui.toast(r.message, r.ok ? 'good' : 'warn', 3500);
        done();
      }),
  });
}

/** Tank menu: what is on its way to this tank. */
export function openIncoming(c: GameController, tankId: string, onChange?: () => void): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const ids = [...new Set(incomingForTank(s, tankId).map((l) => l.orderId))];
    return [...ids.map((id) => cancelItem(c, id, () => { scr.refresh(items()); onChange?.(); })), { label: 'Back', action: () => c.ui.remove(scr) }];
  };
  const scr = c.ui.menu({ title: `On order: ${s.tanks[tankId].name}`, body: () => outlookEl(c, tankId), items: items(), className: 'wide' });
}

/** Office PC: every outstanding livestock order. */
export function openAllIncoming(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [];
    for (const o of [...s.orders].sort((a, b) => a.arrivalDay - b.arrivalDay)) {
      list.push({ label: `Order ${o.id} · ${getSupplier(o.supplierId).name} · ${arrivalText(s, o.arrivalDay)}`, header: true });
      for (const l of o.lines) {
        list.push({ label: `${l.quantity} ${name(l.speciesId)} → ${s.tanks[l.tankId]?.name ?? '?'}`, right: formatMoney(l.quantity * l.unitCost), hint: 'Open the tank outlook: what is there now and what it will hold.', action: () => openIncoming(c, l.tankId, () => scr.refresh(items())) });
      }
      list.push(cancelItem(c, o.id, () => scr.refresh(items())));
    }
    if (!s.orders.length) list.push({ label: 'No livestock on order.', disabled: true });
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Incoming deliveries', body: h('div', { class: 'small' }, 'Fish arrive at opening time on their delivery day, straight into their tank.'), items: items(), className: 'wide tall' });
}
