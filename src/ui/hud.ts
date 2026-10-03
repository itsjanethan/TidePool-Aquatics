/** Always-on HUD: date/time, money, reputation, goal hint, interaction prompt. */
import type { GameController } from '../game/GameController';
import { formatMoney } from '../core/math';
import { currentObjective } from '../sim/progression';
import { overallReputation, repStars } from '../sim/reputation';
import { clockString, dateString, isShopOpen } from '../sim/time';
import { h } from './dom';

export class Hud {
  private el: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private goal: HTMLElement;
  private prompt: HTMLElement;
  private saved: HTMLElement;
  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  private last = '';
  private promptText: string | null = null;

  constructor(private c: GameController) {
    this.left = h('div', { class: 'hud-box hud-left' });
    this.right = h('div', { class: 'hud-box hud-right' });
    this.goal = h('div', { class: 'hud-goal' });
    this.prompt = h('div', { class: 'hud-prompt' });
    this.saved = h('div', { class: 'hud-saved' });
    this.el = h('div', { class: 'hud' }, this.left, this.right, this.goal, this.prompt, this.saved);
    c.ui.hudLayer.appendChild(this.el);
    this.show(false);
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }

  setPrompt(text: string | null): void {
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.textContent = text ?? '';
    this.prompt.style.display = text ? '' : 'none';
  }

  /** Small, unobtrusive save indicator under the money box. */
  flashSaved(text: string): void {
    this.saved.textContent = text;
    this.saved.classList.add('on');
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.classList.remove('on'), 4000);
  }

  setGoalVisible(on: boolean): void {
    this.goal.style.visibility = on ? '' : 'hidden';
  }

  update(): void {
    const s = this.c.state;
    const open = isShopOpen(s.minute);
    const stars = repStars(overallReputation(s));
    const obj = currentObjective(s);
    const key = `${Math.floor(s.minute)}|${s.money}|${stars}|${obj?.id}|${s.settings.speed}|${this.c.paused}`;
    if (key === this.last) return;
    this.last = key;
    this.left.innerHTML = '';
    this.left.append(
      h('div', { class: 'hud-shop' }, s.shopName),
      h('div', null, `${dateString(s.minute)}  `, h('b', null, clockString(s.minute)), ' ', h('span', { class: open ? 'tag tag-open' : 'tag tag-closed' }, open ? 'OPEN' : 'CLOSED')),
    );
    const starStr = '★'.repeat(Math.floor(stars)) + '☆'.repeat(5 - Math.floor(stars)) + (stars % 1 ? ' +' : '');
    this.right.innerHTML = '';
    this.right.append(
      h('div', { class: `hud-money ${s.money < 0 ? 'neg' : ''}` }, formatMoney(s.money)),
      h('div', null, h('span', { class: 'stars' }, starStr), ` ${s.settings.speed}x${this.c.paused ? ' ❚❚' : ''}`),
    );
    this.goal.textContent = obj ? `Goal: ${obj.title}` : 'All starter goals complete!';
    this.goal.title = obj?.hint ?? '';
  }
}
