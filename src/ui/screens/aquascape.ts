/** Aquascape editor: place, move and remove decor; change substrate/background. */
import type Phaser from 'phaser';
import type { GameController } from '../../game/GameController';
import type { Action } from '../../input/input';
import { clamp, formatMoney } from '../../core/math';
import { BACKGROUNDS, DECOR, getDecor, SUBSTRATES, getBackground, getSubstrate } from '../../data/catalog';
import { getSpecies } from '../../data/species';
import type { TankScene } from '../../render/scenes/TankScene';
import { VIEW } from '../../render/tankRenderer';
import { summarizeAquascape } from '../../sim/aquascape';
import { fishInTank } from '../../sim/fish';
import { addDecor, removeDecorItem, setBackground, setSubstrate } from '../../sim/tank';
import { h } from '../dom';
import { Menu, type MenuItem } from '../menu';
import type { Screen } from '../ui';

type Mode = 'choose' | 'place' | 'edit';

export class AquascapeScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  private mode: Mode = 'choose';
  private menu: Menu;
  private info: HTMLElement;
  private hint: HTMLElement;
  private placing: { defId: string; x: number; layer: 0 | 1 | 2; moveUid?: string } | null = null;
  private editIndex = 0;
  private cursor: Phaser.GameObjects.Graphics;
  private time = 0;

  constructor(private c: GameController, private scene: TankScene) {
    this.menu = new Menu(this.items());
    this.info = h('div', { class: 'aq-info' });
    this.hint = h('div', { class: 'aq-hint' });
    this.el = h('div', { class: 'aquascape-ui' }, h('div', { class: 'panel aq-panel' }, h('div', { class: 'panel-title' }, 'Aquascape'), this.info, this.menu.el), this.hint);
    this.cursor = scene.add.graphics().setDepth(45);
    this.refreshInfo();
    this.setHint();
  }

  private get tank() {
    return this.c.state.tanks[this.scene.tankId];
  }

  private items(): MenuItem[] {
    const t = this.tank;
    const subIdx = SUBSTRATES.findIndex((s) => s.id === t.substrateId);
    const bgIdx = BACKGROUNDS.findIndex((b) => b.id === t.backgroundId);
    const list: MenuItem[] = [
      { label: `Edit placed items (${t.decor.length})`, disabled: !t.decor.length, action: () => this.enterEdit() },
      {
        label: `Substrate: ${getSubstrate(t.substrateId).name}`,
        hint: 'Left/right to browse, confirm to buy. Replacing substrate clouds the water.',
        right: '',
        onLeft: () => this.cycleSub(subIdx - 1),
        onRight: () => this.cycleSub(subIdx + 1),
        action: () => this.cycleSub(subIdx + 1),
      },
      {
        label: `Background: ${getBackground(t.backgroundId).name}`,
        onLeft: () => this.cycleBg(bgIdx - 1),
        onRight: () => this.cycleBg(bgIdx + 1),
        action: () => this.cycleBg(bgIdx + 1),
      },
      { label: 'Add decor', header: true },
      ...DECOR.map((d) => ({ label: d.name, right: formatMoney(d.cost), hint: d.description, action: () => this.startPlace(d.id) })),
      { label: 'Done', action: () => this.close() },
    ];
    return list;
  }

  private cycleSub(i: number): void {
    const s = SUBSTRATES[(i + SUBSTRATES.length) % SUBSTRATES.length];
    void this.c.ui.confirm(`Replace substrate with ${s.name} for ${formatMoney(s.cost)}?`).then((y) => {
      if (!y) return;
      const r = this.c.perform(setSubstrate(this.c.state, this.tank, s.id));
      if (r.ok) this.c.openTankView(this.scene.tankId, 'aquascape');
    });
  }

  private cycleBg(i: number): void {
    const b = BACKGROUNDS[(i + BACKGROUNDS.length) % BACKGROUNDS.length];
    void this.c.ui.confirm(`Apply ${b.name} background for ${formatMoney(b.cost)}?`).then((y) => {
      if (!y) return;
      const r = this.c.perform(setBackground(this.c.state, this.tank, b.id));
      if (r.ok) this.c.openTankView(this.scene.tankId, 'aquascape');
    });
  }

  private startPlace(defId: string, moveUid?: string, x = 0.5, layer: 0 | 1 | 2 = 1): void {
    this.mode = 'place';
    this.placing = { defId, x, layer, moveUid };
    this.menu.el.style.display = 'none';
    this.setHint();
  }

  private enterEdit(): void {
    if (!this.tank.decor.length) return;
    this.mode = 'edit';
    this.editIndex = clamp(this.editIndex, 0, this.tank.decor.length - 1);
    this.menu.el.style.display = 'none';
    this.setHint();
  }

  private backToChoose(): void {
    this.mode = 'choose';
    this.placing = null;
    this.menu.el.style.display = '';
    this.menu.setItems(this.items());
    this.refreshInfo();
    this.setHint();
  }

  private setHint(): void {
    const t = this.hint;
    if (this.mode === 'place' && this.placing) {
      const def = getDecor(this.placing.defId);
      t.textContent = `${this.placing.moveUid ? 'Moving' : 'Placing'} ${def.name}${this.placing.moveUid ? '' : ` (${formatMoney(def.cost)})`} · ◀▶ move · ▲▼ depth (${['back', 'middle', 'front'][this.placing.layer]}) · Z place · X cancel`;
    } else if (this.mode === 'edit') {
      const d = this.tank.decor[this.editIndex];
      t.textContent = d ? `${getDecor(d.defId).name} · ◀▶ select · Z move · R/Del remove (40% refund) · X back` : '';
    } else t.textContent = 'Plants give cover and absorb nitrate. Caves give territories. Wood suits plecos. Balance and variety raise your score.';
  }

  private refreshInfo(): void {
    const t = this.tank;
    const sc = summarizeAquascape(t);
    const fish = fishInTank(this.c.state, t.id);
    const needs: string[] = [];
    for (const sid of new Set(fish.map((f) => f.speciesId))) {
      const sp = getSpecies(sid);
      if (sp.tags.includes('needs_cave')) needs.push(`${sp.commonName}: cave ${sc.caves ? '✔' : '✘'}`);
      if (sp.tags.includes('needs_wood')) needs.push(`${sp.commonName}: wood ${sc.provides.has('wood') ? '✔' : '✘'}`);
      if (sp.tags.includes('needs_sand')) needs.push(`${sp.commonName}: sand ${sc.provides.has('sand') ? '✔' : '✘'}`);
      if (sp.behaviour.shyness > 0.4) needs.push(`${sp.commonName}: cover ${sc.cover > 0.35 ? '✔' : '✘'}`);
    }
    this.info.innerHTML = '';
    this.info.append(
      h('div', { class: 'row' }, h('span', null, 'Layout score'), h('b', null, `${Math.round(sc.layout)}`), h('span', null, 'Shown'), h('b', null, `${Math.round(sc.beauty)}`)),
      h('div', { class: 'row small' }, h('span', null, `Plants ${sc.plants} · Caves ${sc.caves} · Cover ${Math.round(sc.cover * 100)}% · Open water ${Math.round(sc.openSpace * 100)}%`)),
      h('div', { class: 'small' }, needs.join(' · ')),
      h('div', { class: 'small' }, `Money: ${formatMoney(this.c.state.money)}`),
    );
  }

  update(dt: number): void {
    this.time += dt;
    const g = this.cursor;
    g.clear();
    const W = VIEW.right - VIEW.left;
    const toX = (x: number) => VIEW.left + 10 + x * (W - 20);
    if (this.mode === 'place' && this.placing) {
      const def = getDecor(this.placing.defId);
      const scale = clamp(Math.sqrt(60 / this.tank.lengthCm), 0.6, 1.1);
      const w = def.width * scale;
      const hgt = def.height * scale;
      const x = toX(this.placing.x);
      const base = VIEW.floor - 2 + this.placing.layer * 4;
      const a = 0.5 + Math.sin(this.time * 6) * 0.2;
      g.lineStyle(1, 0xfff27a, a).strokeRect(Math.round(x - w / 2), Math.round(base - hgt), Math.round(w), Math.round(hgt));
      g.fillStyle(0xfff27a, 0.12).fillRect(Math.round(x - w / 2), Math.round(base - hgt), Math.round(w), Math.round(hgt));
      g.fillStyle(0xfff27a, 1).fillRect(Math.round(x), base + 2, 1, 6);
    } else if (this.mode === 'edit') {
      const d = this.tank.decor[this.editIndex];
      if (d) {
        const def = getDecor(d.defId);
        const scale = clamp(Math.sqrt(60 / this.tank.lengthCm), 0.6, 1.1);
        const x = toX(d.x);
        const base = VIEW.floor - 2 + d.layer * 4;
        g.lineStyle(1, 0x7af2ff, 0.6 + Math.sin(this.time * 6) * 0.3).strokeRect(Math.round(x - (def.width * scale) / 2), Math.round(base - def.height * scale), Math.round(def.width * scale), Math.round(def.height * scale));
      }
    }
  }

  handle(a: Action): boolean {
    if (this.mode === 'choose') {
      if (this.menu.handle(a)) return true;
      if (a === 'back' || a === 'menu') this.close();
      return true;
    }
    if (this.mode === 'place' && this.placing) {
      const p = this.placing;
      if (a === 'left') p.x = clamp(p.x - 0.025, 0, 1);
      else if (a === 'right') p.x = clamp(p.x + 0.025, 0, 1);
      else if (a === 'up') p.layer = Math.max(0, p.layer - 1) as 0 | 1 | 2;
      else if (a === 'down') p.layer = Math.min(2, p.layer + 1) as 0 | 1 | 2;
      else if (a === 'confirm') {
        if (p.moveUid) {
          const item = this.tank.decor.find((d) => d.uid === p.moveUid);
          if (item) {
            item.x = p.x;
            item.layer = p.layer;
            item.flip = p.x > 0.5;
          }
          this.c.ui.toast('Moved.', 'good', 1200);
          this.backToChoose();
        } else {
          const r = this.c.perform(addDecor(this.c.state, this.tank, p.defId, p.x, p.layer), true);
          if (r.ok) this.c.ui.toast(r.message, 'good', 1500);
          this.refreshInfo();
        }
      } else if (a === 'back' || a === 'menu') this.backToChoose();
      this.setHint();
      return true;
    }
    if (this.mode === 'edit') {
      const list = this.tank.decor;
      if (!list.length) {
        this.backToChoose();
        return true;
      }
      if (a === 'left' || a === 'up' || a === 'tabPrev') this.editIndex = (this.editIndex - 1 + list.length) % list.length;
      else if (a === 'right' || a === 'down' || a === 'tab') this.editIndex = (this.editIndex + 1) % list.length;
      else if (a === 'confirm') {
        const d = list[this.editIndex];
        this.startPlace(d.defId, d.uid, d.x, d.layer);
        return true;
      } else if (a === 'remove' || a === 'feed') {
        const d = list[this.editIndex];
        this.c.perform(removeDecorItem(this.c.state, this.tank, d.uid));
        this.editIndex = Math.max(0, this.editIndex - 1);
        this.refreshInfo();
        if (!this.tank.decor.length) this.backToChoose();
      } else if (a === 'back' || a === 'menu') this.backToChoose();
      this.setHint();
      return true;
    }
    return true;
  }

  close(): void {
    this.cursor.destroy();
    this.c.ui.remove(this);
  }

  onClose(): void {
    if (this.cursor.active) this.cursor.destroy();
  }
}
