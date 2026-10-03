/**
 * Unified input: keyboard + gamepad mapped to abstract actions. Scenes poll
 * held directions; menus receive discrete presses (with auto-repeat).
 */
import { Emitter } from '../core/events';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm' | 'back' | 'menu'
  | 'tab' | 'tabPrev' | 'feed' | 'run' | 'dev' | 'speed' | 'remove' | 'help';

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'confirm', Enter: 'confirm', Space: 'confirm', NumpadEnter: 'confirm',
  KeyX: 'back', Backspace: 'back', Escape: 'menu',
  Tab: 'tab', KeyE: 'tab', KeyQ: 'tabPrev',
  KeyF: 'feed',
  ShiftLeft: 'run', ShiftRight: 'run',
  Backquote: 'dev', F9: 'dev',
  KeyT: 'speed',
  Delete: 'remove', KeyR: 'remove',
  KeyH: 'help', F1: 'help',
};

// Standard gamepad mapping.
const PAD_BUTTONS: Record<number, Action> = {
  0: 'confirm', 1: 'back', 2: 'run', 3: 'feed', 4: 'tabPrev', 5: 'tab', 6: 'help', 8: 'speed', 9: 'menu', 11: 'help',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

const DIRECTIONS: Action[] = ['up', 'down', 'left', 'right'];
/** Minimum gap between auto-repeated direction presses from a held key. */
export const KEY_REPEAT_MIN_MS = 70;

export interface InputEvents {
  press: Action;
}

export class InputManager {
  readonly events = new Emitter<InputEvents>();
  private held = new Set<Action>();
  private padHeld = new Set<Action>();
  private repeatAt = new Map<Action, number>();
  private lastKeyEmit = new Map<Action, number>();
  lastDevice: 'keyboard' | 'gamepad' | 'pointer' = 'keyboard';

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.held.clear());
    target.addEventListener('pointerdown', () => (this.lastDevice = 'pointer'));
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const el = e.target as HTMLElement | null;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    if (typing && e.code !== 'Escape' && e.code !== 'Enter') return;
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Backspace' || e.code === 'F9' || e.code === 'F1') e.preventDefault();
    this.lastDevice = 'keyboard';
    if (down) {
      const isRepeat = e.repeat;
      this.held.add(a);
      if (!isRepeat) {
        this.lastKeyEmit.set(a, e.timeStamp);
        this.events.emit('press', a);
      } else if (DIRECTIONS.includes(a) && e.timeStamp - (this.lastKeyEmit.get(a) ?? -Infinity) >= KEY_REPEAT_MIN_MS) {
        // Held arrows repeat, but never faster than KEY_REPEAT_MIN_MS whatever the OS repeat rate.
        this.lastKeyEmit.set(a, e.timeStamp);
        this.events.emit('press', a);
      }
    } else {
      this.held.delete(a);
    }
  }

  private virtualHeld = new Set<Action>();

  isHeld(a: Action): boolean {
    return this.held.has(a) || this.padHeld.has(a) || this.virtualHeld.has(a);
  }

  /** On-screen (touch) buttons. */
  setVirtual(a: Action, down: boolean): void {
    if (down && !this.virtualHeld.has(a)) {
      this.virtualHeld.add(a);
      this.lastDevice = 'pointer';
      this.events.emit('press', a);
    } else if (!down) this.virtualHeld.delete(a);
  }

  /** Current held direction (last one wins for keyboard). */
  heldDirection(): 'up' | 'down' | 'left' | 'right' | null {
    for (const d of ['up', 'down', 'left', 'right'] as const) if (this.isHeld(d)) return d;
    return null;
  }

  /** Simulates a press (on-screen buttons, tests). */
  press(a: Action): void {
    this.events.emit('press', a);
  }

  /** Poll gamepads; call once per frame. */
  poll(now: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const next = new Set<Action>();
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        const a = PAD_BUTTONS[i];
        if (a && (b.pressed || b.value > 0.5)) next.add(a);
      });
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -0.5) next.add('left');
      if (ax > 0.5) next.add('right');
      if (ay < -0.5) next.add('up');
      if (ay > 0.5) next.add('down');
    }
    for (const a of next) {
      if (!this.padHeld.has(a)) {
        this.lastDevice = 'gamepad';
        this.events.emit('press', a);
        this.repeatAt.set(a, now + 320);
      } else if (['up', 'down', 'left', 'right'].includes(a) && now >= (this.repeatAt.get(a) ?? Infinity)) {
        this.events.emit('press', a);
        this.repeatAt.set(a, now + 90);
      }
    }
    this.padHeld = next;
  }
}
