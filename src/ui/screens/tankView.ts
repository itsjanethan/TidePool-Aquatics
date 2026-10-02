/** Non-blocking overlay for the tank inspection view. */
import type { GameController } from '../../game/GameController';
import type { Action } from '../../input/input';
import type { TankScene } from '../../render/scenes/TankScene';
import { clockString } from '../../sim/time';
import { queueCustomers } from '../../sim/customers';
import { h } from '../dom';
import type { Screen } from '../ui';
import { fishCard, speciesSummary, tankStatusLine } from './common';
import { openTankMenu } from './tankMenu';

export class TankViewScreen implements Screen {
  el: HTMLElement;
  blocking = false;
  private top: HTMLElement;
  private card: HTMLElement;
  private acc = 0;

  constructor(private c: GameController, private scene: TankScene) {
    this.top = h('div', { class: 'tv-top' });
    this.card = h('div', { class: 'tv-card' });
    const btn = (label: string, key: string, fn: () => void) => h('button', { class: 'tv-btn', onclick: (e: Event) => { e.stopPropagation(); fn(); } }, h('span', { class: 'key' }, key), label);
    const bar = h('div', { class: 'tv-bar' },
      btn('Feed', 'F', () => this.handle('feed')),
      btn('Next fish', 'E', () => this.handle('tab')),
      btn('Tank menu', 'Z', () => this.handle('confirm')),
      btn('Aquascape', 'R', () => this.scene.openAquascape()),
      btn('Back', 'X', () => this.handle('back')),
    );
    this.el = h('div', { class: 'tank-view-ui' }, this.top, this.card, bar);
    this.refreshTop();
    this.refreshFish();
  }

  private get tank() {
    return this.c.state.tanks[this.scene.tankId];
  }

  refreshTop(): void {
    const s = this.c.state;
    const t = this.tank;
    const waiting = queueCustomers(s).filter((q) => q.phase === 'queueing').length;
    const help = s.customers.filter((q) => q.phase === 'waiting_help' || q.phase === 'seeking_help').length;
    this.top.innerHTML = '';
    const parts: Array<HTMLElement | null> = [
      h('span', { class: 'tv-name' }, `${t.name} · ${t.litres}L`),
      h('span', null, `${t.water.temperature.toFixed(1)}°C`),
      h('span', { class: 'tv-species' }, speciesSummary(s, t.id)),
      h('span', { class: 'tv-status' }, tankStatusLine(s, t)),
      waiting ? h('span', { class: 'tv-waiting' }, `${waiting} at till`) : null,
      help ? h('span', { class: 'tv-waiting' }, `${help} need help`) : null,
      h('span', { class: 'tv-clock' }, `${clockString(s.minute)}${t.lightOn ? '' : ' (lights off)'}`),
    ];
    for (const p of parts) if (p) this.top.appendChild(p);
  }

  refreshFish(): void {
    const id = this.scene.tankRenderer?.selectedId;
    const f = id ? this.c.state.fish[id] : null;
    this.card.innerHTML = '';
    if (f) {
      this.card.style.display = '';
      this.card.appendChild(fishCard(this.c.state, f, false));
    } else this.card.style.display = 'none';
  }

  tick(): void {
    this.acc += 1;
    if (this.acc % 20 === 0) {
      this.refreshTop();
      this.refreshFish();
    }
  }

  handle(a: Action): boolean {
    switch (a) {
      case 'tab':
      case 'right':
      case 'down':
        this.scene.tankRenderer.cycleSelection(1);
        this.refreshFish();
        return true;
      case 'tabPrev':
      case 'left':
      case 'up':
        this.scene.tankRenderer.cycleSelection(-1);
        this.refreshFish();
        return true;
      case 'feed':
        this.scene.feed('normal');
        return true;
      case 'remove':
        this.scene.openAquascape();
        return true;
      case 'confirm':
        openTankMenu(this.c, this.scene.tankId);
        return true;
      case 'back':
      case 'menu':
        if (this.scene.tankRenderer.selectedId) {
          this.scene.tankRenderer.selectedId = null;
          this.refreshFish();
        } else this.scene.exit();
        return true;
      default:
        return false;
    }
  }
}
