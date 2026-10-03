/**
 * Aquascape editor. Everything is previewed in the tank before it is
 * committed: substrates and backgrounds are shown live while browsing, decor
 * and plants appear as a translucent ghost that can be positioned, and
 * Cancel restores the tank exactly.
 */
import { coverPercent } from '../../sim/habitat';
import type Phaser from 'phaser';
import type { GameController } from '../../game/GameController';
import type { Action } from '../../input/input';
import { clamp, formatMoney } from '../../core/math';
import { BACKGROUNDS, DECOR, FLOATING, getBackground, getDecor, getFloating, getSubstrate, SUBSTRATES } from '../../data/catalog';
import { buyFloating, plantFloatingFromStorage } from '../../sim/floating';
import { getSpecies } from '../../data/species';
import type { TankScene } from '../../render/scenes/TankScene';
import { RES } from '../../render/res';
import { summarizeAquascape } from '../../sim/aquascape';
import { fishInTank } from '../../sim/fish';
import { MAX_DECOR, placeDecorFromStorage, plantFromStorage, removeToStorage, sizeLabel } from '../../sim/plants';
import { addDecor, ownsBackground, ownsSubstrate, setBackground, setSubstrate } from '../../sim/tank';
import { h } from '../dom';
import { Menu, type MenuItem } from '../menu';
import type { Screen } from '../ui';
import { groupPotted, openPlantActions } from './plants';

type Mode = 'main' | 'substrate' | 'background' | 'place' | 'edit';

interface Placing {
  defId: string;
  x: number;
  layer: 0 | 1 | 2;
  size: number;
  /** Where the item comes from. */
  source: 'buy' | 'storage-decor' | 'storage-plant' | 'move';
  potUid?: string;
  moveUid?: string;
}

const NEW_PLANT_SIZE = 0.6;

