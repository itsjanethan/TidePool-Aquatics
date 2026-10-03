/** Title screen and new-game form. */
import { APP_VERSION } from '../../version';
import type { GameController } from '../../game/GameController';
import { DEV_ALLOWED } from '../../game/GameController';
import type { Action } from '../../input/input';
import { formatMoney } from '../../core/math';
import { h } from '../dom';
import { Menu, type MenuItem } from '../menu';
import type { Screen } from '../ui';
import { showHelp } from './help';
import { importSave, importSaveText, openDeviceSettings, openSaveSlots } from './pause';

export const GAME_TITLE = 'Tidepool Aquatics';
export const GAME_VERSION = APP_VERSION;

class TitleScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  menu: Menu;
  constructor(_c: GameController, items: MenuItem[], latestText: string) {
    this.menu = new Menu(items);
    this.el = h(
      'div',
      { class: 'title-screen' },
      h('div', { class: 'title-logo' }, h('div', { class: 'logo-main' }, GAME_TITLE), h('div', { class: 'logo-sub' }, 'A little fish shop with big ambitions')),
      h('div', { class: 'panel title-menu' }, this.menu.el, latestText ? h('div', { class: 'panel-footer' }, latestText) : null),
      h('div', { class: 'title-foot' }, `v${GAME_VERSION}${DEV_ALLOWED ? ' · dev mode (press ` in game)' : ''} · Arrow keys + Z, tap or click`),
    );
  }
  handle(a: Action): boolean {
    return this.menu.handle(a);
  }
}

export async function showTitle(c: GameController): Promise<void> {
  c.ui.clear();
  const latest = await c.saves.latest();
  const items: MenuItem[] = [];
  if (__DEV_TOOLS__) items.push({ label: 'Developer Sandbox', hint: 'Developer build only: everything unlocked, separate saves.', action: () => void import('../../dev/sandboxScreen').then((m) => m.startSandbox(c)) });
  if (latest) items.push({ label: 'Continue', hint: `${latest.shopName} · ${latest.dateLabel}`, action: () => void c.load(latest.slot) });
  items.push(
    { label: 'New Game', action: () => showNewGame(c) },
    { label: 'Load Game', action: () => void openSaveSlots(c, 'load', true) },
    { label: 'Import Save File', action: () => importSave(c) },
    { label: 'Import Save Text', hint: 'Paste text from Export Save.', action: () => importSaveText(c) },
    { label: 'Settings', hint: 'Text size, font, sound, picture and touch controls.', action: () => openDeviceSettings(c) },
    { label: 'How to Play', action: () => showHelp(c) },
  );
  const latestText = latest ? `Last played: ${latest.shopName}, ${latest.dateLabel}, ${formatMoney(latest.money)}` : '';
  c.ui.push(new TitleScreen(c, items, latestText));
}

class NewGameScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  private name: HTMLInputElement;
  private shop: HTMLInputElement;
  private menu: Menu;
  constructor(private c: GameController) {
    this.name = h('input', { type: 'text', maxlength: '18', placeholder: 'Your name', value: '' }) as HTMLInputElement;
    this.shop = h('input', { type: 'text', maxlength: '24', placeholder: 'Shop name', value: 'Tidepool Aquatics' }) as HTMLInputElement;
    this.menu = new Menu([
      { label: 'Open the shop!', action: () => this.start() },
      { label: 'Back', action: () => c.ui.remove(this) },
    ]);
    const enter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target === this.name) this.shop.focus();
        else this.start();
      }
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
    };
    this.name.addEventListener('keydown', enter);
    this.shop.addEventListener('keydown', enter);
    this.el = h(
      'div',
      { class: 'panel new-game' },
      h('div', { class: 'panel-title' }, 'New Game'),
      h('div', { class: 'panel-body' },
        h('label', null, 'Your name', this.name),
        h('label', null, 'Shop name', this.shop),
        h('div', { class: 'small' }, 'You have inherited a small fish shop with ten tanks, a few hundred pounds and a lot of hungry fish.')),
      this.menu.el,
    );
  }
  onOpen(): void {
    setTimeout(() => this.name.focus(), 50);
  }
  private start(): void {
    this.c.newGame(this.name.value || 'Keeper', this.shop.value || 'Tidepool Aquatics');
  }
  handle(a: Action): boolean {
    if (document.activeElement === this.name || document.activeElement === this.shop) return true;
    if (a === 'back' || a === 'menu') {
      this.c.ui.remove(this);
      return true;
    }
    if (a === 'up' && this.menu.index === 0) {
      this.shop.focus();
      return true;
    }
    return this.menu.handle(a);
  }
}

function showNewGame(c: GameController): void {
  c.ui.push(new NewGameScreen(c));
}
