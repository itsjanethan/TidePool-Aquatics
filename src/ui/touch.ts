/** On-screen controls for touch devices (d-pad, A, B, menu, feed). */
import type { Action, InputManager } from '../input/input';
import { h } from './dom';

export function installTouchControls(input: InputManager): void {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('touch');
  if (!coarse && !forced) return;
  const btn = (label: string, action: Action, cls: string) => {
    const b = h('button', { class: `touch-btn ${cls}`, 'aria-label': action }, label);
    const down = (e: Event) => {
      e.preventDefault();
      input.setVirtual(action, true);
      b.classList.add('down');
    };
    const up = (e: Event) => {
      e.preventDefault();
      input.setVirtual(action, false);
      b.classList.remove('down');
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  };
  const pad = h('div', { class: 'touch-pad' },
    btn('▲', 'up', 'tp-up'), btn('◀', 'left', 'tp-left'), btn('▶', 'right', 'tp-right'), btn('▼', 'down', 'tp-down'));
  const actions = h('div', { class: 'touch-actions' },
    btn('B', 'back', 'ta-b'), btn('A', 'confirm', 'ta-a'), btn('☰', 'menu', 'ta-menu'), btn('F', 'feed', 'ta-feed'));
  document.body.append(h('div', { class: 'touch-controls' }, pad, actions));
}
