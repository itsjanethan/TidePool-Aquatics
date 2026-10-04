// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, guardControls, guardFastTaps } from '../src/ui/tapGuard';
import { InputManager } from '../src/input/input';
import { installTouchControls } from '../src/ui/touch';

/** A touch event with the fields the guards read (happy-dom has no Touch constructor). */
function touch(type: string, x = 10, y = 10, stillDown = 0): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: y, identifier: 0 }] });
  Object.defineProperty(e, 'touches', { value: Array.from({ length: stillDown }, () => ({ clientX: 0, clientY: 0 })) });
  return e;
}

describe('On-screen controls never zoom the page', () => {
  it('cancels every touch gesture on the controls, so the browser cannot zoom, scroll or show a callout', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    root.append(btn);
    document.body.append(root);
    guardControls(root);
    for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'dblclick', 'contextmenu']) {
      const e = touch(type);
      btn.dispatchEvent(e);
      expect(e.defaultPrevented, type).toBe(true);
    }
    root.remove();
  });

  it('a ghost click from a control never reaches the page (no duplicate actions)', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    root.append(btn);
    document.body.append(root);
    guardControls(root);
    let reached = 0;
    const count = () => reached++;
    document.addEventListener('click', count);
    btn.click();
    document.removeEventListener('click', count);
    expect(reached).toBe(0);
    root.remove();
  });

  it('rapid taps on B each give exactly one press, and holding B with a direction still runs', () => {
    const input = new InputManager(window);
    const tc = installTouchControls(input, true)!;
    const presses: string[] = [];
    input.events.on('press', (a) => presses.push(a));
    const b = tc.root.querySelector('.ta-b') as HTMLElement;
    const ptr = (type: string, id: number, x = 0, y = 0) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true });
    for (let i = 0; i < 4; i++) {
      b.dispatchEvent(ptr('pointerdown', 20 + i));
      b.dispatchEvent(touch('touchstart'));
      b.dispatchEvent(touch('touchend'));
      b.dispatchEvent(ptr('pointerup', 20 + i));
      b.click(); // what a browser would synthesise; must be swallowed
    }
    expect(presses.filter((a) => a === 'back').length).toBe(4);
    const pad = tc.root.querySelector('.touch-pad') as HTMLElement;
    pad.dispatchEvent(ptr('pointerdown', 40, 0, -60));
    b.dispatchEvent(ptr('pointerdown', 41));
    expect(input.heldDirection()).toBe('up');
    expect(input.runHeld()).toBe(true);
    tc.root.remove();
  });

  it('rotating the device releases held buttons', () => {
    const input = new InputManager(window);
    input.setVirtual('up', true);
    input.setVirtual('back', true);
    window.dispatchEvent(new Event('orientationchange'));
    expect(input.heldDirection()).toBeNull();
    expect(input.runHeld()).toBe(false);
  });
});

describe('Quick taps on the game area and menus', () => {
  let scope: HTMLElement;
  let t = 0;
  let off: () => void;
  beforeEach(() => {
    scope = document.createElement('div');
    document.body.append(scope);
    t = 1000;
    off = guardFastTaps(scope, () => t);
  });
  afterEach(() => {
    off();
    scope.remove();
  });

  const tap = (el: Element, x = 10, y = 10, moveTo?: [number, number]) => {
    el.dispatchEvent(touch('touchstart', x, y));
    const end = touch('touchend', moveTo?.[0] ?? x, moveTo?.[1] ?? y);
    el.dispatchEvent(end);
    return end;
  };

  it('a single tap is untouched (the browser delivers its click)', () => {
    const row = document.createElement('div');
    scope.append(row);
    expect(tap(row).defaultPrevented).toBe(false);
  });

  it('a quick second tap is cancelled (no double-tap zoom) and its click is delivered once', () => {
    const row = document.createElement('div');
    scope.append(row);
    let clicks = 0;
    row.addEventListener('click', () => clicks++);
    tap(row);
    t += DOUBLE_TAP_MS - 100;
    const second = tap(row);
    expect(second.defaultPrevented).toBe(true);
    expect(clicks).toBe(1); // the synthesised click (the browser's own is cancelled)
    t += 100;
    const third = tap(row);
    expect(third.defaultPrevented).toBe(true);
    expect(clicks).toBe(2);
  });

  it('slow taps are left alone', () => {
    const row = document.createElement('div');
    scope.append(row);
    tap(row);
    t += DOUBLE_TAP_MS + 50;
    expect(tap(row).defaultPrevented).toBe(false);
  });

  it('scrolling a list is not a tap and is never cancelled', () => {
    const list = document.createElement('div');
    scope.append(list);
    tap(list);
    t += 100;
    expect(tap(list, 10, 10, [10, 80]).defaultPrevented).toBe(false);
  });

  it('text fields keep their native behaviour', () => {
    const input = document.createElement('input');
    scope.append(input);
    tap(input);
    t += 100;
    expect(tap(input).defaultPrevented).toBe(false);
  });

  it('the canvas gets no synthetic click (the game reads pointer events)', () => {
    const canvas = document.createElement('canvas');
    scope.append(canvas);
    let clicks = 0;
    canvas.addEventListener('click', () => clicks++);
    tap(canvas);
    t += 100;
    expect(tap(canvas).defaultPrevented).toBe(true);
    expect(clicks).toBe(0);
  });
});
