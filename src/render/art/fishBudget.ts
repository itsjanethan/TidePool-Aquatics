/**
 * Fish sheet memory budget (pure, testable). Sheets are counted in texels at
 * their detail scale, including the one-texel gap between frames.
 */
import { SHEET_FRAMES } from './fishPainter';

export interface FishTexSize {
  /** Size in tank canvas pixels. */
  width: number;
  height: number;
  bodyLen: number;
  /** Texture texels per tank canvas pixel. */
  detail: number;
}

export function fishTexels(t: FishTexSize): number {
  return Math.round(t.width * t.detail + 1) * SHEET_FRAMES * Math.round(t.height * t.detail);
}

/** About 64 MB of RGBA at most; a sheet not drawn for 2 s may go when over budget. */
export const MAX_TEXELS = 16_000_000;
