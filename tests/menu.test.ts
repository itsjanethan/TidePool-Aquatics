// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Menu, type MenuItem } from '../src/ui/menu';
import { UIManager, type Screen } from '../src/ui/ui';
import { InputManager, KEY_REPEAT_MIN_MS, type Action } from '../src/input/input';

const items = (n: number, extra: Partial<Record<number, Partial<MenuItem>>> = {}): MenuItem[] =>
  Array.from({ length: n }, (_, i) => ({ label: `Item ${i}`, action: vi.fn(), ...extra[i] }));

describe('Menu selection', () => {
  it('moves exactly one row per press and wraps', () => {
    const m = new Menu(items(4));
    expect(m.index).toBe(0);
    m.handle('down');
    expect(m.index).toBe(1);
    m.handle('down');
    m.handle('down');
    expect(m.index).toBe(3);
    m.handle('down');
    expect(m.index).toBe(0);
    m.handle('up');
    expect(m.index).toBe(3);
  });

  it('skips headers, never lands on them, and starts on the first selectable row', () => {
    const m = new Menu(items(5, { 0: { header: true }, 2: { header: true } }));
    expect(m.index).toBe(1);
    m.handle('down');
    expect(m.index).toBe(3);
    m.handle('up');
    expect(m.index).toBe(1);
    m.handle('up');
    expect(m.index).toBe(4);
  });

  it('disabled rows can be highlighted (to read why) but never run', () => {
    const list = items(3, { 1: { disabled: true, hint: 'Locked because...' } });
    const m = new Menu(list);
    m.handle('down');
    expect(m.index).toBe(1);
    m.handle('confirm');
    expect(list[1].action).not.toHaveBeenCalled();
    expect(m.el.querySelector('.menu-hint-line')?.textContent).toBe('Locked because...');
  });

  it('refreshing keeps the selection on the same row and clamps when the list shrinks', () => {
    const m = new Menu(items(6));
    m.handle('down');
    m.handle('down');
    m.setItems(items(6));
    expect(m.index).toBe(2);
    m.setItems(items(2));
    expect(m.index).toBe(1);
  });

  it('exactly one row is marked selected', () => {
    const m = new Menu(items(5));
    for (const a of ['down', 'down', 'up', 'down', 'down'] as Action[]) m.handle(a);
    expect(m.el.querySelectorAll('.menu-item.selected').length).toBe(1);
  });

  it('left/right only act on rows that have them', () => {
    const onLeft = vi.fn();
    const m = new Menu(items(2, { 1: { onLeft } }));
    expect(m.handle('left')).toBe(false);
    m.handle('down');
    expect(m.handle('left')).toBe(true);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('a resting mouse does not steal the selection when rows re-render', () => {
    const m = new Menu(items(5));
    document.body.appendChild(m.el);
    const rows = () => m.el.querySelectorAll<HTMLElement>('.menu-item');
    rows()[3].dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 40, bubbles: true }));
    expect(m.index).toBe(3);
    m.handle('up');
    expect(m.index).toBe(2);
    m.setItems(items(5));
    // Same coordinates: the list moved under the cursor, the mouse did not.
    rows()[3].dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 40, bubbles: true }));
    expect(m.index).toBe(2);
    rows()[4].dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 60, bubbles: true }));
    expect(m.index).toBe(4);
    m.el.remove();
  });
});

describe('Screen stack', () => {
  const screen = (log: string[], name: string, blocking = true): Screen => ({
    el: document.createElement('div'),
    blocking,
    handle: (a) => {
      log.push(`${name}:${a}`);
      return true;
    },
  });

  it('only the top screen receives input, and closing returns input to the one below', () => {
    const ui = new UIManager(document.createElement('div'));
    const log: string[] = [];
    const a = screen(log, 'a');
    const b = screen(log, 'b');
    ui.push(a);
    ui.push(b);
    ui.handle('down');
    ui.remove(b);
    ui.handle('down');
    expect(log).toEqual(['b:down', 'a:down']);
  });

  it('nested menus: Back closes only the top menu', () => {
    const ui = new UIManager(document.createElement('div'));
    const outer = ui.menu({ title: 'Outer', items: items(3) });
    outer.menu.handle('down');
    const inner = ui.menu({ title: 'Inner', items: items(3) });
    ui.handle('back');
    expect(ui.top()).toBe(outer);
    expect(outer.menu.index).toBe(1);
    ui.handle('down');
    expect(outer.menu.index).toBe(2);
    expect(inner.el.isConnected).toBe(false);
  });

  it('a menu removed from the middle of the stack leaves the rest intact', () => {
    const ui = new UIManager(document.createElement('div'));
    const a = ui.menu({ title: 'A', items: items(2) });
    const b = ui.menu({ title: 'B', items: items(2) });
    const c = ui.menu({ title: 'C', items: items(2) });
    ui.remove(b);
    expect(ui.depth).toBe(2);
    expect(ui.top()).toBe(c);
    ui.pop();
    expect(ui.top()).toBe(a);
  });

  it('dialogue choices: the first press completes the text, the next ones navigate', async () => {
    const ui = new UIManager(document.createElement('div'));
    const p = ui.ask(null, 'Pick one', ['Yes', 'No']);
    ui.handle('confirm'); // completes typewriter text
    ui.handle('down');
    ui.handle('confirm');
    expect(await p).toBe(1);
    expect(ui.depth).toBe(0);
  });
});

describe('Keyboard input', () => {
  const key = (type: string, code: string, repeat = false, timeStamp = 0) => {
    const e = new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'timeStamp', { value: timeStamp });
    return e;
  };

  it('held arrows repeat at a capped rate; held confirm never repeats', () => {
    const target = new EventTarget() as unknown as Window;
    const input = new InputManager(target);
    const got: Action[] = [];
    input.events.on('press', (a) => got.push(a));
    target.dispatchEvent(key('keydown', 'ArrowDown', false, 0));
    for (let t = 300; t < 600; t += 16) target.dispatchEvent(key('keydown', 'ArrowDown', true, t));
    target.dispatchEvent(key('keyup', 'ArrowDown', false, 600));
    const downs = got.filter((a) => a === 'down').length;
    expect(downs).toBeGreaterThan(2);
    expect(downs).toBeLessThanOrEqual(1 + Math.ceil(300 / KEY_REPEAT_MIN_MS));
    got.length = 0;
    target.dispatchEvent(key('keydown', 'Enter', false, 700));
    for (let t = 1000; t < 1300; t += 30) target.dispatchEvent(key('keydown', 'Enter', true, t));
    expect(got).toEqual(['confirm']);
  });

  it('typing in a text box does not move menus', () => {
    const input = new InputManager(window);
    const got: Action[] = [];
    input.events.on('press', (a) => got.push(a));
    const box = document.createElement('input');
    document.body.appendChild(box);
    box.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
    expect(got).toEqual([]);
    box.remove();
  });
});
