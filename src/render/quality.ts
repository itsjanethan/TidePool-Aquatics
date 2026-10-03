/**
 * Visual quality setting for the tank view (per browser). Lower settings
 * thin out particles, skip caustics and fish shadows and animate plants at a
 * lower rate. Fish detail and morph visibility are never reduced.
 */
export type Quality = 'low' | 'standard' | 'high';
const KEY = 'tidepool:quality';
let current: Quality = read();

function read(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'standard' || v === 'high') return v;
  } catch {
    /* storage unavailable */
  }
  return 'standard';
}

export function getQuality(): Quality {
  return current;
}

export function setQuality(q: Quality): void {
  current = q;
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage unavailable */
  }
}

export const QUALITY_LEVELS: Quality[] = ['low', 'standard', 'high'];

export function qualitySettings(q: Quality = current) {
  return {
    specks: q === 'low' ? 24 : q === 'standard' ? 70 : 120,
    caustics: q !== 'low',
    fishShadows: q !== 'low',
    /** Redraw plants every N frames. */
    plantEvery: q === 'low' ? 2 : 1,
    rootDetail: q === 'high' ? 1 : q === 'standard' ? 0.7 : 0.4,
    lightCells: q === 'high' ? 64 : 48,
  };
}
