import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { plantFromStorage, plantValue, removeToStorage, sellPlantsToTrade, takeCutting, trimPlant } from '../src/sim/plants';
import { addDecor, setSubstrate, ownsSubstrate } from '../src/sim/tank';
import { checkoutQuote, completeSale, offerPlant, spawnCustomer } from '../src/sim/customers';
import { deserialize, serialize } from '../src/sim/save';
import { placeOrder } from '../src/sim/supplier';
import { fishInTank } from '../src/sim/fish';
import { Rng } from '../src/core/rng';

describe('plants', () => {
  it('plants grow with light and nutrients', () => {
    const s = newGame({ seed: 3 });
    const sim = new Simulation(s);
    const t = s.tanks.A4;
    addDecor(s, t, 'hornwort', 0.5, 0);
    const p = t.decor[t.decor.length - 1];
    const start = p.size;
    for (let h = 0; h < 24 * 5; h++) {
      s.minute += 60;
      sim.tickTanks(1);
    }
    expect(p.size).toBeGreaterThan(start + 0.15);
  });

  it('cuttings become potted plants, can be replanted and sold', () => {
    const s = newGame({ seed: 4 });
    const t = s.tanks.B1;
    const sword = t.decor.find((d) => d.defId === 'amazon_sword')!;
    sword.size = 1.2;
    expect(takeCutting(s, t, sword.uid, 'large').ok).toBe(true);
    expect(sword.size).toBeCloseTo(0.65, 3);
    expect(takeCutting(s, t, sword.uid, 'large').ok).toBe(false); // would leave too little
    expect(s.storage.plants.length).toBe(1);
    const pot = s.storage.plants[0];
    expect(plantValue(pot)).toBeGreaterThan(0);
    expect(plantFromStorage(s, s.tanks.C2, pot.uid, 0.3, 0).ok).toBe(true);
    expect(s.storage.plants.length).toBe(0);
    expect(s.tanks.C2.decor[0].size).toBeCloseTo(0.55, 3);
    // Uprooting puts it back in storage; trade sale pays out.
    removeToStorage(s, s.tanks.C2, s.tanks.C2.decor[0].uid);
    const m0 = s.money;
    expect(sellPlantsToTrade(s, s.storage.plants.map((p) => p.uid)).ok).toBe(true);
    expect(s.money).toBeGreaterThan(m0);
    sword.size = 1.5;
    trimPlant(s, t, sword.uid);
    expect(sword.size).toBe(1);
  });

  it('hardscape removed from a tank goes to storage', () => {
    const s = newGame({ seed: 5 });
    const t = s.tanks.A1;
    const stone = t.decor.find((d) => d.defId === 'river_stone')!;
    removeToStorage(s, t, stone.uid);
    expect(s.storage.decor.river_stone).toBe(1);
  });

  it('customers can buy potted plants at the till', () => {
    const s = newGame({ seed: 6 });
    s.minute = 600;
    const sim = new Simulation(s);
    s.storage.plants.push({ uid: 'pp1', defId: 'amazon_sword', size: 0.6, health: 1, reservedBy: null });
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'browse', archetype: 'beginner' });
    c.traits.budget = 100;
    c.traits.experience = 0;
    let accepted = false;
    for (let i = 0; i < 20 && !accepted; i++) accepted = offerPlant(s, c, new Rng(i));
    expect(accepted).toBe(true);
    const q = checkoutQuote(s, c);
    expect(q.lines.some((l) => l.label.includes('Amazon Sword'))).toBe(true);
    const res = completeSale(s, sim.customerCtx, c, q.total);
    expect(res.plantCount).toBe(1);
    expect(s.storage.plants.length).toBe(0);
  });

  it('owned substrates can be switched back for free', () => {
    const s = newGame({ seed: 7 });
    const t = s.tanks.A1;
    const m0 = s.money;
    setSubstrate(s, t, 'sand');
    expect(s.money).toBeLessThan(m0);
    setSubstrate(s, t, 'gravel');
    const m1 = s.money;
    expect(ownsSubstrate(t, 'sand')).toBe(true);
    setSubstrate(s, t, 'sand');
    expect(s.money).toBe(m1);
  });

  it('orders can deliver to several tanks at once', () => {
    const s = newGame({ seed: 8 });
    const sim = new Simulation(s);
    const before = fishInTank(s, 'C2').length;
    const r = placeOrder(s, 'riverside', [
      { speciesId: 'guppy', quantity: 3, tankId: 'C2' },
      { speciesId: 'platy', quantity: 2, tankId: 'A5' },
      { speciesId: 'guppy', quantity: 2, tankId: 'A1' },
    ], 1);
    expect(r.ok).toBe(true);
    sim.advance(60 * 30);
    expect(fishInTank(s, 'C2').length).toBe(before + 3);
  });

  it('migrates version 1 saves', () => {
    const s = newGame({ seed: 9 });
    const file = JSON.parse(JSON.stringify(serialize(s, 'slot1')));
    file.version = 1;
    delete file.state.storage;
    for (const t of Object.values(file.state.tanks) as Array<Record<string, unknown>>) {
      delete t.ownedSubstrates;
      delete t.ownedBackgrounds;
      for (const d of t.decor as Array<Record<string, unknown>>) delete d.size;
    }
    const back = deserialize(file);
    expect(back.storage.plants).toEqual([]);
    expect(back.tanks.A1.decor[0].size).toBe(1);
    expect(back.tanks.A1.ownedSubstrates).toContain('gravel');
  });
});
