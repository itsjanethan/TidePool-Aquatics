/**
 * On-screen controls for touch devices: a d-pad zone plus A, B, menu and feed.
 *
 * Each finger is tracked by pointerId with pointer capture, so a thumb that
 * drifts slightly off a button keeps holding it, and several fingers work at
 * once (hold a direction and B to run). Every release path clears the hold:
 * pointerup, pointercancel (gesture taken over by the browser),
 * lostpointercapture, and InputManager's `cleared` event (blur, tab hidden,
 * page hidden).
 */
import type { Action, InputManager } from '../input/input';
import { h } from './dom';

type Dir = 'up' | 'down' | 'left' | 'right';

/** What the buttons mean right now; labels follow it. */
export interface TouchContext {
  /** True while walking in the store (B runs); false in menus and the tank view (B is Back). */
  walking: boolean;
}

export interface TouchControls {
  root: HTMLElement;
  setContext(ctx: TouchContext): void;
  /** Releases every finger (also triggered by InputManager `cleared`). */
  releaseAll(): void;
}

/** Direction from an offset to the d-pad centre, or null inside the dead zone. */
export function padDirection(dx: number, dy: number, dead: number): Dir | null {
  if (Math.hypot(dx, dy) < dead) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

export function shouldInstallTouch(): boolean {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('touch');
  return coarse || forced;
}

export function installTouchControls(input: InputManager, force = false): TouchControls | null {
  if (!force && !shouldInstallTouch()) return null;

  // pointerId -> what that finger holds.
  const fingers = new Map<number, { kind: 'pad'; dir: Dir | null } | { kind: 'btn'; action: Action; el: HTMLElement }>();
  const dirEls = new Map<Dir, HTMLElement>();

  const noMenu = (e: Event) => e.preventDefault();
  const capture = (el: HTMLElement, id: number) => {
    try {
      el.setPointerCapture(id);
    } catch {
      /* pointer already gone */
    }
  };

  // --- d-pad: one zone, direction from the finger's offset to its centre.
  const padBtn = (d: Dir, label: string) => {
    const el = h('div', { class: `touch-btn tp-${d}`, 'aria-hidden': 'true' }, label);
    dirEls.set(d, el);
    return el;
  };
  const pad = h('div', { class: 'touch-pad', role: 'group', 'aria-label': 'Direction pad' },
    padBtn('up', '▲'), padBtn('left', '◀'), padBtn('right', '▶'), padBtn('down', '▼'));

  const padHeldDirs = () => new Set([...fingers.values()].flatMap((f) => (f.kind === 'pad' && f.dir ? [f.dir] : [])));
  const setPadDir = (id: number, dir: Dir | null) => {
    const f = fingers.get(id);
    if (!f || f.kind !== 'pad' || f.dir === dir) return;
    const old = f.dir;
    f.dir = dir;
    const still = padHeldDirs();
    if (old && !still.has(old)) {
      input.setVirtual(old, false);
      dirEls.get(old)?.classList.remove('down');
    }
    if (dir) {
      input.setVirtual(dir, true);
      dirEls.get(dir)?.classList.add('down');
    }
  };
  const padDirAt = (e: PointerEvent): Dir | null => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return padDirection(e.clientX - cx, e.clientY - cy, Math.min(r.width, r.height) * 0.12);
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    capture(pad, e.pointerId);
    fingers.set(e.pointerId, { kind: 'pad', dir: null });
    setPadDir(e.pointerId, padDirAt(e));
  });
  pad.addEventListener('pointermove', (e) => {
    if (fingers.get(e.pointerId)?.kind !== 'pad') return;
    e.preventDefault();
    setPadDir(e.pointerId, padDirAt(e));
  });

  // --- action buttons.
  const btnEls = new Map<Action, HTMLElement>();
  const btn = (label: string, action: Action, cls: string) => {
    const b = h('button', { class: `touch-btn ${cls}`, 'aria-label': action, type: 'button' },
      h('span', { class: 'tb-key' }, label), h('span', { class: 'tb-sub' }));
    btnEls.set(action, b);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(b, e.pointerId);
      fingers.set(e.pointerId, { kind: 'btn', action, el: b });
      input.setVirtual(action, true);
      b.classList.add('down');
    });
    b.addEventListener('contextmenu', noMenu);
    return b;
  };
  const actions = h('div', { class: 'touch-actions' },
    btn('B', 'back', 'ta-b'), btn('A', 'confirm', 'ta-a'), btn('☰', 'menu', 'ta-menu'), btn('F', 'feed', 'ta-feed'));

  const release = (id: number) => {
    const f = fingers.get(id);
    if (!f) return;
    if (f.kind === 'pad') setPadDir(id, null);
    fingers.delete(id);
    if (f.kind === 'btn' && ![...fingers.values()].some((o) => o.kind === 'btn' && o.action === f.action)) {
      input.setVirtual(f.action, false);
      f.el.classList.remove('down');
    }
  };
  const releaseAll = () => {
    for (const id of [...fingers.keys()]) release(id);
    for (const el of [...dirEls.values(), ...btnEls.values()]) el.classList.remove('down');
  };
  const onEnd = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return;
    e.preventDefault();
    release(e.pointerId);
  };
  for (const el of [pad, actions]) {
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('lostpointercapture', onEnd);
    el.addEventListener('contextmenu', noMenu);
  }
  // A finger lifted somewhere capture did not reach (capture refused) still releases.
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  input.events.on('cleared', releaseAll);

  const root = h('div', { class: 'touch-controls' }, pad, actions);
  document.body.append(root);

  let last = '';
  const setContext = (ctx: TouchContext) => {
    const key = ctx.walking ? 'w' : 'm';
    if (key === last) return;
    last = key;
    const sub = (a: Action, text: string) => {
      const s = btnEls.get(a)?.querySelector('.tb-sub');
      if (s) s.textContent = text;
    };
    sub('back', ctx.walking ? 'Run' : 'Back');
    sub('confirm', ctx.walking ? 'Use' : 'OK');
    btnEls.get('back')?.setAttribute('aria-label', ctx.walking ? 'B: hold to run' : 'B: back');
    btnEls.get('confirm')?.setAttribute('aria-label', ctx.walking ? 'A: use' : 'A: confirm');
    root.classList.toggle('walking', ctx.walking);
  };
  setContext({ walking: false });
  return { root, setContext, releaseAll };
}
