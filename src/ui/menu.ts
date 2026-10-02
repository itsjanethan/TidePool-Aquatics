/** Keyboard/gamepad/mouse navigable menu list. */
import type { Action } from '../input/input';
import { h } from './dom';
import { play } from '../audio/sfx';

export interface MenuItem {
  label: string;
  /** Secondary right-aligned text (price, value). */
  right?: string;
  /** Small description shown under the label when selected. */
  hint?: string;
  disabled?: boolean;
  action?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  className?: string;
  /** Non-selectable section header. */
  header?: boolean;
}

export interface MenuOptions {
  columns?: number;
  startIndex?: number;
  onChange?: (index: number) => void;
}

export class Menu {
  el: HTMLElement;
  index = 0;
  private items: MenuItem[] = [];
  private rows: HTMLElement[] = [];
  constructor(items: MenuItem[], private opts: MenuOptions = {}) {
    this.el = h('div', { class: 'menu', role: 'menu' });
    if (opts.columns) this.el.style.gridTemplateColumns = `repeat(${opts.columns}, 1fr)`;
    if (opts.columns) this.el.classList.add('menu-grid');
    this.setItems(items, opts.startIndex);
  }

  setItems(items: MenuItem[], keepIndex?: number): void {
    this.items = items;
    this.el.innerHTML = '';
    this.rows = items.map((it, i) => {
      const row = h(
        'div',
        {
          class: `menu-item ${it.disabled ? 'disabled' : ''} ${it.header ? 'menu-header' : ''} ${it.className ?? ''}`,
          role: it.header ? 'presentation' : 'menuitem',
          onmouseenter: () => !it.header && this.select(i),
          onclick: (e: Event) => {
            e.stopPropagation();
            if (it.header) return;
            this.select(i);
            this.activate();
          },
        },
        h('span', { class: 'menu-label' }, it.label),
        it.onLeft || it.onRight
          ? h('span', { class: 'menu-arrows' },
              h('button', { class: 'mini-btn', onclick: (e: Event) => { e.stopPropagation(); this.select(i); it.onLeft?.(); } }, '◀'),
              h('span', { class: 'menu-right' }, it.right ?? ''),
              h('button', { class: 'mini-btn', onclick: (e: Event) => { e.stopPropagation(); this.select(i); it.onRight?.(); } }, '▶'))
          : it.right !== undefined ? h('span', { class: 'menu-right' }, it.right) : null,
        it.hint ? h('div', { class: 'menu-hint' }, it.hint) : null,
      );
      this.el.appendChild(row);
      return row;
    });
    let idx = keepIndex ?? this.index;
    idx = Math.max(0, Math.min(items.length - 1, idx));
    if (items[idx]?.header) idx = this.nextSelectable(idx, 1);
    this.select(idx, false);
  }

  private selectable(i: number): boolean {
    const it = this.items[i];
    return !!it && !it.header;
  }

  private nextSelectable(from: number, dir: number): number {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + dir * k + n * 10) % n;
      if (this.selectable(i)) return i;
    }
    return from;
  }

  select(i: number, scroll = true): void {
    if (!this.selectable(i)) return;
    this.rows[this.index]?.classList.remove('selected');
    this.index = i;
    const row = this.rows[i];
    row?.classList.add('selected');
    if (scroll && row) row.scrollIntoView({ block: 'nearest' });
    this.opts.onChange?.(i);
  }

  current(): MenuItem | undefined {
    return this.items[this.index];
  }

  activate(): void {
    const it = this.current();
    if (!it || it.header) return;
    if (it.disabled) {
      play('back');
      return;
    }
    play('confirm');
    it.action?.();
  }

  handle(a: Action): boolean {
    if (!this.items.length) return false;
    const cols = this.opts.columns ?? 1;
    switch (a) {
      case 'up':
        play('move');
        this.select(cols > 1 ? Math.max(0, this.index - cols) : this.nextSelectable(this.index, -1));
        return true;
      case 'down':
        play('move');
        this.select(cols > 1 ? Math.min(this.items.length - 1, this.index + cols) : this.nextSelectable(this.index, 1));
        return true;
      case 'left': {
        const it = this.current();
        if (it?.onLeft) {
          play('move');
          it.onLeft();
        }
        else if (cols > 1) this.select(Math.max(0, this.index - 1));
        else return false;
        return true;
      }
      case 'right': {
        const it = this.current();
        if (it?.onRight) {
          play('move');
          it.onRight();
        }
        else if (cols > 1) this.select(Math.min(this.items.length - 1, this.index + 1));
        else return false;
        return true;
      }
      case 'confirm':
        this.activate();
        return true;
      default:
        return false;
    }
  }
}
