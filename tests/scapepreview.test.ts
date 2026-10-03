import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { explainPlacement } from '../src/sim/scapePreview';
import { LAYOUT_PARTS, summarizeAquascape } from '../src/sim/aquascape';
import { addDecor } from '../src/sim/tank';
import { coverPercent } from '../src/sim/habitat';
import { DECOR } from '../src/data/catalog';
import { MAX_DECOR } from '../src/sim/plants';

const fresh = () => {
  const s = newGame({ seed: 7 });
  s.money = 10000;
  return s;
};

describe('Aquascape score components', () => {
  it('the parts add up to the layout score every tank reports', () => {
    const s = fresh();
    for (const id of s.tankOrder) {
      const sc = summarizeAquascape(s.tanks[id]);
      const sum = Object.values(sc.parts).reduce((a, b) => a + b, 0);
      expect(sc.layout).toBeCloseTo(Math.min(100, Math.max(0, sum)), 6);
      for (const k of Object.keys(sc.parts) as Array<keyof typeof sc.parts>) expect(sc.parts[k]).toBeLessThanOrEqual(LAYOUT_PARTS[k].max + 1e-9);
    }
  });
});

describe('Placement previews match the real placement', () => {
  it('predicted score, cover and caves equal what placing the item actually does', () => {
    for (const def of DECOR.filter((d) => !d.marineOnly)) {
      for (const [x, layer] of [[0.1, 0], [0.5, 1], [0.9, 2]] as const) {
        const s = fresh();
        const t = s.tanks.A1;
        const ex = explainPlacement(s, 'A1', { defId: def.id, x, layer, source: 'buy' });
        expect(ex.allowed, def.id).toBe(true);
        // The preview did not touch the real tank.
        expect(summarizeAquascape(t).layout).toBeCloseTo(ex.layoutBefore, 0);
        const r = addDecor(s, t, def.id, x, layer);
        expect(r.ok).toBe(true);
        const real = summarizeAquascape(t);
        expect(real.layout, `${def.id} at ${x},${layer}`).toBeCloseTo(ex.layoutAfter, 1);
        expect(real.beauty).toBeCloseTo(ex.beautyAfter, 1);
      }
    }
  });

  it('lists only the score components that change, and they sum to the change', () => {
    const s = fresh();
    const ex = explainPlacement(s, 'A1', { defId: 'mopani', x: 0.2, layer: 0, source: 'buy' });
    const delta = ex.changes.reduce((a, l) => a + (l.after - l.before), 0);
    expect(delta).toBeCloseTo(ex.layoutAfter - ex.layoutBefore, 0);
    expect(ex.changes.every((l) => l.after !== l.before)).toBe(true);
  });

  it('explains what the item provides from the habitat numbers', () => {
    const s = fresh();
    s.tanks.A1.decor = [];
    s.tanks.A1.floating = {};
    const cave = DECOR.find((d) => d.cave && !d.marineOnly)!;
    const ex = explainPlacement(s, 'A1', { defId: cave.id, x: 0.3, layer: 1, source: 'buy' });
    expect(ex.provides.some((p) => /cave space/.test(p))).toBe(true);
    const plant = explainPlacement(s, 'A1', { defId: 'amazon_sword', x: 0.3, layer: 1, source: 'buy' });
    expect(plant.provides.some((p) => /Hiding cover \+\d+%/.test(p))).toBe(true);
    expect(plant.provides.some((p) => /nitrate/.test(p))).toBe(true);
    // Young plants: the grown preview comes from the same scoring.
    expect(plant.layoutGrown).toBeDefined();
  });

  it('flags caps and diminishing returns', () => {
    const s = fresh();
    const t = s.tanks.A1;
    while (t.decor.length < 8) addDecor(s, t, t.decor.length % 2 ? 'river_stone' : 'java_fern', (t.decor.length + 1) / 10, (t.decor.length % 3) as 0 | 1 | 2);
    const ex = explainPlacement(s, 'A1', { defId: 'river_stone', x: 0.5, layer: 1, source: 'buy' });
    expect(ex.limits.some((l) => /Item count already full marks/.test(l))).toBe(true);
    const full = summarizeAquascape(t);
    expect(coverPercent(full)).toBeGreaterThan(0);
  });

  it('moving an item previews the move; position and depth change the explanation', () => {
    const s = fresh();
    const t = s.tanks.A1;
    addDecor(s, t, 'river_stone', 0.5, 1);
    const uid = t.decor[t.decor.length - 1].uid;
    const a = explainPlacement(s, 'A1', { defId: 'river_stone', x: 0.5, layer: 1, source: 'move', moveUid: uid });
    expect(a.layoutAfter).toBeCloseTo(a.layoutBefore, 6);
    const b = explainPlacement(s, 'A1', { defId: 'river_stone', x: 0.0, layer: 0, source: 'move', moveUid: uid });
    expect(t.decor.find((d) => d.uid === uid)!.x).toBe(0.5); // preview never moves the real item
    expect(b.layoutAfter).not.toBeCloseTo(a.layoutAfter, 3);
  });

  it('separates species care from the score, including trade-offs', () => {
    const s = fresh();
    // A tank with fish that want open water.
    const id = s.tankOrder.find((tid) => Object.values(s.fish).some((f) => f.tankId === tid))!;
    const ex = explainPlacement(s, id, { defId: 'amazon_sword', x: 0.5, layer: 1, source: 'buy' });
    expect(Array.isArray(ex.care)).toBe(true);
    // Something is always said about the fish (care), and it never claims a score change as care.
    expect(ex.care.length).toBeGreaterThan(0);
    const empty = s.tankOrder.find((tid) => !Object.values(s.fish).some((f) => f.tankId === tid && f.alive));
    if (empty) {
      const e2 = explainPlacement(s, empty, { defId: 'amazon_sword', x: 0.5, layer: 1, source: 'buy' });
      expect(e2.care[0].text).toMatch(/only changes the layout score/);
    }
  });

  it('reports refusals and money without blocking the preview', () => {
    const s = fresh();
    s.money = 0;
    const ex = explainPlacement(s, 'A1', { defId: 'mopani', x: 0.5, layer: 1, source: 'buy' });
    expect(ex.affordable).toBe(false);
    expect(ex.allowed).toBe(true);
    const t = s.tanks.A1;
    s.money = 1e6;
    while (t.decor.length < MAX_DECOR) addDecor(s, t, 'river_stone', 0.5, 1);
    const full = explainPlacement(s, 'A1', { defId: 'mopani', x: 0.5, layer: 1, source: 'buy' });
    expect(full.allowed).toBe(false);
    expect(full.refusal).toMatch(/full/);
  });
});
