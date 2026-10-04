/** Non-blocking overlay for the tank inspection view. */
import { incomingCount, incomingSummary } from '../../sim/incoming';
import type { GameController } from '../../game/GameController';
import type { Action } from '../../input/input';
import type { TankScene } from '../../render/scenes/TankScene';
import { clockString } from '../../sim/time';
import { hotspot, terraOf } from '../../sim/terrarium';
import { queueCustomers } from '../../sim/customers';
import { h } from '../dom';
import type { Screen } from '../ui';
import { fishCard, specimen, speciesSummary, tankStatusLine } from './common';
import { openFishDetail, openTankMenu } from './tankMenu';
import { phenotypeKey, phenotypeOf } from '../../sim/phenotype';

/** Seconds without input before Idle Mode hides the tank view UI. */
export const IDLE_HIDE_AFTER = 6;

export class TankViewScreen implements Screen {
  el: HTMLElement;
  blocking = false;
  private top: HTMLElement;
  private card: HTMLElement;
  private acc = 0;
  private portraitKey = '';
  private portrait: HTMLElement | null = null;
  private zBtn: HTMLElement;
  private hideBtn: HTMLElement;
  /** UI hidden by the player (Hide UI button). */
  private hidden = false;
  /** Seconds since the last input; in Idle Mode the UI fades away after IDLE_HIDE_AFTER. */
  private quiet = 0;
  private onPointer = () => this.wake();

  constructor(private c: GameController, private scene: TankScene) {
    this.top = h('div', { class: 'tv-top' });
    this.card = h('div', { class: 'tv-card' });
    const btn = (label: string, key: string, fn: () => void) => h('button', { class: 'tv-btn', onclick: (e: Event) => { e.stopPropagation(); fn(); } }, h('span', { class: 'key' }, key), label);
    this.zBtn = btn('Tank menu', 'Z', () => this.handle('confirm'));
    const bar = h('div', { class: 'tv-bar' },
      h('span', { class: 'tv-lockable' }, btn('Feed', 'F', () => this.handle('feed'))),
      btn('Next fish', 'E', () => this.handle('tab')),
      this.zBtn,
      h('span', { class: 'tv-lockable' }, btn('Aquascape', 'R', () => this.scene.openAquascape())),
      btn('Back', 'X', () => this.handle('back')),
    );
    this.hideBtn = h('button', { class: 'tv-btn tv-hide', title: 'Hide or show the tank view UI', onclick: (e: Event) => { e.stopPropagation(); this.toggleHidden(); } }, 'Hide UI');
    this.el = h('div', { class: 'tank-view-ui' }, this.top, this.card, bar, this.hideBtn);
    window.addEventListener('pointermove', this.onPointer);
    window.addEventListener('pointerdown', this.onPointer);
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
      h('span', { class: 'tv-name' }, t.habitat ? `${t.name} · ${t.habitat}` : `${t.name} · ${t.litres}L`),
      // Enclosures show the air: temperature and humidity (and the basking spot when the lamp is on).
      t.habitat
        ? h('span', null, `${terraOf(t).airTemp.toFixed(1)}°C · ${Math.round(terraOf(t).humidity)}% RH${terraOf(t).heatLamp !== null && t.lightOn ? ` · bask ${hotspot(t).toFixed(0)}°C` : ''}`)
        : h('span', null, `${t.water.temperature.toFixed(1)}°C`),
      h('span', { class: 'tv-species' }, speciesSummary(s, t.id)),
      h('span', { class: 'tv-status' }, tankStatusLine(s, t)),
      waiting ? h('span', { class: 'tv-waiting' }, `${waiting} at till`) : null,
      help ? h('span', { class: 'tv-waiting' }, `${help} need help`) : null,
      incomingCount(s, t.id) ? h('span', { class: 'tv-incoming', title: incomingSummary(s, t.id) ?? '' }, `${incomingCount(s, t.id)} on order`) : null,
      h('span', { class: 'tv-clock' }, `${clockString(s.minute)}${t.lightOn ? '' : ' (lights off)'}`),
    ];
    if (this.c.idle) parts.splice(1, 0, h('span', { class: 'tv-idle' }, 'IDLE MODE · BUSINESS PAUSED'));
    this.el.classList.toggle('tv-is-idle', this.c.idle);
    for (const p of parts) if (p) this.top.appendChild(p);
  }

  refreshFish(): void {
    const id = this.scene.tankRenderer?.selectedId;
    const f = id ? this.c.state.fish[id] : null;
    this.card.innerHTML = '';
    if (f) {
      this.card.style.display = '';
      // Close-up portrait of the selected individual (repainted only when its look changes).
      const key = `${f.id}|${phenotypeKey(phenotypeOf(f))}|${Math.round(f.sizeCm * 4)}`;
      if (key !== this.portraitKey) {
        this.portraitKey = key;
        this.portrait = specimen(f);
      }
      if (this.portrait) this.card.appendChild(this.portrait);
      this.card.appendChild(fishCard(this.c.state, f, false));
    } else {
      // Nothing selected: an overview of the tank. Only shown where the card
      // has its own space (portrait phones, below the tank); see styles.css.
      this.card.style.display = '';
      const s = this.c.state;
      const t = this.tank;
      this.card.append(
        h('div', { class: 'tv-overview' },
          h('div', { class: 'fish-name' }, t.habitat ? `${t.name} · ${t.habitat}` : `${t.name} · ${t.litres}L`),
          h('div', null, speciesSummary(s, t.id) || (t.habitat ? 'No animals' : 'No fish')),
          h('div', { class: 'warn' }, tankStatusLine(s, t)),
          h('div', { class: 'small' }, t.habitat ? 'Tap an animal to see it up close. Next steps through them.' : 'Tap a fish to see it up close. Next fish steps through them.')),
      );
      this.card.classList.add('tv-card-empty');
    }
    if (f) this.card.classList.remove('tv-card-empty');
    const label = this.zBtn.lastChild;
    if (label) label.textContent = f ? 'Fish details' : 'Tank menu';
  }

  private toggleHidden(): void {
    this.hidden = !this.hidden;
    this.quiet = 0;
    this.applyHidden();
  }

  private wake(): void {
    this.quiet = 0;
    this.applyHidden();
  }

  private applyHidden(): void {
    const auto = this.c.idle && this.quiet > IDLE_HIDE_AFTER;
    this.el.classList.toggle('tv-hidden', this.hidden || auto);
    this.hideBtn.textContent = this.hidden ? 'Show UI' : 'Hide UI';
  }

  onClose(): void {
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
  }

  tick(dt = 1 / 60): void {
    const wasAuto = this.c.idle && this.quiet > IDLE_HIDE_AFTER;
    this.quiet += dt;
    if (wasAuto !== (this.c.idle && this.quiet > IDLE_HIDE_AFTER)) this.applyHidden();
    this.acc += 1;
    if (this.acc % 20 === 0) {
      this.refreshTop();
      this.refreshFish();
    }
  }

  handle(a: Action): boolean {
    // Any key brings the UI back; the first press after an auto-hide only reveals it.
    const autoHidden = this.c.idle && this.quiet > IDLE_HIDE_AFTER && !this.hidden;
    this.wake();
    if (autoHidden && a !== 'back' && a !== 'menu') return true;
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
      case 'confirm': {
        const id = this.scene.tankRenderer.selectedId;
        const f = id ? this.c.state.fish[id] : null;
        if (f) openFishDetail(this.c, f, () => this.refreshFish());
        else openTankMenu(this.c, this.scene.tankId);
        return true;
      }
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
