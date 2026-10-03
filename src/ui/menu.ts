/** Keyboard/gamepad/mouse navigable menu list. */
import type { Action } from '../input/input';
import { h } from './dom';
import { play } from '../audio/sfx';

export interface MenuItem {
  label: string;
  /** Secondary right-aligned text (price, value). */
  right?: string;
  /** Description shown in the menu's hint line while this item is selected. */
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

/**
 * Last real pointer position. Rows only take the selection from the mouse when
 * the pointer has actually moved, never when the list scrolls or re-renders
 * under a resting cursor (that caused the selection to jump while using keys).
 */
let lastPointer = { x: -1, y: -1 };
function pointerMoved(e: MouseEvent): boolean {
  if (e.clientX === lastPointer.x && e.clientY === lastPointer.y) return false;
  lastPointer = { x: e.clientX, y: e.clientY };
  return true;
}

export class Menu {
  /** Wrapper: scrolling list plus a fixed hint line. */
  el: HTMLElement;
  private list: HTMLElement;
  private hintEl: HTMLElement;
  index = 0;
  private items: MenuItem[] = [];
  private rows: HTMLElement[] = [];

  constructor(items: MenuItem[], private opts: MenuOptions = {}) {
    this.list = h('div', { class: 'menu-list', role: 'menu' });
    if (opts.columns) {
      this.list.style.gridTemplateColumns = `repeat(${opts.columns}, 1fr)`;
      this.list.classList.add('menu-grid');
    }
    this.hintEl = h('div', { class: 'menu-hint-line' });
    this.el = h('div', { class: 'menu' }, this.list, this.hintEl);
    this.setItems(items, opts.startIndex);
  }

  setItems(items: MenuItem[], keepIndex?: number): void {
    const scrollTop = this.list.scrollTop;
    this.items = items;
    this.list.innerHTML = '';
    this.rows = items.map((it, i) => {
      const row = h(
        'div',
        {
          class: `menu-item ${it.disabled ? 'disabled' : ''} ${it.header ? 'menu-header' : ''} ${it.className ?? ''}`,
          role: it.header ? 'presentation' : 'menuitem',
          onmousemove: (e: Event) => {
            if (!it.header && pointerMoved(e as MouseEvent) && this.index !== i) this.select(i, false);
          },
          onclick: (e: Event) => {
            e.stopPropagation();
            if (it.header) return;
            this.select(i, false);
            this.activate();
          },
        },
        h('span', { class: 'menu-label' }, it.label),
        it.onLeft || it.onRight
          ? h('span', { class: 'menu-arrows' },
              h('button', { class: 'mini-btn', tabindex: '-1', onclick: (e: Event) => { e.stopPropagation(); this.select(i, false); it.onLeft?.(); } }, '◀'),
              h('span', { class: 'menu-right' }, it.right ?? ''),
              h('button', { class: 'mini-btn', tabindex: '-1', onclick: (e: Event) => { e.stopPropagation(); this.select(i, false); it.onRight?.(); } }, '▶'))
          : it.right !== undefined ? h('span', { class: 'menu-right' }, it.right) : null,
      );
      this.list.appendChild(row);
      return row;
    });
    this.list.scrollTop = scrollTop;
    this.hintEl.style.display = items.some((it) => it.hint) ? '' : 'none';
    let idx = keepIndex ?? this.index;
    idx = Math.max(0, Math.min(items.length - 1, idx));
    if (items[idx]?.header) idx = this.nextSelectable(idx, 1);
    this.select(idx, true, false);
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

  /** Scrolls only the menu's own list (never the page) to keep a row visible. */
  private keepVisible(row: HTMLElement): void {
    const list = this.list;
    const top = row.offsetTop - list.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - row.offsetHeight);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + row.offsetHeight * 0.5;
  }

  select(i: number, scroll = true, notify = true): void {
    if (!this.selectable(i)) return;
    this.rows[this.index]?.classList.remove('selected');
    this.index = i;
    const row = this.rows[i];
    row?.classList.add('selected');
    if (scroll && row) this.keepVisible(row);
    this.hintEl.textContent = this.items[i]?.hint ?? '';
    if (notify) this.opts.onChange?.(i);
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
        } else if (cols > 1) this.select(Math.max(0, this.index - 1));
        else return false;
        return true;
      }
      case 'right': {
        const it = this.current();
        if (it?.onRight) {
          play('move');
          it.onRight();
        } else if (cols > 1) this.select(Math.min(this.items.length - 1, this.index + 1));
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
