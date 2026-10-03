import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Rng } from '../src/core/rng';
import { cancelOrder, placeOrder, processDeliveries, refreshSupplierStock, suppliersFor } from '../src/sim/supplier';
import { incomingCount, incomingForTank, incomingSummary, tankOutlook } from '../src/sim/incoming';
import { lineWarnings, orderWarnings, outstandingLines, projectedStocking, stockingBreakdown, withOutstanding } from '../src/sim/orderCheck';
import { deserialize, serialize } from '../src/sim/save';
import { fishInTank } from '../src/sim/fish';
import { dayOf } from '../src/sim/time';
import { makeStockProposal } from '../src/sim/staff';
import type { GameState } from '../src/sim/types';

function setup(): { s: GameState; sup: string; day: number } {
  const s = newGame({ seed: 11 });
  s.money = 5000;
  const day = dayOf(s.minute);
  const sup = suppliersFor(s)[0].id;
  refreshSupplierStock(s, new Rng(3), sup, day);
  for (const st of s.suppliers[sup].stock) st.available = 50;
  return { s, sup, day };
}
const speciesOf = (s: GameState, sup: string, i = 0) => s.suppliers[sup].stock[i].speciesId;
const emptyTank = (s: GameState) => s.tankOrder.find((id) => !fishInTank(s, id).length && (s.tanks[id].waterType ?? 'freshwater') === 'freshwater') ?? s.tankOrder[0];

