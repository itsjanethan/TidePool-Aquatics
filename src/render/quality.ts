/**
 * Visual quality for the tank view (per browser). Lower settings thin out
 * particles, skip caustics, fish shadows, pearling and reflections, and
 * redraw plants less often. Fish detail and morph visibility are never
 * reduced.
 *
 * 'auto' (the default) starts at Standard and steps down, never up, while a
 * tank view runs slowly (see AdaptiveQuality). The step-down lasts for the
 * session and resets when the setting is changed.
 */
export type Quality = 'low' | 'standard' | 'high';
export type QualitySetting = Quality | 'auto';
const KEY = 'tidepool:quality';
let current: QualitySetting = read();
/** Level auto mode has settled on this session. */
let autoLevel: Quality = 'standard';

function read(): QualitySetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'standard' || v === 'high' || v === 'auto') return v;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

/** The stored setting (may be 'auto'). */
export function getQuality(): QualitySetting {
  return current;
}

/** The level actually in use. */
export function effectiveQuality(): Quality {
  return current === 'auto' ? autoLevel : current;
}

export function setQuality(q: QualitySetting): void {
  current = q;
  autoLevel = 'standard';
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage unavailable */
  }
}

export const QUALITY_LEVELS: QualitySetting[] = ['auto', 'low', 'standard', 'high'];

export function qualityLabel(q: QualitySetting = current): string {
  if (q === 'auto') return `Auto (${autoLevel[0].toUpperCase()}${autoLevel.slice(1)})`;
  return q[0].toUpperCase() + q.slice(1);
}

export interface QualitySettings {
  level: Quality;
  specks: number;
  caustics: boolean;
  fishShadows: boolean;
  /** Redraw plants every N frames (sway is slow; 30 Hz looks the same). */
  plantEvery: number;
  rootDetail: number;
  lightCells: number;
  /** Most oxygen pearls from plants on screen at once (0 = off). */
  pearls: number;
  /** Most fish mirrored on the underside of the surface (0 = off). */
  reflections: number;
  /**
   * Water optics pass (caustics on surfaces, light shafts, depth absorption,
   * surface mirror, glass, humid haze). WebGL only; off at Low.
   */
  optics: boolean;
  /** Edge smoothing inside the optics pass. */
  smoothEdges: boolean;
  /**
   * Most texture pixels per tank-canvas pixel for painted art (fish, rock,
   * substrate, walls). The actual detail also follows the camera zoom, so a
   * phone that shows the tank smaller never pays for detail it cannot show.
   */
  maxDetail: number;
}

export function qualitySettings(q: Quality = effectiveQuality()): QualitySettings {
  return {
    level: q,
    specks: q === 'low' ? 24 : q === 'standard' ? 70 : 120,
    caustics: q !== 'low',
    fishShadows: q !== 'low',
    plantEvery: q === 'low' ? 3 : q === 'standard' ? 2 : 1,
    rootDetail: q === 'high' ? 1 : q === 'standard' ? 0.7 : 0.4,
    lightCells: q === 'high' ? 64 : 48,
    pearls: q === 'low' ? 0 : q === 'standard' ? 18 : 40,
    reflections: q === 'high' ? 10 : 0,
    optics: q !== 'low',
    smoothEdges: q !== 'low',
    maxDetail: q === 'high' ? 2 : q === 'standard' ? 1.5 : 1,
  };
}

/**
 * Texture detail for the tank view: as many texture pixels per tank-canvas
 * pixel as the camera shows (rounded up to a half step), capped by quality.
 * At zoom 1 or below (960x640 windows, phones) this is 1.
 */
export function detailScale(zoom: number, maxDetail: number): number {
  const want = Math.ceil(Math.max(1, zoom) * 2 - 0.15) / 2;
  return Math.max(1, Math.min(maxDetail, want));
}

/**
 * Careful adaptive quality for 'auto'. Feeds on frame times; after a sustained
 * slow window (median frame over SLOW_MS for WINDOW_S seconds, ignoring the
 * first seconds after a view opens, when textures are painted) it steps down
 * one level. Never steps up on its own, at most once per WINDOW_S, and only
 * while the setting is 'auto'.
 */
export class AdaptiveQuality {
  static readonly SLOW_MS = 34;
  static readonly WINDOW_S = 3;
  static readonly GRACE_S = 2.5;
  private samples: number[] = [];
  private elapsed = 0;
  private sinceStep = 0;

  /** Returns the new level when it stepped down this frame, else null. */
  sample(dtMs: number): Quality | null {
    if (current !== 'auto') return null;
    this.elapsed += dtMs / 1000;
    this.sinceStep += dtMs / 1000;
    if (this.elapsed < AdaptiveQuality.GRACE_S) return null;
    this.samples.push(dtMs);
    if (this.sinceStep < AdaptiveQuality.WINDOW_S) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples = [];
    this.sinceStep = 0;
    if (median <= AdaptiveQuality.SLOW_MS || autoLevel === 'low') return null;
    autoLevel = autoLevel === 'high' ? 'standard' : 'low';
    return autoLevel;
  }
}

/** Tests only. */
export function resetQualityForTests(q: QualitySetting = 'auto'): void {
  current = q;
  autoLevel = 'standard';
}
