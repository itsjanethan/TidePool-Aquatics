// Regression tests for the near-realistic tank view (v0.7): the optics pass
// inputs, detail scale, caustic generator, texture budgets and the painters
// that every species, morph and land animal now goes through.
import { describe, expect, it } from 'vitest';
import { detailScale, qualitySettings } from '../src/render/quality';
import { opticsUniforms, type OpticsInput } from '../src/render/fx/opticsParams';
import { CAUSTIC_SIZE, paintCaustics } from '../src/render/fx/causticTexture';
import { LightMap } from '../src/render/lighting';
import { paintFishSheet, SHEET_FRAMES } from '../src/render/art/fishPainter';
import { critterColours, paintCritterSheet, type CritterKind } from '../src/render/art/critterArt';
import { fishTexels, MAX_TEXELS } from '../src/render/art/fishBudget';
import { phenotypeOf } from '../src/sim/phenotype';
import { createFish, getMorph } from '../src/sim/fish';
import { SPECIES, getSpecies } from '../src/data/species';
import { newGame } from '../src/sim/newGame';
import { Rng } from '../src/core/rng';
import { relief } from '../src/render/art/relief';

const opaque = (d: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
  return n;
};

describe('Optics pass inputs', () => {
  const base: OpticsInput = {
    tank: { x0: 28, y0: 64, x1: 932, y1: 596 },
    water: { x0: 28, y0: 92, x1: 932, y1: 596 },
    lightMap: { x0: 28, y0: 92, x1: 932, y1: 532 },
    floor: 532,
    lit: 1,
    light: 0xfff8e6,
    waterColour: 0x1a4a48,
    caustics: 1,
    rays: 1,
    fog: 0.4,
    glass: 1,
    mirror: 14,
    smoothEdges: true,
    haze: 0,
  };

  it('maps world rectangles through the camera to screen uv (y from the top)', () => {
    const u = opticsUniforms(base, { scrollX: 0, scrollY: 0, zoom: 1, w: 960, h: 640 });
    expect(u.tank[0]).toBeCloseTo(28 / 960);
    expect(u.tank[3]).toBeCloseTo(596 / 640);
    expect(u.floor).toBeCloseTo(532 / 640);
    // Zoomed and scrolled: a phone portrait camera showing the tank at 0.8125.
    const p = opticsUniforms(base, { scrollX: 0, scrollY: -100, zoom: 0.8125, w: 780, h: 1600 });
    expect(p.tank[0]).toBeCloseTo((28 * 0.8125) / 780);
    expect(p.water[1]).toBeCloseTo(((92 + 100) * 0.8125) / 1600);
    // The mirror band scales with the zoom, in screen uv.
    expect(p.amt2[0]).toBeCloseTo((14 * 0.8125) / 1600);
    expect(p.amt2[1]).toBe(1);
  });

  it('a land enclosure has no water (empty rectangle) and haze instead', () => {
    const u = opticsUniforms({ ...base, water: null, haze: 0.8 }, { scrollX: 0, scrollY: 0, zoom: 1, w: 960, h: 640 });
    expect(u.water[0]).toBeGreaterThan(u.water[2]);
    expect(u.amt2[0]).toBe(0);
    expect(u.amt2[2]).toBe(0.8);
  });

  it('colours are passed as 0..1 channels', () => {
    const u = opticsUniforms({ ...base, light: 0xff8000 }, { scrollX: 0, scrollY: 0, zoom: 1, w: 960, h: 640 });
    expect(u.lightCol).toEqual([1, 128 / 255, 0]);
  });
});

describe('Detail scale and quality', () => {
  it('follows the camera zoom in half steps, capped by quality, never below 1', () => {
    expect(detailScale(0.8, 2)).toBe(1); // phone portrait
    expect(detailScale(1, 2)).toBe(1); // 960x640 window
    expect(detailScale(1.4, 2)).toBe(1.5); // 1440x900 window
    expect(detailScale(1.9, 1.5)).toBe(1.5); // capped at Standard
    expect(detailScale(3, 2)).toBe(2);
    expect(detailScale(3, 1)).toBe(1); // Low
  });

  it('Low turns the optics pass off and keeps detail native; higher levels never do less', () => {
    const [low, std, high] = (['low', 'standard', 'high'] as const).map((q) => qualitySettings(q));
    expect(low.optics).toBe(false);
    expect(low.maxDetail).toBe(1);
    expect(std.optics && high.optics).toBe(true);
    expect(std.maxDetail).toBeLessThanOrEqual(high.maxDetail);
  });
});

