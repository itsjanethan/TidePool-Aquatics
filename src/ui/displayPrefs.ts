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

export interface DisplayPrefs {
  textSize: TextSize;
  font: UiFont;
  camera: CameraMode;
  tapToMove: boolean;
}

export const DEFAULT_PREFS: DisplayPrefs = { textSize: 'normal', font: 'pixel', camera: 'near', tapToMove: true };
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

/** Tests only. */
export function resetPrefsCache(): void {
  prefs = null;
}

export function cycle<T>(list: readonly T[], value: T, dir: number): T {
  const i = list.indexOf(value);
  return list[(i + dir + list.length) % list.length];
}
