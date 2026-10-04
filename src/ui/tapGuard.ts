/**
 * Stops mobile browsers zooming the page when the game is tapped quickly.
 *
 * Two layers, because browsers differ:
 * - CSS `touch-action` (styles.css): `none` on the on-screen controls,
 *   `manipulation` on buttons and menu rows, `pan-y` on scrolling lists. Per
 *   the spec, double-tap zoom only happens where touch-action is `auto`.
 *   iOS Safari has honoured this inconsistently, so:
 * - Touch event guards (here), over the whole page: a near miss beside a
 *   button lands on the page background, which zoomed just the same. On the on-screen controls every touch event is
 *   cancelled: no double-tap zoom, no pinch, no callout, no scrolling and no
 *   synthetic mouse or click events (pointer events already drive the input,
 *   so a click would only duplicate it). In the rest of the game (the canvas
 *   and the HTML UI) a second tap that follows another within
 *   DOUBLE_TAP_MS is cancelled, which is what stops the double-tap zoom, and
 *   its click is delivered by hand, so rapid taps on a menu row or the HUD
 *   still each count once. Swipes (scrolling a list) and text fields are left
 *   alone, and pinch zoom still works outside the controls.
 */

/** Longer than the double-tap window of mobile browsers (about 300 ms), so no zoom can slip through. */
export const DOUBLE_TAP_MS = 500;
/** A touch that moved further than this (CSS px) was a scroll or drag, not a tap. */
export const TAP_MOVE_TOLERANCE = 10;

const cancel = (e: Event) => {
  if (e.cancelable) e.preventDefault();
};

/** On-screen controls: cancel every touch gesture and any click that slips through. */
export function guardControls(root: HTMLElement): void {
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
    root.addEventListener(type, cancel, { passive: false });
  }
  // Ghost clicks: nothing in the controls listens for click; stop one reaching anything else.
  root.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
}

interface TouchPoint {
  clientX: number;
  clientY: number;
  identifier?: number;
}

function firstChanged(e: TouchEvent): TouchPoint | null {
  const list = (e as unknown as { changedTouches?: ArrayLike<TouchPoint> }).changedTouches;
  return list && list.length ? list[0] : null;
}

/**
 * The game area (canvas and HTML UI): cancel the second of two quick taps so
 * the browser cannot treat them as a double-tap zoom, then deliver that tap's
 * click ourselves. Returns a function that removes the guard.
 */
export function guardFastTaps(scope: HTMLElement, now: () => number = () => performance.now()): () => void {
  let start: { x: number; y: number } | null = null;
  let lastEnd = -Infinity;
  const onStart = (e: TouchEvent) => {
    const t = firstChanged(e);
    start = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onEnd = (e: TouchEvent) => {
    const t = firstChanged(e);
    const time = now();
    const quick = time - lastEnd < DOUBLE_TAP_MS;
    lastEnd = time;
    if (!t || !quick) return;
    // Another finger still down (two-finger gestures) or a swipe: not a tap.
    if ((e.touches?.length ?? 0) > 0) return;
    if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_MOVE_TOLERANCE) return;
    const target = e.target as Element | null;
    if (isTextField(target)) return;
    // Already handled (the on-screen controls cancel their own touches).
    if (!e.cancelable || e.defaultPrevented) return;
    e.preventDefault();
    // Cancelling touchend also cancels this tap's click; deliver it once.
    if (target && target.tagName !== 'CANVAS') {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY, view: window }));
    }
  };
  const onDbl = (e: Event) => {
    if (!isTextField(e.target as Element)) cancel(e);
  };
  scope.addEventListener('touchstart', onStart, { passive: true });
  scope.addEventListener('touchend', onEnd, { passive: false });
  scope.addEventListener('dblclick', onDbl);
  return () => {
    scope.removeEventListener('touchstart', onStart);
    scope.removeEventListener('touchend', onEnd);
    scope.removeEventListener('dblclick', onDbl);
  };
}
