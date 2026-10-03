import { describe, expect, it } from 'vitest';
import { FLOORS, floorOfTank, floorRoute, getFloorLayout, stairsArrival, tankIdsOnFloor } from '../src/data/floors';
import { buildCustomerGrid, buildWalkGrid, stairsOf } from '../src/data/shopLayout';
import { findPath } from '../src/sim/pathfinding';
import { newGame, SAVE_VERSION } from '../src/sim/newGame';
import { deserialize, serialize } from '../src/sim/save';
import { spawnCustomer, customerFloor } from '../src/sim/customers';
import { EXPANSIONS } from '../src/data/expansions';
import { expansionStatus, buyExpansion } from '../src/sim/expansion';
import { world, buildUpTo } from './helpers/world';
import { suppliersFor } from '../src/sim/supplier';

describe('floor registry', () => {
  it('has four floors with unique tank ids and reciprocal stairs', () => {
    expect(FLOORS.map((f) => f.id)).toEqual(['ground', 'upstairs', 'marine', 'basement']);
    const ids = FLOORS.flatMap((f) => tankIdsOnFloor(f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FLOORS) {
      for (const st of stairsOf(f.layout)) {
        const back = stairsOf(getFloorLayout(st.to!)).find((p) => p.to === f.id);
        expect(back, `${f.id} -> ${st.to} has a way back`).toBeTruthy();
      }
    }
    expect(floorOfTank('A1')).toBe('ground');
    expect(floorOfTank('U3')).toBe('upstairs');
    expect(floorOfTank('M1')).toBe('marine');
    expect(floorOfTank('Q1')).toBe('basement');
  });

  it('every tank, rack and stairs can be reached on foot from the stairs or the door', () => {
    for (const f of FLOORS) {
      const grid = buildWalkGrid(f.layout);
      const cgrid = buildCustomerGrid(f.layout);
      const start = stairsOf(f.layout)[0].interact![0];
      for (const p of f.layout.props) {
        if (!p.interact) continue;
        for (const t of p.interact) {
          expect(findPath(grid, start, t), `${f.id}: ${p.id} reachable`).toBeTruthy();
          if (p.kind !== 'desk') expect(findPath(cgrid, start, t), `${f.id}: ${p.id} reachable by customers`).toBeTruthy();
        }
      }
      if (f.layout.door) expect(findPath(cgrid, start, f.layout.door)).toBeTruthy();
    }
  });

  it('routes between floors through unlocked stairs only', () => {
    const all = FLOORS.map((f) => f.id);
    expect(floorRoute('ground', 'marine', all).map((r) => r.floor)).toEqual(['ground', 'upstairs']);
    expect(floorRoute('marine', 'basement', all).map((r) => r.floor)).toEqual(['marine', 'upstairs', 'ground']);
    expect(floorRoute('ground', 'upstairs', ['ground'])).toEqual([]);
    const arr = stairsArrival('ground', stairsOf(getFloorLayout('ground')).find((p) => p.to === 'upstairs')!);
    expect(arr.floor).toBe('upstairs');
  });
});

describe('save version 3', () => {
  it('migrates a v0.3.0 (version 2) save', () => {
    const s = newGame({ seed: 9 });
    const file = serialize(s, 'slot1') as unknown as { version: number; state: Record<string, unknown> };
    // Make it look like a 0.3.0 save.
    file.version = 2;
    const st = file.state as Record<string, unknown> & { player: { floor: string }; unlocks: { floors: string[] } };
    st.version = 2;
    st.player.floor = 'floor1';
    st.unlocks.floors = ['floor1'];
    for (const k of ['staff', 'applicants', 'proposals', 'shopLevel', 'retail']) delete st[k];
    const loaded = deserialize(JSON.parse(JSON.stringify(file)));
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(loaded.player.floor).toBe('ground');
    expect(loaded.unlocks.floors).toEqual(['ground']);
    expect(loaded.staff).toEqual([]);
    expect(loaded.shopLevel).toBe(1);
    expect(loaded.retail).toEqual({});
    expect(Object.keys(loaded.tanks).length).toBe(10);
  });

  it('round-trips floors, staff and proposals', () => {
    const sim = world(3, 4);
    const s = sim.state;
    s.player.floor = 'marine';
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s, 'slot1'))));
    expect(loaded.player.floor).toBe('marine');
    expect(loaded.unlocks.floors).toEqual(['ground', 'upstairs', 'marine', 'basement']);
    expect(loaded.shopLevel).toBe(4);
    expect(Object.keys(loaded.tanks).length).toBe(24);
  });
});

describe('expansions', () => {
  it('needs reputation, customers, capital and goals, in order', () => {
    const s = newGame({ seed: 1 });
    const st = expansionStatus(s, 'coldwater');
    expect(st.canBuy).toBe(false);
    expect(st.requirements.map((r) => r.label)).toEqual(expect.arrayContaining(['Reputation', 'Customers served', 'Capital']));
    expect(buyExpansion(s, 'coldwater').ok).toBe(false);
    expect(expansionStatus(s, 'advanced').available).toBe(false);
  });

  it('building opens the floor, creates its tanks, unlocks species and suppliers', () => {
    const s = newGame({ seed: 1 });
    expect(suppliersFor(s).map((x) => x.id)).toEqual(['riverside', 'highfield']);
    buildUpTo(s, 2);
    expect(s.unlocks.floors).toContain('upstairs');
    expect(s.shopLevel).toBe(2);
    for (const t of EXPANSIONS[0].tanks) expect(s.tanks[t.id]).toBeTruthy();
    expect(suppliersFor(s).map((x) => x.id)).toContain('northern');
    buildUpTo(s, 3);
    expect(s.tanks.M1.waterType).toBe('marine');
    expect(s.tanks.M1.water.salinity).toBe(35);
    expect(s.unlocks.marine).toBe(true);
  });
});

describe('customers across floors', () => {
  it('walk up the stairs to browse an upstairs tank, then come back down', () => {
    const sim = world(5, 2);
    const s = sim.state;
    s.minute = Math.floor(s.minute / 1440) * 1440 + 10 * 60;
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'browse' });
    c.browseQueue = ['U2'];
    c.path = [];
    c.phase = 'entering';
    let wentUp = false;
    for (let i = 0; i < 240 && s.customers.includes(c); i++) {
      sim.advance(1);
      if (customerFloor(c) === 'upstairs') wentUp = true;
    }
    expect(wentUp).toBe(true);
    expect(s.customers.includes(c)).toBe(false); // finished and left by the street door
  });
});
