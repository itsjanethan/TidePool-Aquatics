/** Intro and help screens. */
import type { GameController } from '../../game/GameController';
import { h } from '../dom';

export function showIntro(c: GameController): void {
  const s = c.state;
  const lines = [
    `Welcome to ${s.shopName}, ${s.playerName}! The previous owner left you ten tanks, a till and a lot of hungry fish.`,
    'Walk with the arrow keys or WASD. Press Z, Enter or Space to interact, X to go back, and Esc for the menu.',
    'Feed your fish, keep the water clean, and serve customers at the till. Customers with a "?" want your advice.',
    'Tank C2 is brand new and has not cycled yet. Do not rush fish into it!',
    'Check the goal in the bottom corner if you are not sure what to do next. Good luck!',
  ];
  let chain = Promise.resolve();
  for (const l of lines) chain = chain.then(() => c.ui.say('Letter from the old owner', l));
}

export function helpBody(): HTMLElement {
  const sec = (title: string, ...items: string[]) => h('div', { class: 'help-sec' }, h('div', { class: 'section-title' }, title), ...items.map((i) => h('div', { class: 'small' }, `• ${i}`)));
  return h('div', { class: 'help' },
    sec('Controls',
      'Move: arrow keys / WASD / d-pad / left stick. Hold Shift (gamepad X) to run.',
      'Interact / confirm: Z, Enter, Space (gamepad A). Back: X, Backspace (gamepad B). Menu: Esc (Start).',
      'Facing a tank: F feeds it. T changes game speed. In a tank view: Q/E or Tab cycles fish, mouse clicks select.',
    ),
    sec('Fishkeeping basics',
      'New tanks must cycle: bacteria grow to turn toxic ammonia into nitrite, then into safer nitrate. This takes days.',
      'Overfeeding and overstocking create waste. Uneaten food rots. Dead fish pollute the water fast.',
      'Water changes reduce nitrate and toxins. Rinse filter media when flow drops. Clean glass for happy customers.',
      'Coldwater fish (goldfish, white clouds) dislike heated tanks. Tropical fish need a heater.',
      'Shoaling fish like neons and danios want groups of six or more. Shy fish need plants and caves.',
    ),
    sec('Running the shop',
      'Customers browse tanks, pick fish and queue at the till. Stand behind the counter facing them to serve.',
      'Good advice builds your Expert Advice reputation. Selling unsuitable fish may come back to haunt you.',
      'Order livestock and supplies from the office PC. Deliveries arrive at opening time.',
      'Each night rent and electricity are charged. At closing time, end the day at the door or the PC.',
    ),
  );
}

export function showHelp(c: GameController): void {
  const scr = c.ui.menu({ title: 'How to Play', body: helpBody(), items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide tall' });
}