describe('Incoming livestock by tank', () => {
  it('lists species, quantity, arrival day and order per tank; deliveries clear it', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = s.tankOrder[0];
    expect(placeOrder(s, sup, [{ speciesId: sid, quantity: 6, tankId: tank }], day).ok).toBe(true);
    const inc = incomingForTank(s, tank);
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ speciesId: sid, quantity: 6, orderId: s.orders[0].id, arrivalDay: s.orders[0].arrivalDay });
    expect(incomingCount(s, tank)).toBe(6);
    expect(incomingSummary(s, tank)).toMatch(/6 .* on order/);
    // Nothing is in the tank yet.
    const before = fishInTank(s, tank).filter((f) => f.speciesId === sid).length;
    const out = tankOutlook(s, tank);
    expect(out.after.find((x) => x.speciesId === sid)!.count).toBe(before + 6);
    processDeliveries(s, new Rng(1), s.orders[0].arrivalDay);
    expect(incomingCount(s, tank)).toBe(0);
    expect(fishInTank(s, tank).filter((f) => f.speciesId === sid).length).toBe(before + 6);
  });

  it('projected stocking includes outstanding orders but never counts the cart twice', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = emptyTank(s);
    const cart = [{ speciesId: sid, quantity: 4, tankId: tank }];
    const before = projectedStocking(s, tank, cart);
    placeOrder(s, sup, [{ speciesId: sid, quantity: 4, tankId: tank }], day);
    const b = stockingBreakdown(s, tank, cart);
    expect(b.ordered).toBeGreaterThan(0);
    expect(b.planned).toBeCloseTo(b.ordered, 6); // same species and quantity
    expect(b.total).toBeCloseTo(b.now + b.ordered + b.planned, 9);
    expect(projectedStocking(s, tank, cart)).toBeGreaterThan(before);
    // Passing placed-order lines explicitly does not double them.
    const ordered = outstandingLines(s, tank);
    expect(withOutstanding(s, ordered)).toHaveLength(ordered.length);
    expect(projectedStocking(s, tank, ordered)).toBeCloseTo(stockingBreakdown(s, tank, []).total, 9);
  });

  it('overstock warnings count what is already ordered and say so', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = emptyTank(s);
    // Find a quantity that alone is fine but with the same again already ordered is too much.
    let q = 1;
    while (projectedStocking(s, tank, [{ speciesId: sid, quantity: q + 1, tankId: tank }], false) < 0.75 && q < 40) q++;
    const line = { speciesId: sid, quantity: q, tankId: tank };
    expect(lineWarnings(s, line, [line]).some((w) => /overstocked/.test(w.text))).toBe(false);
    placeOrder(s, sup, [{ speciesId: sid, quantity: q, tankId: tank }], day);
    const ws = lineWarnings(s, line, [line]);
    const over = ws.find((w) => /overstocked/.test(w.text));
    expect(over?.severity).toBe('warn');
    expect(over!.text).toMatch(/already ordered/);
  });

  it('warns when ordering more of a species already incoming, with the combined total, but does not block', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = emptyTank(s);
    placeOrder(s, sup, [{ speciesId: sid, quantity: 3, tankId: tank }], day);
    const line = { speciesId: sid, quantity: 2, tankId: tank };
    const dup = lineWarnings(s, line, [line]).find((w) => /already ordered for/.test(w.text));
    expect(dup).toBeDefined();
    expect(dup!.text).toContain(s.orders[0].id);
    expect(dup!.text).toMatch(/With this line: 5 /);
    // A deliberate repeat order still goes through.
    expect(placeOrder(s, sup, [line], day).ok).toBe(true);
    expect(incomingCount(s, tank)).toBe(5);
  });

  it('compatibility checks see incoming species', () => {
    const { s, sup, day } = setup();
    const stock = s.suppliers[sup].stock.map((x) => x.speciesId);
    const tank = emptyTank(s);
    // Try pairs until one is incompatible when combined (e.g. big fish with tiny fish, cold with tropical).
    let found = false;
    for (const a of stock) {
      for (const b of stock) {
        if (a === b) continue;
        const lineB = { speciesId: b, quantity: 2, tankId: tank };
        const alone = lineWarnings(s, lineB, [lineB]).length;
        const withA = lineWarnings(s, lineB, [lineB, { speciesId: a, quantity: 2, tankId: tank }]).length;
        if (withA > alone) {
          // The same issue appears when A is already on order instead of in the cart.
          const s2: GameState = JSON.parse(JSON.stringify(s));
          placeOrder(s2, sup, [{ speciesId: a, quantity: 2, tankId: tank }], day);
          expect(lineWarnings(s2, lineB, [lineB]).length).toBeGreaterThanOrEqual(withA);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('cancelling refunds (fully the same day, 75% later), restores stock and clears the tank', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = s.tankOrder[0];
    const avail = s.suppliers[sup].stock[0].available;
    placeOrder(s, sup, [{ speciesId: sid, quantity: 4, tankId: tank }], day);
    const money = s.money;
    const o = s.orders[0];
    const r = cancelOrder(s, o.id, day);
    expect(r.ok).toBe(true);
    expect(s.money).toBeCloseTo(money + o.total, 2);
    expect(s.suppliers[sup].stock[0].available).toBe(avail);
    expect(incomingCount(s, tank)).toBe(0);
    placeOrder(s, sup, [{ speciesId: sid, quantity: 4, tankId: tank }], day);
    const o2 = s.orders[0];
    const m2 = s.money;
    cancelOrder(s, o2.id, day + 1);
    expect(s.money).toBeCloseTo(m2 + o2.total * 0.75, 2);
    expect(cancelOrder(s, o2.id, day + 1).ok).toBe(false);
  });

  it('save and load keep incoming stock per tank', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = s.tankOrder[1];
    placeOrder(s, sup, [{ speciesId: sid, quantity: 7, tankId: tank }], day);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, 'slot1'))));
    expect(incomingForTank(back, tank)).toEqual(incomingForTank(s, tank));
  });

  it('order-wide warnings never repeat a tank warning', () => {
    const { s, sup, day } = setup();
    const sid = speciesOf(s, sup);
    const tank = emptyTank(s);
    placeOrder(s, sup, [{ speciesId: sid, quantity: 30, tankId: tank }], day);
    const cart = [{ speciesId: sid, quantity: 5, tankId: tank }, { speciesId: sid, quantity: 5, tankId: tank }];
    const ws = orderWarnings(s, cart);
    expect(new Set(ws.map((w) => w.text)).size).toBe(ws.length);
  });

  it('staff stock proposals avoid tanks already heavily ordered for', () => {
    const { s, sup, day } = setup();
    s.money = 100000;
    s.staff.push({ id: 'st1', name: 'Kai', role: 'stock', skills: { knowledge: 100, service: 50, care: 50, speed: 50 }, personality: 'steady', wage: 60, hiredDay: 1, floor: 'ground', x: 1, y: 1, facing: 'down', task: null, path: [], pending: null, dialogue: null } as never);
    const rng = new Rng(9);
    const first = makeStockProposal(s, rng, s.staff[s.staff.length - 1]);
    expect(first?.stock).toBeDefined();
    if (!first?.stock) return;
    // Fill that tank with orders, then ask again with the same seed.
    placeOrder(s, sup, [{ speciesId: first.stock.speciesId === speciesOf(s, sup) ? speciesOf(s, sup, 1) : speciesOf(s, sup), quantity: 40, tankId: first.stock.tankId }], day);
    const again = makeStockProposal(s, new Rng(9), s.staff[s.staff.length - 1]);
    if (again?.stock && again.stock.tankId === first.stock.tankId) {
      // Same tank: then it must at least warn about what is already on its way.
      expect(again.warnings.join(' ')).toMatch(/already ordered|overstocked/);
    } else expect(again?.stock?.tankId ?? 'none').not.toBe(first.stock.tankId);
  });
});
