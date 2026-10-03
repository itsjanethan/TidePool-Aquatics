/**
 * Applies the responsive layout to the page: positions the game rectangle,
 * sizes the canvas backing store, sets the UI unit and body classes, and
 * places the touch controls. Re-runs on resize, rotation, visual viewport
 * changes (browser bars), preference changes and controls-mode changes.
 */
import type Phaser from 'phaser';
import { getPrefs, onPrefsChange } from './displayPrefs';
import { backingScale, computeLayout, readSafeInsets, uiUnit, type ControlsMode, type Layout } from './viewport';
import { view } from '../render/view';

export class LayoutManager {
  layout: Layout | null = null;
  private controls: ControlsMode;
  private queued = false;
  private listeners = new Set<(l: Layout) => void>();
  private lastSize = '';

  constructor(
    private stage: HTMLElement,
    private game: Phaser.Game | null,
    private touch: boolean,
  ) {
    this.controls = touch ? 'full' : 'none';
    const queue = () => this.queue();
    window.addEventListener('resize', queue);
    window.addEventListener('orientationchange', queue);
    window.visualViewport?.addEventListener('resize', queue);
    // Re-apply once the on-screen keyboard closes (resizes are held while typing).
    document.addEventListener('focusout', () => setTimeout(queue, 50));
    onPrefsChange(queue);
  }

  setGame(game: Phaser.Game): void {
    this.game = game;
    this.apply();
  }

  /** Tank view on touch devices goes immersive ('minimal'); elsewhere full controls. */
  setControls(mode: ControlsMode): void {
    if (!this.touch) mode = 'none';
    if (mode === this.controls) return;
    this.controls = mode;
    this.apply();
  }

  get controlsMode(): ControlsMode {
    return this.controls;
  }

  onChange(fn: (l: Layout) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private queue(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.apply();
    });
  }

  /** True while a text field has focus on a touch device (the keyboard is up). */
  private typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return this.touch && !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  apply(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // The on-screen keyboard shrinks the viewport: keep the layout steady while typing.
    if (this.typing() && this.layout && this.layout.vw === vw) return;
    const prefs = getPrefs();
    const l = computeLayout(vw, vh, readSafeInsets(), this.controls);
    this.layout = l;
    const g = l.game;
    Object.assign(this.stage.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    const root = document.documentElement;
    root.style.setProperty('--px', `${uiUnit(g, l.compact, prefs)}px`);
    root.style.setProperty('--stage-w', `${g.w}px`);
    root.style.setProperty('--stage-h', `${g.h}px`);
    const body = document.body.classList;
    body.toggle('has-touch', this.touch);
    body.toggle('portrait', l.orientation === 'portrait');
    body.toggle('landscape', l.orientation === 'landscape');
    body.toggle('compact', l.compact);
    body.toggle('font-readable', prefs.font === 'readable');
    for (const m of ['full', 'minimal', 'none'] as const) body.toggle(`controls-${m}`, l.controls === m);
    for (const p of ['below', 'sides', 'overlay'] as const) body.toggle(`place-${p}`, l.placement === p);

    if (this.game) {
      const k = backingScale(g.w, g.h, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(g.w * k));
      const bh = Math.max(1, Math.round(g.h * k));
      const key = `${bw}x${bh}`;
      view.k = k;
      if (key !== this.lastSize) {
        this.lastSize = key;
        this.game.scale.resize(bw, bh);
      }
      this.game.scale.refresh();
    }
    for (const fn of this.listeners) fn(l);
  }
}
