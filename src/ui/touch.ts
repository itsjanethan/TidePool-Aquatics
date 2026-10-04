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
import { guardControls } from './tapGuard';
import type { Layout } from './viewport';

type Dir = 'up' | 'down' | 'left' | 'right';

/** What the buttons mean right now; labels follow it. */
export interface TouchContext {
  /** True while walking in the store (B runs); false in menus and the tank view (B is Back). */
  walking: boolean;
  /** Short verb for A while walking ("Talk", "Serve", "Open"); defaults to "Use". */
  a?: string;
  /** Whether F (feed) does something right now. */
  feed?: boolean;
  /** A menu is open over an immersive view (minimal controls show B). */
  menuOpen?: boolean;
}

export interface TouchControls {
  root: HTMLElement;
  setContext(ctx: TouchContext): void;
  /** Positions the controls in the areas the layout reserved for them. */
  place(layout: Layout): void;
  /** Releases every finger (also triggered by InputManager `cleared`). */
  releaseAll(): void;
}

/** Button sizes (CSS px). Every target is at least 44 x 44. */
const SIZE = { A: 70, B: 64, F: 52, MENU: 50 };
/** Button centres inside a 184 x 184 cluster (scaled down to fit narrow columns). */
const CLUSTER = 184;
const POS: Record<'A' | 'B' | 'F' | 'MENU', [number, number]> = { A: [140, 72], B: [62, 128], F: [52, 40], MENU: [146, 152] };
const PAD = 168;

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
  // No double-tap zoom, pinch, callout or ghost clicks from the controls.
  guardControls(root);
  document.body.append(root);

  let last = '';
  const setContext = (ctx: TouchContext) => {
    const aText = ctx.walking ? ctx.a ?? 'Use' : 'OK';
    const key = `${ctx.walking}|${aText}|${!!ctx.feed}|${!!ctx.menuOpen}`;
    if (key === last) return;
    last = key;
    const sub = (a: Action, text: string) => {
      const s = btnEls.get(a)?.querySelector('.tb-sub');
      if (s) s.textContent = text;
    };
    sub('back', ctx.walking ? 'Run' : 'Back');
    sub('confirm', aText);
    sub('feed', 'Feed');
    btnEls.get('back')?.setAttribute('aria-label', ctx.walking ? 'B: hold to run' : 'B: back');
    btnEls.get('confirm')?.setAttribute('aria-label', `A: ${aText.toLowerCase()}`);
    root.classList.toggle('walking', ctx.walking);
    root.classList.toggle('menu-open', !!ctx.menuOpen);
    btnEls.get('feed')?.classList.toggle('idle', !ctx.feed);
  };
  setContext({ walking: false });

  const place = (l: Layout) => {
    root.dataset.mode = l.controls;
    root.dataset.placement = l.placement;
    if (l.controls === 'none') {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    const box = (el: HTMLElement, x: number, y: number, w: number, hgt: number) =>
      Object.assign(el.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: `${Math.round(w)}px`, height: `${Math.round(hgt)}px` });
    if (l.controls === 'minimal' || !l.pad || !l.buttons) {
      // Immersive view: only B, for leaving menus opened over the view.
      const b = btnEls.get('back')!;
      // Left edge, halfway down: clear of menus and sheets, which sit right or below.
      box(actions, 4, Math.round(l.vh * 0.42 - 32), 76, 76);
      box(b, 6, 6, SIZE.B, SIZE.B);
      return;
    }
    const p = l.pad;
    const r = l.buttons;
    // D-pad: as large as the area allows (up to PAD), low in the area where the thumb rests.
    const pd = Math.min(PAD, p.w - 16, p.h - 16);
    const padX = l.placement === 'sides' ? p.x + (p.w - pd) / 2 : p.x + Math.max(8, Math.min(28, (p.w - pd) / 2));
    const padY = l.placement === 'sides' ? p.y + p.h - pd - Math.max(16, p.h * 0.12) : p.y + (p.h - pd) / 2;
    box(pad, padX, padY, pd, pd);
    // Buttons: a cluster scaled to fit, mirrored low on the other side.
    const sc = Math.min(1, (r.w - 8) / CLUSTER, (r.h - 8) / CLUSTER);
    const cw = CLUSTER * sc;
    const cx = l.placement === 'sides' ? r.x + (r.w - cw) / 2 : r.x + r.w - cw - Math.max(8, Math.min(24, (r.w - cw) / 2));
    const cy = l.placement === 'sides' ? r.y + r.h - cw - Math.max(16, r.h * 0.12) : r.y + (r.h - cw) / 2;
    box(actions, cx, cy, cw, cw);
    const put = (a: Action, k: keyof typeof POS) => {
      const size = SIZE[k];
      const [x, y] = POS[k];
      box(btnEls.get(a)!, x * sc - size / 2, y * sc - size / 2, size, size);
    };
    put('confirm', 'A');
    put('back', 'B');
    put('feed', 'F');
    put('menu', 'MENU');
  };
  return { root, setContext, place, releaseAll };
}
