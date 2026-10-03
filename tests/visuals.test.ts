// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { AdaptiveQuality, effectiveQuality, qualityLabel, qualitySettings, resetQualityForTests, setQuality } from '../src/render/quality';
import { cachedTextures, useTexture } from '../src/render/textureCache';
import { getPrefs, reducedMotion, resetPrefsCache, setPrefs } from '../src/ui/displayPrefs';
import { hardscapeTint, mulmAlpha, pearlRate, stepLightLevel, surfaceFilm } from '../src/render/stateVisuals';

describe('Quality levels', () => {
  it('lower levels never add work; fish detail is not a quality knob', () => {
    const [low, std, high] = (['low', 'standard', 'high'] as const).map((q) => qualitySettings(q));
    expect(low.specks).toBeLessThan(std.specks);
    expect(std.specks).toBeLessThan(high.specks);
    expect(low.pearls).toBe(0);
    expect(std.pearls).toBeLessThan(high.pearls);
    expect(low.reflections).toBe(0);
    expect(std.reflections).toBe(0);
    expect(high.reflections).toBeGreaterThan(0);
    expect(low.plantEvery).toBeGreaterThan(std.plantEvery);
    expect(high.plantEvery).toBe(1);
    expect(low.caustics || low.fishShadows).toBe(false);
  });
});

describe('Adaptive quality (Auto)', () => {
  beforeEach(() => resetQualityForTests('auto'));

  const run = (aq: AdaptiveQuality, ms: number, seconds: number) => {
    let stepped = null;
    for (let t = 0; t < seconds * 1000; t += ms) stepped = aq.sample(ms) ?? stepped;
    return stepped;
  };

  it('ignores the first seconds (texture painting) and fast frames', () => {
    const aq = new AdaptiveQuality();
    expect(run(aq, 80, 2)).toBeNull();
    expect(run(aq, 16, 10)).toBeNull();
    expect(effectiveQuality()).toBe('standard');
  });

  it('steps down one level after a sustained slow window, then to low, never up', () => {
    const aq = new AdaptiveQuality();
    run(aq, 16, 3);
    expect(run(aq, 50, 3.5)).toBe('low');
    expect(effectiveQuality()).toBe('low');
    expect(run(aq, 10, 20)).toBeNull();
    expect(effectiveQuality()).toBe('low');
    expect(qualityLabel()).toBe('Auto (Low)');
  });

  it('a short hitch does not step down', () => {
    const aq = new AdaptiveQuality();
    run(aq, 16, 3);
    for (let i = 0; i < 10; i++) aq.sample(120);
    expect(run(aq, 16, 3)).toBeNull();
    expect(effectiveQuality()).toBe('standard');
  });

  it('only applies in Auto; choosing a level resets it', () => {
    setQuality('high');
    const aq = new AdaptiveQuality();
    expect(run(aq, 60, 10)).toBeNull();
    expect(effectiveQuality()).toBe('high');
    setQuality('auto');
    expect(effectiveQuality()).toBe('standard');
  });
});

describe('Bounded texture caches', () => {
  it('keeps the most recent textures per group and never removes the one in use', () => {
    const live = new Set<string>();
    const scene = { textures: { exists: (k: string) => live.has(k), remove: (k: string) => live.delete(k) } } as never;
    for (let i = 0; i < 10; i++) {
      live.add(`sub${i}`);
      useTexture(scene, 'test-sub', `sub${i}`, 4);
    }
    expect(cachedTextures('test-sub')).toEqual(['sub6', 'sub7', 'sub8', 'sub9']);
    expect([...live].sort()).toEqual(['sub6', 'sub7', 'sub8', 'sub9']);
    // Re-using an old one moves it to the front of the queue.
    useTexture(scene, 'test-sub', 'sub6', 4);
    live.add('sub10');
    useTexture(scene, 'test-sub', 'sub10', 4, ['sub7']);
    expect(live.has('sub6')).toBe(true);
    expect(live.has('sub7')).toBe(true);
    expect(live.has('sub8')).toBe(false);
  });
});

describe('Reduced motion', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });

  it('follows the setting, or the device when set to follow it', () => {
    expect(getPrefs().motion).toBe('system');
    setPrefs({ motion: 'reduced' });
    expect(reducedMotion()).toBe(true);
    setPrefs({ motion: 'full' });
    expect(reducedMotion()).toBe(false);
    setPrefs({ motion: 'system' });
    const fake = (matches: boolean) => (() => ({ matches })) as unknown as typeof matchMedia;
    const orig = globalThis.matchMedia;
    globalThis.matchMedia = fake(true);
    expect(reducedMotion()).toBe(true);
    globalThis.matchMedia = fake(false);
    expect(reducedMotion()).toBe(false);
    globalThis.matchMedia = orig;
  });
});

describe('Effects follow the tank state', () => {
  it('mulm grows with detritus and clears after a clean', () => {
    expect(mulmAlpha(0)).toBe(0);
    expect(mulmAlpha(3)).toBeGreaterThan(mulmAlpha(1));
    expect(mulmAlpha(100)).toBeLessThanOrEqual(0.85);
  });

  it('surface film needs both dirt and a still surface', () => {
    expect(surfaceFilm(8, 0.3)).toBeGreaterThan(0.5);
    expect(surfaceFilm(8, 1.2)).toBe(0); // air stone / strong filter breaks it up
    expect(surfaceFilm(0.5, 0.3)).toBe(0); // clean water
  });

  it('only healthy, lit, fed plants pearl', () => {
    expect(pearlRate(1, 20, 1, 1, 1)).toBeGreaterThan(0);
    expect(pearlRate(0.5, 20, 1, 1, 1)).toBe(0); // struggling plant
    expect(pearlRate(1, 20, 1, 1, 0.5)).toBe(0); // lights going down
    expect(pearlRate(1, 20, 0, 1, 1)).toBe(0); // fully shaded
    expect(pearlRate(1, 0, 1, 1, 1)).toBeLessThan(pearlRate(1, 20, 1, 1, 1)); // no nitrate to grow on
  });

  it('hardscape darkens in shade and greens with algae', () => {
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const clean = rgb(hardscapeTint(1, 1, 0, 1));
    const shaded = rgb(hardscapeTint(1, 0.1, 0, 1));
    const algae = rgb(hardscapeTint(1, 1, 1, 1));
    expect(clean).toEqual([255, 255, 255]);
    expect(shaded[0]).toBeLessThan(clean[0]);
    expect(algae[1] - algae[0]).toBeGreaterThan(0);
    expect(rgb(hardscapeTint(0, 1, 0, 1))[2]).toBeGreaterThan(rgb(hardscapeTint(0, 1, 0, 1))[0]); // back layer is cooler
  });

  it('lights ramp instead of snapping', () => {
    let l = 0;
    l = stepLightLevel(l, true, 0.3);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
    for (let i = 0; i < 10; i++) l = stepLightLevel(l, true, 0.3);
    expect(l).toBe(1);
  });
});
