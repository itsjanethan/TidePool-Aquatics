import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/newGame';
import { createFish, fishInTank } from '../src/sim/fish';
import { Rng } from '../src/core/rng';
import { diagnoseTank, tankAlert } from '../src/sim/tankDiagnostics';
import { FIXES, previewFix, tankMetrics, type FixId } from '../src/sim/preview';
import { addDecor } from '../src/sim/tank';
import { summarizeAquascape } from '../src/sim/aquascape';
import { coverPercent, tankNeeds } from '../src/sim/habitat';

const SEV = { critical: 0, warning: 1, advice: 2 };

describe('tank diagnostics', () => {
  it('reports the starter shop sensibly', () => {
    const s = newGame({ seed: 3 });
    for (const id of s.tankOrder) {
      const r = diagnoseTank(s, s.tanks[id]);
      // Severity order is always critical, warning, advice.
      for (let i = 1; i < r.issues.length; i++) expect(SEV[r.issues[i].severity]).toBeGreaterThanOrEqual(SEV[r.issues[i - 1].severity]);
      for (const i of r.issues) {
        expect(i.title.length).toBeGreaterThan(3);
        expect(i.explanation.length).toBeGreaterThan(10);
        expect(i.actions.length).toBeGreaterThan(0);
      }
      expect(r.status).not.toBe('urgent');
    }
  });

  it('dead fish are reported as dead, not toxic water', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    const f = fishInTank(s, 'A1')[0];
    f.alive = false;
    const r = diagnoseTank(s, t);
    expect(r.issues[0].id).toBe('dead');
    expect(tankAlert(s, t)).toBe('dead');
  });

  it('a sick fish in clean water is "sick", never "toxic"', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    t.water.ammonia = 0;
    t.water.nitrite = 0;
    fishInTank(s, 'A1')[0].health = 30;
    const r = diagnoseTank(s, t);
    expect(r.issues.some((i) => i.id === 'sick')).toBe(true);
    expect(r.issues.some((i) => i.icon === 'toxic')).toBe(false);
    expect(['sick', 'attention', 'hungry', 'dirty']).toContain(tankAlert(s, t));
  });

  it('toxic water is reported with its measured value', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    t.water.ammonia = 0.8;
    const r = diagnoseTank(s, t);
    const a = r.issues.find((i) => i.id === 'ammonia')!;
    expect(a.severity).toBe('critical');
    expect(a.value).toContain('0.8');
    expect(tankAlert(s, t)).toBe('toxic');
    expect(r.status).toBe('urgent');
  });

  it('hungry fish are reported as hungry', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    for (const f of fishInTank(s, 'A1')) f.hunger = 90;
    expect(diagnoseTank(s, t).issues.some((i) => i.id === 'hungry')).toBe(true);
  });

  it('dirty glass and algae are reported with numbers', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    t.glassDirt = 0.7;
    t.algae = 0.6;
    const r = diagnoseTank(s, t);
    expect(r.issues.find((i) => i.id === 'glass')?.value).toBe('70% dirty');
    expect(r.issues.some((i) => i.id === 'algae')).toBe(true);
  });

  it('previews equal the real action exactly', () => {
    const s = newGame({ seed: 5 });
    const t = s.tanks.A2;
    t.glassDirt = 0.6;
    t.algae = 0.5;
    t.water.detritus = 3;
    t.water.nitrate = 60;
    t.filterCondition = 0.4;
    t.food = 0;
    fishInTank(s, 'A2')[0].alive = false;
    for (const fix of Object.keys(FIXES) as FixId[]) {
      const copy = structuredClone(s);
      const p = previewFix(copy, 'A2', fix);
      // The preview must not touch the state it was given.
      expect(tankMetrics(copy, copy.tanks.A2)).toEqual(p.before);
      const r = FIXES[fix].run(copy, copy.tanks.A2);
      expect(r).toEqual(p.result);
      expect(tankMetrics(copy, copy.tanks.A2)).toEqual(p.after);
    }
  });

  it('issue actions carry previews when asked', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.A1;
    t.glassDirt = 0.8;
    const glass = diagnoseTank(s, t, true).issues.find((i) => i.id === 'glass')!;
    const act = glass.actions.find((a) => a.fix === 'glass')!;
    expect(act.effect).toContain('Glass dirt 80% → 0%');
  });

  it('habitat cover is numeric and per species', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.C1;
    for (const f of fishInTank(s, 'C1', true)) delete s.fish[f.id];
    t.decor = [];
    t.floating = {};
    const rng = new Rng(2);
    for (let i = 0; i < 8; i++) createFish(s, rng, { speciesId: 'neon_tetra', origin: 'dev', tankId: 'C1', sizeFraction: 1 });
    const needs = tankNeeds(fishInTank(s, 'C1'));
    expect(needs.coverPct).toBe(55);
    const r = diagnoseTank(s, t);
    const cover = r.issues.find((i) => i.id === 'cover')!;
    expect(cover.value).toBe('0%');
    expect(cover.recommended).toContain('55%');
    // Adding plants raises the percentage the diagnosis reports.
    for (let i = 0; i < 4; i++) addDecor(s, t, 'java_fern', 0.15 + i * 0.2, 1);
    const pct = coverPercent(summarizeAquascape(t));
    expect(pct).toBeGreaterThan(0);
    const after = diagnoseTank(s, t).issues.find((i) => i.id === 'cover');
    if (after) expect(after.value).toBe(`${pct}%`);
  });

  it('cave spaces are counted per adult cave dweller', () => {
    const s = newGame({ seed: 3 });
    const t = s.tanks.C1;
    for (const f of fishInTank(s, 'C1', true)) delete s.fish[f.id];
    t.decor = [];
    const rng = new Rng(4);
    for (let i = 0; i < 3; i++) createFish(s, rng, { speciesId: 'bristlenose', origin: 'dev', tankId: 'C1', sizeFraction: 1 });
    let caves = diagnoseTank(s, t).issues.find((i) => i.id === 'caves')!;
    expect(caves.value).toBe('0 / 3 cave spaces');
    addDecor(s, t, 'slate_stack', 0.5, 1);
    caves = diagnoseTank(s, t).issues.find((i) => i.id === 'caves')!;
    expect(caves.value).toBe('2 / 3 cave spaces');
    addDecor(s, t, 'clay_cave', 0.2, 1);
    expect(diagnoseTank(s, t).issues.find((i) => i.id === 'caves')).toBeUndefined();
  });
});
