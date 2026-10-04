import { describe, expect, it } from 'vitest';
import { EXPANSIONS } from '../src/data/expansions';
import { applyPreset, createSandbox, PRESETS } from '../src/dev/sandbox';
import { Simulation } from '../src/sim/simulation';
import { FLOORS } from '../src/data/floors';
import { SPECIES } from '../src/data/species';
import { RETAIL_ITEMS } from '../src/data/retail';
import { DECOR } from '../src/data/catalog';
import { fishInTank } from '../src/sim/fish';
import { MAX_FISH_PER_TANK } from '../src/sim/breeding';
import { diagnoseTank } from '../src/sim/tankDiagnostics';
import { adoptSandboxImport, deserialize, isSandboxState, MemoryStorage, PrefixedStorage, SANDBOX_PREFIX, SaveManager, serialize } from '../src/sim/save';
import { newGame } from '../src/sim/newGame';

describe('Developer Sandbox fixture', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(createSandbox())).toBe(JSON.stringify(createSandbox()));
  });

  it('unlocks every implemented floor, species, item, decor and role', () => {
    const s = createSandbox();
    expect(isSandboxState(s)).toBe(true);
    expect(s.flags.devUsed).toBe(true);
    expect(s.shopLevel).toBe(Math.max(...EXPANSIONS.map((e) => e.level)));
    expect(new Set(s.unlocks.floors)).toEqual(new Set(FLOORS.map((f) => f.id)));
    expect(s.unlocks.marine).toBe(true);
    for (const sp of SPECIES) {
      const offered = Object.values(s.suppliers).some((st) => st.stock.some((x) => x.speciesId === sp.id && x.available > 0));
      expect(offered, `${sp.id} on sale`).toBe(true);
    }
    for (const r of RETAIL_ITEMS) expect(s.retail[r.id], r.id).toBeGreaterThan(0);
    for (const d of DECOR) {
      const have = (s.storage.decor[d.id] ?? 0) > 0 || s.storage.plants.some((p) => p.defId === d.id);
      expect(have, `${d.id} in stock`).toBe(true);
    }
    expect(s.staff.map((m) => m.role).sort()).toEqual(['floater', 'maintenance', 'sales', 'stock']);
    expect(s.money).toBeGreaterThanOrEqual(50_000);
  });

  it('has healthy, mature tanks on every floor and passes a few simulated days', () => {
    const s = createSandbox();
    for (const id of s.tankOrder) {
      // The performance preset is deliberately at the population cap (overstocked).
      if (id === PRESETS.find((p) => p.id === 'performance')!.tank) continue;
      const r = diagnoseTank(s, s.tanks[id]);
      expect(r.issues.filter((i) => i.severity === 'critical').map((i) => `${id}:${i.id}`)).toEqual([]);
    }
    expect(s.tanks.M1.water.salinity).toBe(35);
    expect(fishInTank(s, 'Q1').length).toBe(MAX_FISH_PER_TANK);
    const sim = new Simulation(s);
    const alive = Object.values(s.fish).filter((f) => f.alive).length;
    for (let h = 0; h < 72; h++) sim.advance(60);
    // Sales remove fish; deaths are what would show an unhealthy fixture.
    expect(s.stats.fishDied).toBeLessThan(alive * 0.05);
  });

  it('presets use the real rules (marine needs a marine tank)', () => {
    const s = createSandbox();
    expect(() => applyPreset(s, 'A1', 'marine')).toThrow(/freshwater/);
    expect(() => applyPreset(s, 'M2', 'planted')).toThrow(/marine/);
    for (const p of PRESETS) expect(() => applyPreset(s, p.tank, p.id)).not.toThrow();
  });
});

describe('sandbox save separation', () => {
  it('keeps sandbox saves out of normal Continue and slots', async () => {
    const backend = new MemoryStorage();
    const normal = new SaveManager(backend);
    const sandbox = new SaveManager(new PrefixedStorage(backend, SANDBOX_PREFIX), true);
    const sb = createSandbox();
    await expect(normal.save('slot1', sb)).rejects.toThrow();
    await sandbox.save('auto', sb);
    expect(await normal.latest()).toBeNull();
    expect((await sandbox.latest())?.shopName).toBe('Developer Sandbox');
    // A normal game cannot be written into the sandbox namespace either.
    await expect(sandbox.save('slot1', newGame({ seed: 1 }))).rejects.toThrow();
  });

  it('ignores a sandbox file placed under a normal key', async () => {
    const backend = new MemoryStorage();
    await backend.set('save:slot2', JSON.stringify(serialize(createSandbox(), 'slot2')));
    const normal = new SaveManager(backend);
    expect(await normal.latest()).toBeNull();
    await expect(normal.load('slot2')).rejects.toThrow();
  });

  it('importing a sandbox save into normal play marks it developer-used', () => {
    const file = JSON.parse(JSON.stringify(serialize(createSandbox(), 'export')));
    const st = deserialize(file);
    expect(isSandboxState(st)).toBe(true);
    adoptSandboxImport(st);
    expect(isSandboxState(st)).toBe(false);
    expect(st.flags.devUsed).toBe(true);
  });
});
