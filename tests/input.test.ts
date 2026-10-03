// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager, type Action } from '../src/input/input';
import { installTouchControls, padDirection } from '../src/ui/touch';
import { noteRan, resetRunHint, runHint } from '../src/input/runHint';
import { RUN_TIME, STEP_TIME, stepDuration } from '../src/render/walkTiming';
import { UIManager } from '../src/ui/ui';

const ptr = (type: string, id: number, x = 0, y = 0) =>
  new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true });

function pressLog(input: InputManager): Action[] {
  const log: Action[] = [];
  input.events.on('press', (a) => log.push(a));
  return log;
}

describe('Running', () => {
  it('runs at twice walking speed, one tile at a time', () => {
    expect(RUN_TIME).toBeCloseTo(STEP_TIME / 2);
    expect(stepDuration(true)).toBe(RUN_TIME);
    expect(stepDuration(false)).toBe(STEP_TIME);
  });

  it('B (keyboard X), Shift and on-screen B all count as run', () => {
    const input = new InputManager(window);
    expect(input.runHeld()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    expect(input.runHeld()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    expect(input.runHeld()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
    expect(input.runHeld()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
    input.setVirtual('back', true);
    expect(input.runHeld()).toBe(true);
    input.setVirtual('back', false);
    expect(input.runHeld()).toBe(false);
  });

  it('B stays Back in menus: a held B press closes the top menu screen', () => {
    const ui = new UIManager(document.createElement('div'));
    const scr = ui.menu({ title: 'Test', items: [{ label: 'One', action: () => {} }] });
    expect(ui.isBlocking()).toBe(true);
    expect(ui.handle('back')).toBe(true);
    expect(ui.top()).not.toBe(scr);
  });
});

describe('Held input is cleared on interruption', () => {
  let input: InputManager;
  beforeEach(() => {
    input = new InputManager(window);
  });

  for (const [name, fire] of [
    ['window blur', () => window.dispatchEvent(new Event('blur'))],
    ['page hide', () => window.dispatchEvent(new Event('pagehide'))],
    [
      'tab hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      },
    ],
  ] as const) {
    it(`${name} releases keyboard and touch holds`, () => {
      const cleared = vi.fn();
      input.events.on('cleared', cleared);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      input.setVirtual('back', true);
      expect(input.isHeld('up')).toBe(true);
      expect(input.runHeld()).toBe(true);
      fire();
      expect(input.isHeld('up')).toBe(false);
      expect(input.runHeld()).toBe(false);
      expect(cleared).toHaveBeenCalled();
    });
  }

  it('a gamepad button still down after a clear is held again without a new press', () => {
    let pressed = true;
    const pad = { buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 1 && pressed, value: 0 })), axes: [0, 0] };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    try {
      const log = pressLog(input);
      input.poll(0);
      expect(log).toEqual(['back']);
      expect(input.runHeld()).toBe(true);
      input.clearAll();
      expect(input.runHeld()).toBe(false);
      input.poll(16);
      expect(log).toEqual(['back']); // no spurious second Back
      expect(input.runHeld()).toBe(true);
      pressed = false;
      pad.buttons[1].pressed = false;
      input.poll(32);
      expect(input.runHeld()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Touch controls', () => {
  let input: InputManager;
  afterEach(() => {
    document.body.innerHTML = '';
  });
  beforeEach(() => {
    input = new InputManager(window);
  });

  it('maps d-pad offsets to directions with a dead zone', () => {
    expect(padDirection(0, 0, 10)).toBeNull();
    expect(padDirection(3, 4, 10)).toBeNull();
    expect(padDirection(0, -40, 10)).toBe('up');
    expect(padDirection(0, 40, 10)).toBe('down');
    expect(padDirection(-40, 5, 10)).toBe('left');
    expect(padDirection(40, -5, 10)).toBe('right');
  });

  it('holds a direction and B at the same time with two fingers', () => {
    const tc = installTouchControls(input, true)!;
    const pad = tc.root.querySelector('.touch-pad') as HTMLElement;
    const b = tc.root.querySelector('.ta-b') as HTMLElement;
    pad.dispatchEvent(ptr('pointerdown', 1, 0, -60));
    b.dispatchEvent(ptr('pointerdown', 2));
    expect(input.heldDirection()).toBe('up');
    expect(input.runHeld()).toBe(true);
    // Thumb slides to the right on the pad: direction follows, run stays held.
    pad.dispatchEvent(ptr('pointermove', 1, 60, 0));
    expect(input.heldDirection()).toBe('right');
    expect(input.runHeld()).toBe(true);
    b.dispatchEvent(ptr('pointerup', 2));
    expect(input.runHeld()).toBe(false);
    expect(input.heldDirection()).toBe('right');
    pad.dispatchEvent(ptr('pointerup', 1));
    expect(input.heldDirection()).toBeNull();
  });

  it('a cancelled gesture or lost capture releases the finger', () => {
    const tc = installTouchControls(input, true)!;
    const pad = tc.root.querySelector('.touch-pad') as HTMLElement;
    const b = tc.root.querySelector('.ta-b') as HTMLElement;
    b.dispatchEvent(ptr('pointerdown', 3));
    pad.dispatchEvent(ptr('pointerdown', 4, -60, 0));
    expect(b.classList.contains('down')).toBe(true);
    b.dispatchEvent(ptr('pointercancel', 3));
    expect(input.runHeld()).toBe(false);
    expect(b.classList.contains('down')).toBe(false);
    pad.dispatchEvent(ptr('lostpointercapture', 4));
    expect(input.heldDirection()).toBeNull();
  });

  it('a finger lifted outside the controls still releases', () => {
    const tc = installTouchControls(input, true)!;
    const b = tc.root.querySelector('.ta-b') as HTMLElement;
    b.dispatchEvent(ptr('pointerdown', 5));
    window.dispatchEvent(ptr('pointerup', 5));
    expect(input.runHeld()).toBe(false);
  });

  it('switching tabs mid-run releases every finger and clears the pressed look', () => {
    const tc = installTouchControls(input, true)!;
    const pad = tc.root.querySelector('.touch-pad') as HTMLElement;
    const b = tc.root.querySelector('.ta-b') as HTMLElement;
    pad.dispatchEvent(ptr('pointerdown', 6, 0, 60));
    b.dispatchEvent(ptr('pointerdown', 7));
    window.dispatchEvent(new Event('blur'));
    expect(input.heldDirection()).toBeNull();
    expect(input.runHeld()).toBe(false);
    expect(tc.root.querySelectorAll('.down').length).toBe(0);
    // The stale finger's later pointerup is harmless, and new touches work.
    b.dispatchEvent(ptr('pointerup', 7));
    b.dispatchEvent(ptr('pointerdown', 8));
    expect(input.runHeld()).toBe(true);
  });

  it('labels B as Run while walking and Back in menus', () => {
    const tc = installTouchControls(input, true)!;
    const sub = () => tc.root.querySelector('.ta-b .tb-sub')!.textContent;
    expect(sub()).toBe('Back');
    tc.setContext({ walking: true });
    expect(sub()).toBe('Run');
    expect(tc.root.querySelector('.ta-b')!.getAttribute('aria-label')).toBe('B: hold to run');
    tc.setContext({ walking: false });
    expect(sub()).toBe('Back');
  });
});

describe('Run hint', () => {
  beforeEach(() => {
    localStorage.clear();
    resetRunHint();
  });

  it('shows the device-appropriate hint until the player has run', () => {
    expect(runHint('pointer')).toBe('Hold B to run');
    expect(runHint('gamepad')).toBe('Hold B to run');
    expect(runHint('keyboard')).toBe('Hold Shift or X to run');
    noteRan();
    expect(runHint('pointer')).toBeNull();
    resetRunHint();
    expect(runHint('pointer')).toBeNull(); // remembered on this device
  });
});
