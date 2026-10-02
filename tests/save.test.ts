import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { newGame } from '../src/sim/newGame';
import { Simulation } from '../src/sim/simulation';
import { deserialize, IndexedDBStorage, MemoryStorage, SaveManager, serialize } from '../src/sim/save';

describe('save system', () => {
  it('round-trips a game through serialize/deserialize', () => {
    const s = newGame({ seed: 99, playerName: 'Tester' });
    new Simulation(s).advance(300);
    const file = serialize(s, 'slot1');
    const back = deserialize(JSON.parse(JSON.stringify(file)));
    expect(back.playerName).toBe('Tester');
    expect(Object.keys(back.fish).length).toBe(Object.keys(s.fish).length);
    expect(back.minute).toBeCloseTo(s.minute, 5);
    expect(back.tanks.A1.water.nitrate).toBeCloseTo(s.tanks.A1.water.nitrate, 8);
    expect(back.customers).toEqual([]);
  });

  it('rejects saves from the future and garbage', () => {
    const s = newGame({ seed: 1 });
    const file = serialize(s, 'slot1');
    expect(() => deserialize({ ...file, version: 999 })).toThrow();
    expect(() => deserialize({ hello: 1 })).toThrow();
  });

  it('saves and loads via IndexedDB', async () => {
    const mgr = new SaveManager(new IndexedDBStorage());
    const s = newGame({ seed: 5, shopName: 'Fin City' });
    await mgr.save('slot2', s);
    const loaded = await mgr.load('slot2');
    expect(loaded?.shopName).toBe('Fin City');
    const list = await mgr.list();
    expect(list.some((x) => x.slot === 'slot2')).toBe(true);
  });

  it('simulation continues deterministically after reload', () => {
    const a = newGame({ seed: 42 });
    const simA = new Simulation(a);
    simA.advance(120);
    const mgr = new SaveManager(new MemoryStorage());
    const b = mgr.importString(mgr.exportString(a));
    const simB = new Simulation(b);
    // Customers are dropped on save, so compare tank chemistry only.
    a.customers = [];
    simA.advance(600);
    simB.advance(600);
    expect(b.tanks.B2.water.nitrate).toBeCloseTo(a.tanks.B2.water.nitrate, 1);
  });
});
