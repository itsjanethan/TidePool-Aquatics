/**
 * Responsive layout. Works out where the game goes on the screen, where the
 * touch controls go, how large the HTML UI is and how many backing pixels the
 * canvas gets. The game always fills its rectangle (no letterboxing into a
 * fixed 3:2 box); each scene's camera decides what it shows inside it.
 *
 * Pure parts (`computeLayout`, `uiUnit`, `backingScale`) are unit tested; the
 * DOM part (`applyLayout`) only applies them.
 */
import { TEXT_SCALE, type DisplayPrefs } from './displayPrefs';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 'full': d-pad and buttons. 'minimal': immersive views (tank view) keep only a small Back button. 'none': no touch controls. */
export type ControlsMode = 'full' | 'minimal' | 'none';

export interface Layout {
  vw: number;
  vh: number;
  orientation: 'portrait' | 'landscape';
  controls: ControlsMode;
  /** Where touch controls sit relative to the game. */
  placement: 'below' | 'sides' | 'overlay';
  /** The game canvas and HTML UI rectangle, in CSS px. */
  game: Rect;
  /** Areas reserved for the touch controls (CSS px). */
  pad: Rect | null;
  buttons: Rect | null;
  /** Narrow or short game rectangle: menus become sheets, HUD compacts. */
  compact: boolean;
}

/** Smallest game rectangle side worth reserving controls for (below this, controls overlay). */
const MIN_GAME = 220;

export function computeLayout(vw: number, vh: number, safe: Insets, controls: ControlsMode): Layout {
  const orientation = vh > vw ? 'portrait' : 'landscape';
  const inner: Rect = { x: safe.left, y: safe.top, w: Math.max(0, vw - safe.left - safe.right), h: Math.max(0, vh - safe.top - safe.bottom) };
  let game = inner;
  let pad: Rect | null = null;
  let buttons: Rect | null = null;
  let placement: Layout['placement'] = 'overlay';
  if (controls === 'full') {
    if (orientation === 'portrait') {
      // Controls in a band below the game, thumbs at the bottom of the phone.
      const band = Math.round(Math.min(240, Math.max(184, vh * 0.27)));
      if (inner.h - band >= MIN_GAME) {
        placement = 'below';
        game = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - band };
        const top = inner.y + game.h;
        pad = { x: inner.x, y: top, w: Math.floor(inner.w / 2), h: band };
        buttons = { x: inner.x + Math.floor(inner.w / 2), y: top, w: inner.w - Math.floor(inner.w / 2), h: band };
      }
    } else {
      // Controls in columns either side, where the thumbs rest in landscape.
      const col = Math.round(Math.min(200, Math.max(152, vw * 0.19)));
      if (inner.w - 2 * col >= MIN_GAME) {
        placement = 'sides';
        game = { x: inner.x + col, y: inner.y, w: inner.w - 2 * col, h: inner.h };
        pad = { x: inner.x, y: inner.y, w: col, h: inner.h };
        buttons = { x: inner.x + col + game.w, y: inner.y, w: col, h: inner.h };
      }
    }
    if (placement === 'overlay') {
      pad = { x: inner.x, y: inner.y + inner.h - 180, w: 180, h: 180 };
      buttons = { x: inner.x + inner.w - 180, y: inner.y + inner.h - 180, w: 180, h: 180 };
    }
  }
  const compact = game.w < 640 || game.h < 420;
  return { vw, vh, orientation, controls, placement, game, pad, buttons, compact };
}

/**
 * CSS px per UI unit (`--px`). The HTML UI is authored in units of a 480x320
 * screen. On large screens the UI grows with the window as before; it never
 * drops below the size where body text is 18 px (so small text is 16 px), and
 * the text-size preference scales it.
 */
export function uiUnit(game: Rect, compact: boolean, prefs: Pick<DisplayPrefs, 'textSize'>): number {
  const fit = Math.min(game.w / 480, game.h / 320);
  const base = compact ? 2 : Math.max(2, fit >= 2 && fit - Math.floor(fit) < 0.25 ? Math.floor(fit) : fit);
  return Math.round(base * TEXT_SCALE[prefs.textSize] * 100) / 100;
}

/** Most backing pixels the canvas gets (keeps big desktop windows and 3x phones fast). */
export const MAX_BACKING_PIXELS = 1_600_000;

/** Canvas pixels per CSS px: device pixel ratio capped at 2 and by MAX_BACKING_PIXELS. */
export function backingScale(w: number, h: number, dpr: number): number {
  const area = Math.max(1, w * h);
  const k = Math.min(Math.max(1, dpr), 2, Math.sqrt(MAX_BACKING_PIXELS / area));
  return Math.max(0.5, Math.round(k * 100) / 100);
}

/** Reads the CSS safe-area insets (notches, home indicator) through a probe element. */
export function readSafeInsets(): Insets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  let probe = document.getElementById('safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const n = (v: string) => parseFloat(v) || 0;
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}