describe('Caustic texture', () => {
  it('is deterministic, tileable at the edges and mostly dark with bright filaments', () => {
    const a = paintCaustics();
    const b = paintCaustics();
    expect(a).toEqual(b);
    const N = CAUSTIC_SIZE;
    let sum = 0;
    let bright = 0;
    for (let i = 0; i < N * N; i++) {
      sum += a[i * 4];
      if (a[i * 4] > 160) bright++;
    }
    const mean = sum / (N * N);
    expect(mean).toBeGreaterThan(25);
    expect(mean).toBeLessThan(110);
    expect(bright / (N * N)).toBeGreaterThan(0.01);
    expect(bright / (N * N)).toBeLessThan(0.25);
    // Opposite edges continue each other (wrapped splats and blur), so tiling has no seam.
    let diff = 0;
    for (let y = 0; y < N; y++) diff += Math.abs(a[(y * N) * 4] - a[(y * N + N - 1) * 4]);
    let inner = 0;
    for (let y = 0; y < N; y++) inner += Math.abs(a[(y * N + 100) * 4] - a[(y * N + 101) * 4]);
    expect(diff / N).toBeLessThan(Math.max(20, (inner / N) * 3));
  });
});

describe('Light map export', () => {
  it('writes the map into RGBA for the optics pass', () => {
    const lm = new LightMap(0, 100, 0, 100, 8);
    lm.rebuild(true, () => 0, [{ x0: 0, x1: 50, y0: 0, y1: 100, amount: 0.8 }]);
    const out = new Uint8ClampedArray(lm.cols * lm.rows * 4);
    lm.writeRGBA(out);
    expect(out[3]).toBe(255);
    const left = out[(2 * lm.cols + 0) * 4];
    const right = out[(2 * lm.cols + lm.cols - 1) * 4];
    expect(left).toBeLessThan(right);
  });
});

describe('Painters at higher detail', () => {
  const s = newGame({ seed: 21 });
  const rng = new Rng(22);
  const adult = (id: string) => createFish(s, rng, { speciesId: id, ageDays: 400, sex: 'male', origin: 'supplier', tankId: null });

  it('every fish species and morph paints soft-edged sheets at 2x detail, and genes still change the picture', () => {
    for (const sp of SPECIES.filter((x) => !['shrimp', 'snail', 'crab', 'frog', 'gecko', 'spider'].includes(x.body.shape))) {
      const seen = new Set<string>();
      for (const m of sp.morphs) {
        const f = createFish(s, rng, { speciesId: sp.id, morphId: m.id, ageDays: 400, sex: 'male', origin: 'supplier', tankId: null });
        const sheet = paintFishSheet(phenotypeOf(f), 160);
        expect(sheet.frames).toHaveLength(SHEET_FRAMES);
        expect(opaque(sheet.frames[0])).toBeGreaterThan(400);
        // Anti-aliased edges: some texels are partly transparent.
        let partial = 0;
        for (let i = 3; i < sheet.frames[0].length; i += 4) if (sheet.frames[0][i] > 10 && sheet.frames[0][i] < 245) partial++;
        expect(partial).toBeGreaterThan(20);
        let h = 0;
        for (let i = 0; i < sheet.frames[0].length; i += 97) h = (h * 31 + sheet.frames[0][i]) | 0;
        seen.add(String(h));
      }
      // Each morph looks different from the others.
      expect(seen.size).toBe(sp.morphs.length);
    }
  });

  it('a 2x sheet is about twice the size of a 1x sheet', () => {
    const p = phenotypeOf(adult('neon_tetra'));
    const one = paintFishSheet(p, 60);
    const two = paintFishSheet(p, 120);
    expect(two.width / one.width).toBeGreaterThan(1.8);
    expect(two.width / one.width).toBeLessThan(2.2);
  });

  it('the fish texture budget counts texels at their detail', () => {
    expect(fishTexels({ width: 50, height: 30, bodyLen: 40, detail: 2 })).toBe(101 * SHEET_FRAMES * 60);
    expect(MAX_TEXELS).toBeLessThanOrEqual(16_000_000);
  });

  it('every land animal and invertebrate morph paints all frames', () => {
    for (const sp of SPECIES.filter((x) => ['shrimp', 'snail', 'crab', 'frog', 'gecko', 'spider'].includes(x.body.shape))) {
      for (const m of sp.morphs) {
        const feat = sp.body.features ?? [];
        const sheet = paintCritterSheet(sp.body.shape as CritterKind, critterColours(getMorph(sp, m.id)), 80, false, { toePads: feat.includes('toe_pads'), fatTail: feat.includes('fat_tail'), crest: feat.includes('crest') });
        for (const fr of sheet.frames) expect(opaque(fr)).toBeGreaterThan(150);
      }
    }
    // Morphs of one frog species differ.
    const frog = getSpecies('dart_frog');
    const a = paintCritterSheet('frog', critterColours(getMorph(frog, frog.morphs[0].id)), 80).frames[0];
    const b = paintCritterSheet('frog', critterColours(getMorph(frog, frog.morphs[1].id)), 80).frames[0];
    expect(a).not.toEqual(b);
  });

  it('relief relights a surface without changing its silhouette', () => {
    const w = 40;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 5; y < 25; y++) for (let x = 5; x < 35; x++) data.set([120, 110, 100, 255], (y * w + x) * 4);
    const before = opaque(data);
    relief({ w, h, data }, 0.5, 3, 2);
    expect(Math.abs(opaque(data) - before)).toBeLessThan(120);
    expect(data[(15 * w + 20) * 4 + 3]).toBe(255);
  });
});
