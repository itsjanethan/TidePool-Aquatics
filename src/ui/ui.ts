/**
 * UIManager: a stack of HTML screens over the Phaser canvas. The top screen
 * receives input. Blocking screens pause game time.
 */
import type { Action } from '../input/input';
import { h } from './dom';
import { Menu, type MenuItem } from './menu';

export interface Screen {
  el: HTMLElement;
  /** Pauses game time and world input while open. */
  blocking: boolean;
  handle(a: Action): boolean;
  onOpen?(): void;
  onClose?(): void;
  /** Called every frame while top-most. */
  update?(dt: number): void;
}

export class UIManager {
  readonly root: HTMLElement;
  readonly hudLayer: HTMLElement;
  readonly worldLayer: HTMLElement;
  readonly screenLayer: HTMLElement;
  readonly toastLayer: HTMLElement;
  private stack: Screen[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.worldLayer = h('div', { id: 'world-labels' });
    this.hudLayer = h('div', { id: 'hud' });
    this.screenLayer = h('div', { id: 'screens' });
    this.toastLayer = h('div', { id: 'toasts' });
    root.append(this.worldLayer, this.hudLayer, this.screenLayer, this.toastLayer);
  }

  get depth(): number {
    return this.stack.length;
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  isBlocking(): boolean {
    return this.stack.some((s) => s.blocking);
  }

  push(s: Screen): Screen {
    this.stack.push(s);
    this.screenLayer.appendChild(s.el);
    s.onOpen?.();
    return s;
  }

  pop(): void {
    const s = this.stack.pop();
    if (!s) return;
    s.el.remove();
    s.onClose?.();
  }

  remove(s: Screen): void {
    const i = this.stack.indexOf(s);
    if (i < 0) return;
    this.stack.splice(i, 1);
    s.el.remove();
    s.onClose?.();
  }

  replace(s: Screen): void {
    this.pop();
    this.push(s);
  }

  clear(): void {
    while (this.stack.length) this.pop();
  }

  /** Routes an action to the top screen. Returns true if consumed. */
  handle(a: Action): boolean {
    const t = this.top();
    if (!t) return false;
    return t.handle(a) || t.blocking;
  }

  update(dt: number): void {
    this.top()?.update?.(dt);
  }

  toast(text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info', ms = 3200): void {
    const el = h('div', { class: `toast toast-${kind}` }, text);
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 4) this.toastLayer.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  // -------------------------------------------------------------------------
  // Convenience screens

  /** A panel with a title, optional body and a keyboard menu. */
  menu(opts: MenuScreenOptions): MenuScreen {
    const s = new MenuScreen(this, opts);
    this.push(s);
    return s;
  }

  /** Dialogue box with typewriter text. Resolves when dismissed. */
  say(speaker: string | null, text: string): Promise<void> {
    return new Promise((resolve) => {
      this.push(new DialogueScreen(this, speaker, text, null, () => resolve()));
    });
  }

  /** Dialogue with choices. Resolves with the chosen index, or -1 if cancelled. */
  ask(speaker: string | null, text: string, choices: string[], cancellable = true): Promise<number> {
    return new Promise((resolve) => {
      this.push(new DialogueScreen(this, speaker, text, { choices, cancellable }, (i) => resolve(i ?? -1)));
    });
  }

  confirm(text: string): Promise<boolean> {
    return this.ask(null, text, ['Yes', 'No']).then((i) => i === 0);
  }
}

export interface MenuScreenOptions {
  title: string;
  items: MenuItem[];
  body?: HTMLElement | (() => HTMLElement);
  footer?: string;
  className?: string;
  blocking?: boolean;
  onBack?: () => void;
  columns?: number;
  /** Keep the selected index when refreshed. */
  startIndex?: number;
}

export class MenuScreen implements Screen {
  el: HTMLElement;
  blocking: boolean;
  menu: Menu;
  private bodyEl: HTMLElement;
  constructor(private ui: UIManager, public opts: MenuScreenOptions) {
    this.blocking = opts.blocking ?? true;
    this.menu = new Menu(opts.items, { columns: opts.columns, startIndex: opts.startIndex });
    this.bodyEl = h('div', { class: 'panel-body' });
    this.el = h(
      'div',
      { class: `panel ${opts.className ?? ''}` },
      h('div', { class: 'panel-title' }, opts.title),
      this.bodyEl,
      this.menu.el,
      opts.footer ? h('div', { class: 'panel-footer' }, opts.footer) : null,
    );
    this.renderBody();
  }
  renderBody(): void {
    this.bodyEl.innerHTML = '';
    const b = typeof this.opts.body === 'function' ? this.opts.body() : this.opts.body;
    if (b) this.bodyEl.appendChild(b);
    this.bodyEl.style.display = b ? '' : 'none';
  }
  refresh(items?: MenuItem[]): void {
    if (items) this.opts.items = items;
    this.menu.setItems(this.opts.items);
    this.renderBody();
  }
  handle(a: Action): boolean {
    if (this.menu.handle(a)) return true;
    if (a === 'back' || a === 'menu') {
      if (this.opts.onBack) this.opts.onBack();
      else this.ui.remove(this);
      return true;
    }
    return false;
  }
}

export class DialogueScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  private textEl: HTMLElement;
  private shown = 0;
  private done = false;
  private menu: Menu | null = null;
  private acc = 0;
  private arrow: HTMLElement;
  constructor(
    private ui: UIManager,
    speaker: string | null,
    private text: string,
    private choiceOpts: { choices: string[]; cancellable: boolean } | null,
    private onDone: (i?: number) => void,
  ) {
    this.textEl = h('div', { class: 'dialogue-text' });
    this.arrow = h('div', { class: 'dialogue-arrow' }, '▼');
    this.el = h(
      'div',
      { class: 'dialogue-wrap' },
      h('div', { class: 'dialogue', onclick: () => this.handle('confirm') }, speaker ? h('div', { class: 'dialogue-speaker' }, speaker) : null, this.textEl, this.arrow),
    );
    if (choiceOpts) {
      this.menu = new Menu(
        choiceOpts.choices.map((c, i) => ({ label: c, action: () => this.finish(i) })),
        {},
      );
      this.menu.el.classList.add('dialogue-choices');
      this.menu.el.style.display = 'none';
      this.el.appendChild(this.menu.el);
    }
  }
  update(dt: number): void {
    if (this.done) return;
    this.acc += dt * 70;
    const n = Math.min(this.text.length, Math.floor(this.acc));
    if (n !== this.shown) {
      this.shown = n;
      this.textEl.textContent = this.text.slice(0, n);
    }
    if (n >= this.text.length) this.complete();
  }
  private complete(): void {
    this.done = true;
    this.textEl.textContent = this.text;
    if (this.menu) {
      this.menu.el.style.display = '';
      this.arrow.style.display = 'none';
    } else this.arrow.classList.add('blink');
  }
  private finish(i?: number): void {
    this.ui.remove(this);
    this.onDone(i);
  }
  handle(a: Action): boolean {
    if (!this.done) {
      if (a === 'confirm' || a === 'back') this.complete();
      return true;
    }
    if (this.menu) {
      if (this.menu.handle(a)) return true;
      if ((a === 'back' || a === 'menu') && this.choiceOpts?.cancellable) this.finish(-1);
      return true;
    }
    if (a === 'confirm' || a === 'back' || a === 'menu') this.finish();
    return true;
  }
}
