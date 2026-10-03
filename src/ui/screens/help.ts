/** Intro and help screens. */
import type { GameController } from '../../game/GameController';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { entriesFor, glossaryEntry, HELP_SECTIONS, type GlossaryEntry, type HelpSectionId } from '../../data/glossary';
import { APP_VERSION } from '../../version';

export function showIntro(c: GameController): void {
  const s = c.state;
  const lines = [
    `Welcome to ${s.shopName}, ${s.playerName}! The previous owner left you ten tanks, a till and a lot of hungry fish.`,
    'Walk with the arrow keys or WASD. Press Z, Enter or Space to interact, X to go back, and Esc for the menu. Press H (or the ? button) for Help any time.',
    'Feed your fish, keep the water clean, and serve customers at the till. Customers with a "?" want your advice.',
    'Tank C2 is brand new and has not cycled yet. Do not rush fish into it!',
    'Save at the office PC in the top right. The shop also autosaves every morning when it opens.',
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
      'In menus with long details, Q / E scroll the details.',
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
      'Order to several tanks at once: each order line has its own tank. Warnings are advice only.',
    ),
    sec('Plants and breeding',
      'Plants grow with light and nutrients. Take cuttings from a tank menu (Plants) to sell or replant.',
      'Healthy, well-fed adult pairs breed. Each tank menu has a Breeding page that says what helps.',
      'Adults eat small fry. Dense plants help; or move fry to their own tank.',
      'Set "Customers can buy" to No on breeding and grow-out tanks.',
      'Shop-bred lines can be named as strains from the F2 generation. Strains are worth more.',
      'Floating plants like duckweed spread on their own. Scoop them from the Plants menu before they cover the surface.',
      'Every fish looks like its genes: watch the tank to spot promising young fish.',
    ),
    sec('Saving',
      'Save, load, export and import at the office PC (top right).',
      'The game autosaves every morning when the shop opens.',
    ),
  );
}

export function showHelp(c: GameController): void {
  const scr = c.ui.menu({ title: 'How to Play', body: helpBody(), items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide tall' });
}

// ---------------------------------------------------------------------------
// Help & glossary browser

let helpCtl: GameController | null = null;
/** Lets help links inside any screen open the glossary without threading the controller through. */
export function setHelpController(c: GameController): void {
  helpCtl = c;
}

/** Inline clickable term that opens its glossary entry (mouse/touch). */
export function helpLink(label: string, id: string): HTMLElement {
  const el = h('span', { class: 'help-link', title: 'Help: click for details' }, label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (helpCtl) openHelpEntry(helpCtl, id);
  });
  return el;
}

/** Menu item that opens a glossary entry (keyboard and gamepad friendly). */
export function helpItem(id: string, label?: string): MenuItem {
  const g = glossaryEntry(id);
  return {
    label: label ?? `Help: ${g?.title ?? id}`,
    right: '?',
    hint: g ? g.body.slice(0, 110) + (g.body.length > 110 ? '...' : '') : '',
    action: () => {
      if (helpCtl) openHelpEntry(helpCtl, id);
    },
  };
}

/** Overworld icon textures shown next to their glossary entries. */
const ICON_TEXTURE: Record<string, string> = {
  icon_attention: 'icon-attention', icon_dead: 'icon-dead', icon_toxic: 'icon-alert', icon_sick: 'icon-sick', icon_hungry: 'icon-hungry', icon_dirty: 'icon-dirty',
};

function iconImage(id: string): HTMLElement | null {
  const key = ICON_TEXTURE[id];
  const tex = key && helpCtl?.game?.textures.exists(key) ? helpCtl.game.textures.get(key) : null;
  const src = tex?.getSourceImage() as HTMLCanvasElement | undefined;
  if (!src || typeof src.toDataURL !== 'function') return null;
  return h('img', { class: 'help-icon', src: src.toDataURL(), alt: '' });
}

function entryBody(g: GlossaryEntry): HTMLElement {
  const list = (title: string, xs?: string[]) =>
    xs?.length ? h('div', { class: 'help-sec' }, h('div', { class: 'section-title' }, title), ...xs.map((x) => h('div', { class: 'small' }, `• ${x}`))) : null;
  return h(
    'div',
    { class: 'help help-entry' },
    iconImage(g.id) ?? (g.symbol ? h('div', { class: 'help-symbol' }, g.symbol) : null),
    h('div', null, g.body),
    g.ranges ? h('div', { class: 'help-sec' }, h('div', { class: 'section-title' }, 'Ranges'), h('div', { class: 'small' }, g.ranges)) : null,
    list('Affected by', g.affectedBy),
    list('Affects', g.affects),
  );
}

export function openHelpEntry(c: GameController, id: string): void {
  const g = glossaryEntry(id);
  if (!g) return;
  const sec = HELP_SECTIONS.find((s) => s.id === g.section)!;
  const scr = c.ui.menu({
    title: g.title,
    body: entryBody(g),
    items: [
      { label: `More in ${sec.title}`, action: () => { c.ui.remove(scr); openHelpSection(c, sec.id); } },
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
    className: 'wide',
  });
}

export function openHelpSection(c: GameController, id: HelpSectionId): void {
  const sec = HELP_SECTIONS.find((s) => s.id === id)!;
  const entries = entriesFor(id);
  const items: MenuItem[] = entries.map((g) => ({
    label: g.symbol ? `${g.symbol}  ${g.title}` : g.title,
    hint: g.body,
    action: () => openHelpEntry(c, g.id),
  }));
  items.push({ label: 'Back', action: () => c.ui.remove(scr) });
  const scr = c.ui.menu({ title: `Help: ${sec.title}`, body: h('div', { class: 'small' }, sec.intro), items, className: 'wide' });
}

/** Main Help screen: How to Play plus every glossary section. Optional section opens directly. */
export function openHelp(c: GameController, section?: HelpSectionId | string): void {
  if (section) {
    if (HELP_SECTIONS.some((s) => s.id === section)) return openHelpSection(c, section as HelpSectionId);
    if (glossaryEntry(section)) return openHelpEntry(c, section);
  }
  const items: MenuItem[] = [
    { label: 'How to Play', hint: 'The basics in one page.', action: () => showHelp(c) },
    ...HELP_SECTIONS.map((s) => ({ label: s.title, right: `${entriesFor(s.id).length}`, hint: s.intro, action: () => openHelpSection(c, s.id) })),
    { label: 'Close', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({
    title: 'Help',
    body: h('div', { class: 'small' }, `Tidepool Aquatics v${APP_VERSION}. Press H any time to open Help. Underlined words elsewhere open their entry here.`),
    items,
    className: 'wide help-root',
  });
}
