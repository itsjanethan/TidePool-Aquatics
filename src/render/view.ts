/**
 * Shared facts about the canvas for scenes and world labels.
 *
 * The canvas backing store is `k` canvas pixels per CSS pixel (device pixel
 * ratio, capped). Scenes size their cameras from `scene.scale` (canvas px).
 * World labels are HTML positioned in CSS px over the canvas, so the active
 * world scene publishes how its camera maps world coordinates to the screen.
 */
export const view = {
  /** Canvas pixels per CSS pixel. */
  k: 1,
};

/** Maps world coordinates to CSS px over the canvas: css = world * s + o. */
export const labelTransform = { s: 2, ox: 0, oy: 0 };

export function setLabelTransform(s: number, ox: number, oy: number): void {
  labelTransform.s = s;
  labelTransform.ox = ox;
  labelTransform.oy = oy;
}

/** Positions a world label at world coordinates (it tracks the camera). */
export function setLabelPos(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${Math.round(x * labelTransform.s + labelTransform.ox)}px`;
  el.style.top = `${Math.round(y * labelTransform.s + labelTransform.oy)}px`;
}

/**
 * Zoom (canvas px per world px) that shows a whole w x h area inside a
 * cw x ch canvas. Snaps down to a whole number when that costs little, so
 * pixel art stays crisp.
 */
export function containZoom(w: number, h: number, cw: number, ch: number): number {
  const z = Math.min(cw / w, ch / h);
  return z >= 2 && z - Math.floor(z) < 0.25 ? Math.floor(z) : z;
}

/**
 * Store camera zoom. `near` aims for `targetCss` CSS px per world pixel
 * (closer than the whole floor on small screens) unless the whole floor
 * already fits at that size; `overview` always shows the whole floor.
 */
export function shopZoom(mode: 'near' | 'overview', worldW: number, worldH: number, cw: number, ch: number, k: number, targetCss: number): number {
  const fit = containZoom(worldW, worldH, cw, ch);
  if (mode === 'overview') return fit;
  const near = targetCss * k;
  if (fit >= near) return fit;
  const snapped = near >= 2 ? Math.round(near) : near;
  return Math.max(fit, snapped);
}

/**
 * Camera centre along one axis: follows `target` but never shows past the
 * world edges; centres the world when it is smaller than the view.
 */
export function clampCentre(target: number, worldSize: number, viewSize: number): number {
  if (viewSize >= worldSize) return worldSize / 2;
  return Math.min(worldSize - viewSize / 2, Math.max(viewSize / 2, target));
}