export class AquascapeScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  private mode: Mode = 'main';
  private menu: Menu;
  private title: HTMLElement;
  private info: HTMLElement;
  private hint: HTMLElement;
  private panel: HTMLElement;
  private placing: Placing | null = null;
  private editIndex = 0;
  private cursor: Phaser.GameObjects.Graphics;
  private time = 0;
  private mainIndex = 0;

  constructor(private c: GameController, private scene: TankScene) {
    this.menu = new Menu([], { onChange: () => this.onBrowse() });
    this.title = h('div', { class: 'panel-title' }, 'Aquascape');
    this.info = h('div', { class: 'aq-info' });
    this.hint = h('div', { class: 'aq-hint' });
    this.panel = h('div', { class: 'panel aq-panel' }, this.title, this.info, this.menu.el);
    this.el = h('div', { class: 'aquascape-ui' }, this.panel, this.hint);
    this.cursor = scene.add.graphics().setDepth(45);
    this.showMain();
  }

  private get tank() {
    return this.c.state.tanks[this.scene.tankId];
  }

  private get renderer() {
    return this.scene.tankRenderer;
  }

  // -------------------------------------------------------------------------
  // Menus

  private showMain(index = this.mainIndex): void {
    this.mode = 'main';
    this.placing = null;
    this.renderer.setLook({});
    this.renderer.setGhost(null);
    this.renderer.setFloatingPreview(null);
    this.panel.style.display = '';
    this.title.textContent = 'Aquascape';
    this.menu.setItems(this.mainItems(), index);
    this.refreshInfo();
    this.onBrowse();
  }

  private mainItems(): MenuItem[] {
    const s = this.c.state;
    const t = this.tank;
    const list: MenuItem[] = [
      { label: `Substrate: ${getSubstrate(t.substrateId).name}`, hint: 'Browse substrates. Each one is shown in the tank before you buy.', action: () => this.showLookList('substrate') },
      { label: `Background: ${getBackground(t.backgroundId).name}`, hint: 'Browse backgrounds with a live preview.', action: () => this.showLookList('background') },
      { label: `Edit placed items (${t.decor.length})`, disabled: !t.decor.length, hint: 'Move items, take plant cuttings, or put things back in the stockroom.', action: () => this.enterEdit() },
    ];
    // Stockroom: owned items, shown with quantities instead of prices.
    const potted = groupPotted(s.storage.plants.filter((p) => !p.reservedBy));
    const stored = Object.entries(s.storage.decor).filter(([, n]) => n > 0);
    list.push({ label: 'In your stockroom', header: true });
    if (!potted.length && !stored.length) list.push({ label: 'Nothing stored yet', disabled: true, hint: 'Uprooted plants, cuttings and removed decor are kept here.' });
    for (const g of potted) {
      const best = [...g.items].sort((a, b) => b.size - a.size)[0];
      list.push({
        label: `${getDecor(g.defId).name} (${g.stage}) ×${g.items.length}`,
        right: 'Owned',
        hint: `Plant one here for free. ${getDecor(g.defId).description}`,
        action: () => this.startPlace({ defId: g.defId, x: 0.5, layer: 1, size: best.size, source: 'storage-plant', potUid: best.uid }),
        preview: { defId: g.defId, x: 0.5, layer: 1, size: best.size, source: 'storage-plant' },
      } as MenuItem);
    }
    for (const [defId, n] of stored) {
      list.push({
        label: `${getDecor(defId).name} ×${n}`,
        right: 'Owned',
        hint: `Place it for free. ${getDecor(defId).description}`,
        action: () => this.startPlace({ defId, x: 0.5, layer: 1, size: 1, source: 'storage-decor' }),
        preview: { defId, x: 0.5, layer: 1, size: 1, source: 'storage-decor' },
      } as MenuItem);
    }
    const floatStore = Object.entries(s.storage.floating ?? {}).filter(([, n]) => n > 0);
    for (const [id, n] of floatStore) {
      list.push({
        label: `${getFloating(id).name} ×${n} portions`,
        right: 'Owned',
        hint: 'Float one portion on this tank\'s surface. It spreads by itself.',
        action: () => { this.c.perform(plantFloatingFromStorage(s, t, id)); this.refreshMain(); },
        floatPreview: id,
      } as MenuItem);
    }
    list.push({ label: 'Buy new', header: true });
    for (const f of FLOATING) {
      list.push({
        label: `${f.name} (floating, 1 portion)`,
        right: formatMoney(f.cost),
        hint: `${f.description} Shown on the surface now; confirm to buy.`,
        action: () => { this.c.perform(buyFloating(s, t, f.id)); this.refreshMain(); },
        floatPreview: f.id,
      } as MenuItem);
    }
    const marine = t.waterType === 'marine';
    for (const d of DECOR) {
      // Marine tanks take rock and caves, not freshwater plants or wood; live rock is marine only.
      if (marine ? d.kind === 'plant' || d.kind === 'wood' : d.marineOnly) continue;
      list.push({
        label: d.name,
        right: formatMoney(d.cost),
        hint: `${d.description}${d.kind === 'plant' ? ' Arrives as a young plant and grows.' : ''}`,
        action: () => this.startPlace({ defId: d.id, x: 0.5, layer: 1, size: d.kind === 'plant' ? NEW_PLANT_SIZE : 1, source: 'buy' }),
        preview: { defId: d.id, x: 0.5, layer: 1, size: d.kind === 'plant' ? NEW_PLANT_SIZE : 1, source: 'buy' },
      } as MenuItem);
    }
    list.push({ label: 'Done', action: () => this.close() });
    this.previews = list.map((it) => (it as MenuItem & { preview?: Placing }).preview ?? null);
    this.floatPreviews = list.map((it) => (it as MenuItem & { floatPreview?: string }).floatPreview ?? null);
    return list;
  }

  /** Preview for each main-list row (null for rows without one). */
  private previews: Array<Placing | null> = [];
  private floatPreviews: Array<string | null> = [];

  private refreshMain(): void {
    const i = this.menu.index;
    this.menu.setItems(this.mainItems(), i);
    this.onBrowse();
  }

  /** Item currently highlighted in the main list, for the live ghost preview. */
  private browsePreview(): Placing | null {
    return this.previews[this.menu.index] ?? null;
  }

  private onBrowse(): void {
    if (this.mode === 'main') {
      const p = this.browsePreview();
      this.renderer.setGhost(p ? { defId: p.defId, x: p.x, layer: p.layer, size: p.size } : null);
      const fp = this.floatPreviews[this.menu.index] ?? null;
      this.renderer.setFloatingPreview(fp);
      this.setHint(p ? 'Preview shown in the tank. Confirm to position it.' : fp ? 'Preview shown on the surface.' : undefined);
    } else if (this.mode === 'substrate') {
      const id = SUBSTRATES[this.menu.index]?.id;
      if (id) this.renderer.setLook({ substrateId: id });
    } else if (this.mode === 'background') {
      const id = BACKGROUNDS[this.menu.index]?.id;
      if (id) this.renderer.setLook({ backgroundId: id });
    }
  }

  private showLookList(kind: 'substrate' | 'background'): void {
    this.mainIndex = this.menu.index;
    this.mode = kind;
    this.renderer.setGhost(null);
    this.renderer.setFloatingPreview(null);
    const t = this.tank;
    this.title.textContent = kind === 'substrate' ? 'Substrate' : 'Background';
    const list = kind === 'substrate' ? SUBSTRATES : BACKGROUNDS;
    const items: MenuItem[] = list.map((it) => {
      const current = kind === 'substrate' ? t.substrateId === it.id : t.backgroundId === it.id;
      const owned = kind === 'substrate' ? ownsSubstrate(t, it.id) : ownsBackground(t, it.id);
      return {
        label: it.name,
        right: current ? 'Current' : it.cost === 0 ? 'Free' : owned ? 'Owned' : formatMoney(it.cost),
        hint: current ? 'Already in this tank.' : owned ? 'You own this for this tank. Switching is free.' : `Buy for ${formatMoney(it.cost)}. Preview shown in the tank.`,
        action: () => this.confirmLook(kind, it.id),
      };
    });
    const start = list.findIndex((it) => (kind === 'substrate' ? t.substrateId : t.backgroundId) === it.id);
    this.menu.setItems(items, Math.max(0, start));
    this.setHint('▲▼ preview in the tank · Z confirm · X cancel (restores the tank)');
    this.onBrowse();
  }

  private confirmLook(kind: 'substrate' | 'background', id: string): void {
    const t = this.tank;
    const current = kind === 'substrate' ? t.substrateId : t.backgroundId;
    if (current === id) {
      this.showMain();
      return;
    }
    const def = kind === 'substrate' ? getSubstrate(id) : getBackground(id);
    const owned = kind === 'substrate' ? ownsSubstrate(t, id) : ownsBackground(t, id);
    const cost = owned ? 'free (owned)' : formatMoney(def.cost);
    const extra = kind === 'substrate' ? ' Changing substrate stirs up the water and stresses the fish a little.' : '';
    void this.c.ui.ask(null, `Use ${def.name} in ${t.name}? Cost: ${cost}.${extra}`, ['Confirm', 'Cancel']).then((i) => {
      if (i !== 0) return; // stay in the list with the preview still showing
      const r = this.c.perform(kind === 'substrate' ? setSubstrate(this.c.state, t, id) : setBackground(this.c.state, t, id));
      if (r.ok) this.showMain();
    });
  }

  // -------------------------------------------------------------------------
  // Placement

  private startPlace(p: Placing): void {
    if (p.source !== 'move' && this.tank.decor.length >= MAX_DECOR) {
      this.c.ui.toast('This tank is full. Move something to the stockroom first.', 'warn');
      return;
    }
    if (this.mode === 'main') this.mainIndex = this.menu.index;
    this.mode = 'place';
    this.placing = p;
    this.panel.style.display = 'none';
    this.setHint();
  }

  private confirmPlace(): void {
    const p = this.placing;
    if (!p) return;
    const s = this.c.state;
    const t = this.tank;
    if (p.source === 'move' && p.moveUid) {
      const item = t.decor.find((d) => d.uid === p.moveUid);
      if (item) {
        item.x = p.x;
        item.layer = p.layer;
        item.flip = p.x > 0.5;
      }
      this.c.ui.toast('Moved.', 'good', 1200);
      this.enterEdit();
      return;
    }
    const r =
      p.source === 'buy' ? addDecor(s, t, p.defId, p.x, p.layer)
      : p.source === 'storage-plant' ? plantFromStorage(s, t, p.potUid!, p.x, p.layer)
      : placeDecorFromStorage(s, t, p.defId, p.x, p.layer);
    this.c.perform(r, true);
    if (r.ok) this.c.ui.toast(r.message, 'good', 1500);
    // Keep placing more of the same if there is more to place.
    if (r.ok && p.source === 'storage-plant') {
      const next = s.storage.plants.find((x) => x.defId === p.defId && !x.reservedBy && sizeLabel(x.size) === sizeLabel(p.size));
      if (next) {
        p.potUid = next.uid;
        p.size = next.size;
        return;
      }
      this.showMain();
      return;
    }
    if (r.ok && p.source === 'storage-decor' && !(s.storage.decor[p.defId] > 0)) this.showMain();
    this.refreshInfo();
  }

  private enterEdit(): void {
    if (!this.tank.decor.length) {
      this.showMain();
      return;
    }
    if (this.mode === 'main') this.mainIndex = this.menu.index;
    this.mode = 'edit';
    this.placing = null;
    this.renderer.setGhost(null);
    this.renderer.setFloatingPreview(null);
    this.panel.style.display = 'none';
    this.editIndex = clamp(this.editIndex, 0, this.tank.decor.length - 1);
    this.setHint();
  }

  private editItemMenu(): void {
    const t = this.tank;
    const d = t.decor[this.editIndex];
    if (!d) return;
    const def = getDecor(d.defId);
    const items: MenuItem[] = [
      { label: 'Move', action: () => { this.c.ui.remove(scr); this.startPlace({ defId: d.defId, x: d.x, layer: d.layer, size: d.size, source: 'move', moveUid: d.uid }); } },
    ];
    if (def.kind === 'plant') items.push({ label: 'Cuttings and trimming', action: () => { this.c.ui.remove(scr); openPlantActions(this.c, t, d.uid, () => this.refreshInfo()); } });
    items.push(
      { label: 'Move to stockroom', hint: 'Keep it to reuse or sell later.', action: () => { this.c.perform(removeToStorage(this.c.state, t, d.uid)); this.c.ui.remove(scr); this.editIndex = Math.max(0, this.editIndex - 1); this.refreshInfo(); if (!t.decor.length) this.showMain(); } },
      { label: 'Cancel', action: () => this.c.ui.remove(scr) },
    );
    const scr = this.c.ui.menu({ title: def.name, items, body: h('div', { class: 'small' }, def.kind === 'plant' ? `${sizeLabel(d.size)}, ${Math.round(d.size * 100)}% grown, health ${Math.round(d.health * 100)}%.` : def.description) });
  }

  // -------------------------------------------------------------------------

  private setHint(override?: string): void {
    if (override) {
      this.hint.textContent = override;
      return;
    }
    if (this.mode === 'place' && this.placing) {
      const def = getDecor(this.placing.defId);
      const cost = this.placing.source === 'buy' ? ` for ${formatMoney(def.cost)}` : this.placing.source === 'move' ? '' : ' (from stockroom)';
      this.hint.textContent = `${this.placing.source === 'move' ? 'Moving' : 'Placing'} ${def.name}${cost} · ◀▶ position · ▲▼ depth (${['back', 'middle', 'front'][this.placing.layer]}) · Z confirm · X cancel`;
    } else if (this.mode === 'edit') {
      const d = this.tank.decor[this.editIndex];
      this.hint.textContent = d ? `${getDecor(d.defId).name}${getDecor(d.defId).kind === 'plant' ? ` (${sizeLabel(d.size)})` : ''} · ◀▶ select · Z options · R to stockroom · X back` : '';
    } else {
      this.hint.textContent = 'Plants give cover and absorb nitrate. Caves give territories. Wood suits plecos. Variety and balance raise your score.';
    }
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
      h('div', { class: 'row' }, h('span', null, 'Layout score'), h('b', null, `${Math.round(sc.layout)}`)),
      h('div', { class: 'row small' }, h('span', null, `Plants ${sc.plants} · Cave spaces ${sc.caveSlots} · Cover ${coverPercent(sc)}% · Items ${t.decor.length}/${MAX_DECOR}`)),
      h('div', { class: 'small' }, needs.join(' · ')),
      h('div', { class: 'small' }, `Money: ${formatMoney(this.c.state.money)}`),
    );
  }

  update(dt: number): void {
    this.time += dt;
    const g = this.cursor;
    g.clear();
    if (this.mode === 'place' && this.placing) {
      const p = this.placing;
      this.renderer.setGhost({ defId: p.defId, x: p.x, layer: p.layer, size: p.size });
      if (p.moveUid) {
        // Show where the item currently is while moving.
        const item = this.tank.decor.find((d) => d.uid === p.moveUid);
        if (item) {
          const b = this.renderer.decorBounds(item);
          g.lineStyle(RES, 0x7af2ff, 0.4).strokeRect(b.x, b.y, b.w, b.h);
        }
      }
    } else if (this.mode === 'edit') {
      const d = this.tank.decor[this.editIndex];
      if (d) {
        const b = this.renderer.decorBounds(d);
        g.lineStyle(RES, 0x7af2ff, 0.6 + Math.sin(this.time * 6) * 0.3).strokeRect(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h));
      }
    }
  }

  handle(a: Action): boolean {
    if (this.mode === 'main' || this.mode === 'substrate' || this.mode === 'background') {
      if (this.menu.handle(a)) return true;
      if (a === 'back' || a === 'menu') {
        if (this.mode === 'main') this.close();
        else this.showMain(); // cancel: restores the real substrate/background
      }
      return true;
    }
    if (this.mode === 'place' && this.placing) {
      const p = this.placing;
      if (a === 'left') p.x = clamp(p.x - 0.025, 0, 1);
      else if (a === 'right') p.x = clamp(p.x + 0.025, 0, 1);
      else if (a === 'up') p.layer = Math.max(0, p.layer - 1) as 0 | 1 | 2;
      else if (a === 'down') p.layer = Math.min(2, p.layer + 1) as 0 | 1 | 2;
      else if (a === 'confirm') this.confirmPlace();
      else if (a === 'back' || a === 'menu') {
        if (p.source === 'move') this.enterEdit();
        else this.showMain();
        return true;
      }
      this.setHint();
      return true;
    }
    if (this.mode === 'edit') {
      const list = this.tank.decor;
      if (!list.length) {
        this.showMain();
        return true;
      }
      if (a === 'left' || a === 'up' || a === 'tabPrev') this.editIndex = (this.editIndex - 1 + list.length) % list.length;
      else if (a === 'right' || a === 'down' || a === 'tab') this.editIndex = (this.editIndex + 1) % list.length;
      else if (a === 'confirm') this.editItemMenu();
      else if (a === 'remove' || a === 'feed') {
        const d = list[this.editIndex];
        this.c.perform(removeToStorage(this.c.state, this.tank, d.uid));
        this.editIndex = Math.max(0, this.editIndex - 1);
        this.refreshInfo();
        if (!this.tank.decor.length) this.showMain();
      } else if (a === 'back' || a === 'menu') this.showMain();
      this.setHint();
      return true;
    }
    return true;
  }

  close(): void {
    this.c.ui.remove(this);
  }

  onClose(): void {
    this.renderer.setLook({});
    this.renderer.setGhost(null);
    this.renderer.setFloatingPreview(null);
    if (this.cursor.active) this.cursor.destroy();
  }
}
