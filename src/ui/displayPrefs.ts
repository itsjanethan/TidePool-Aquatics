/**
 * Per-device display preferences: text size, font, store camera, tap to move.
 * These are about the screen in front of the player, not the shop, so they
 * live in localStorage (never in the save) and survive new games. Storage can
 * be blocked or empty; defaults are always valid.
 */

export const TEXT_SIZES = ['small', 'normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, normal: 1, large: 1.15, larger: 1.3 };

export type UiFont = 'pixel' | 'readable';
/** 'near' follows the player; 'overview' shows the whole floor. */
export type CameraMode = 'near' | 'overview';
export const MOTION_MODES = ['system', 'reduced', 'full'] as const;
/** 'system' follows prefers-reduced-motion. */
export type MotionMode = (typeof MOTION_MODES)[number];

export interface DisplayPrefs {
  textSize: TextSize;
  font: UiFont;
  camera: CameraMode;
  tapToMove: boolean;
  motion: MotionMode;
}

export const DEFAULT_PREFS: DisplayPrefs = { textSize: 'normal', font: 'pixel', camera: 'near', tapToMove: true, motion: 'system' };
const KEY = 'tidepool.display';

let prefs: DisplayPrefs | null = null;
const listeners = new Set<(p: DisplayPrefs) => void>();

/** Accepts anything and returns valid prefs (bad or missing fields fall back to defaults). */
export function sanitizePrefs(raw: unknown): DisplayPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DisplayPrefs, unknown>>;
  return {
    textSize: TEXT_SIZES.includes(r.textSize as TextSize) ? (r.textSize as TextSize) : DEFAULT_PREFS.textSize,
    font: r.font === 'readable' ? 'readable' : 'pixel',
    camera: r.camera === 'overview' ? 'overview' : 'near',
    tapToMove: typeof r.tapToMove === 'boolean' ? r.tapToMove : DEFAULT_PREFS.tapToMove,
    motion: MOTION_MODES.includes(r.motion as MotionMode) ? (r.motion as MotionMode) : 'system',
  };
}

export function getPrefs(): DisplayPrefs {
  if (!prefs) {
    let raw: unknown = null;
    try {
      const txt = globalThis.localStorage?.getItem(KEY);
      raw = txt ? JSON.parse(txt) : null;
    } catch {
      raw = null;
    }
    prefs = sanitizePrefs(raw);
  }
  return prefs;
}

export function setPrefs(change: Partial<DisplayPrefs>): DisplayPrefs {
  prefs = sanitizePrefs({ ...getPrefs(), ...change });
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: the change still applies for this session */
  }
  for (const fn of listeners) fn(prefs);
  return prefs;
}

export function onPrefsChange(fn: (p: DisplayPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when motion should be calm: the setting says so, or it follows a device that asks for reduced motion. */
export function reducedMotion(p: DisplayPrefs = getPrefs()): boolean {
  if (p.motion === 'reduced') return true;
  if (p.motion === 'full') return false;
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Tests only. */
export function resetPrefsCache(): void {
  prefs = null;
}

export function cycle<T>(list: readonly T[], value: T, dir: number): T {
  const i = list.indexOf(value);
  return list[(i + dir + list.length) % list.length];
}
