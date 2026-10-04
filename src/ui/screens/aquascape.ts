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
import { decorRefusal, MAX_DECOR, placeDecorFromStorage, plantFromStorage, removeToStorage, sizeLabel } from '../../sim/plants';
import { addDecor, ownsBackground, ownsSubstrate, setBackground, setSubstrate } from '../../sim/tank';
import { h } from '../dom';
import { Menu, type MenuItem } from '../menu';
import type { Screen } from '../ui';
import { groupPotted, openPlantActions } from './plants';
import { explainPlacement, type ScapeExplanation } from '../../sim/scapePreview';
import { coralSizeLabel, NEW_CORAL_SIZE } from '../../sim/reef';
import { openCoral } from './reef';

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
  private hintText: HTMLElement;
  private placeInfo: HTMLElement;
  private placeButtons: HTMLElement;
  private upBtn: HTMLElement;
  private downBtn: HTMLElement;
  private panel: HTMLElement;
  /** Key of the explanation last rendered (avoids rebuilding the DOM every frame). */
  private explainKey = '';
  private placing: Placing | null = null;
  private editIndex = 0;
  private cursor: Phaser.GameObjects.Graphics;
  private time = 0;
  private mainIndex = 0;
  /** Substrates or backgrounds offered for this tank (enclosures differ from aquariums). */
  private lookList: Array<{ id: string }> = [];

  constructor(private c: GameController, private scene: TankScene) {
    this.menu = new Menu([], { onChange: () => this.onBrowse() });
    this.title = h('div', { class: 'panel-title' }, 'Aquascape');
    this.info = h('div', { class: 'aq-info' });
    this.hintText = h('div', { class: 'aq-hint-text' });
    this.placeInfo = h('div', { class: 'aq-place-info' });
    const pb = (label: string, a: Action, cls = '') => h('button', { class: `tv-btn aq-pb ${cls}`, type: 'button', onclick: (e: Event) => { e.stopPropagation(); this.handle(a); } }, label);
    // On-screen placement controls (touch screens have no d-pad in the tank view).
    this.upBtn = pb('▲ Back', 'up');
    this.downBtn = pb('▼ Front', 'down');
    this.placeButtons = h('div', { class: 'aq-place-buttons' },
      pb('◀', 'left'), pb('▶', 'right'), this.upBtn, this.downBtn, pb('Place', 'confirm', 'aq-pb-ok'), pb('Cancel', 'back'));
    this.hint = h('div', { class: 'aq-hint' }, this.placeInfo, this.hintText, this.placeButtons);
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
    const stored = Object.entries(s.storage.decor).filter(([id, n]) => n > 0 && !decorRefusal(s, t, id, false));
    list.push({ label: 'In your stockroom', header: true });
    if (!potted.length && !stored.length) list.push({ label: 'Nothing stored yet', disabled: true, hint: 'Uprooted plants, cuttings and removed decor are kept here.' });
    for (const g of potted) {
      const best = [...g.items].sort((a, b) => b.size - a.size)[0];
      const coral = getDecor(g.defId).kind === 'coral';
      // Corals only go in marine tanks and plants only in freshwater; skip what cannot be placed here.
      if (coral !== (t.waterType === 'marine')) continue;
      if (decorRefusal(s, t, g.defId, false)) continue;
      list.push({
        label: `${getDecor(g.defId).name} (${coral ? coralSizeLabel(best.size).toLowerCase() : g.stage}) ×${g.items.length}`,
        right: 'Owned',
        hint: `${coral ? 'Place this frag here for free: it grows into a colony.' : 'Plant one here for free.'} ${getDecor(g.defId).description}`,
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
      // Marine tanks take rock, caves and corals, not freshwater plants or wood; live rock and corals are marine only.
      if (marine ? d.kind === 'plant' || d.kind === 'wood' : d.marineOnly) continue;
      // Enclosure items only in enclosures; aquatic plants not in dry enclosures.
      if (d.land && !t.habitat) continue;
      if (!d.land && d.kind === 'plant' && (t.habitat === 'vivarium' || t.habitat === 'terrarium')) continue;
      const size = d.kind === 'plant' ? NEW_PLANT_SIZE : d.kind === 'coral' ? NEW_CORAL_SIZE : 1;
      if ((d.level ?? 1) > s.shopLevel) {
        list.push({ label: d.name, right: `Level ${d.level}`, disabled: true, hint: `${d.description} Sold once the shop reaches level ${d.level} (Shop Progression at the office PC).` });
        continue;
      }
      list.push({
        label: d.name,
        right: formatMoney(d.cost),
        hint: `${d.description}${d.kind === 'plant' ? ' Arrives as a young plant and grows.' : d.kind === 'coral' ? ' Arrives as a small colony on rock and grows.' : ''}`,
        action: () => this.startPlace({ defId: d.id, x: 0.5, layer: 1, size, source: 'buy' }),
        preview: { defId: d.id, x: 0.5, layer: 1, size, source: 'buy' },
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
      if (p) this.showExplanation(p, this.info, true);
      else this.refreshInfo();
    } else if (this.mode === 'substrate') {
      const id = this.lookList[this.menu.index]?.id;
      if (id) this.renderer.setLook({ substrateId: id });
    } else if (this.mode === 'background') {
      const id = this.lookList[this.menu.index]?.id;
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
    // Enclosures use land substrates and back walls; aquariums the aquatic ones (paludariums both).
    const fits = (it: { land?: unknown }) => (t.habitat === 'paludarium' ? true : !!t.habitat === !!it.land);
    const list = (kind === 'substrate' ? SUBSTRATES : BACKGROUNDS).filter(fits);
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
    this.lookList = list;
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
    this.explainKey = '';
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
    if (def.kind === 'coral') items.push({ label: 'Coral details and fragging', action: () => { this.c.ui.remove(scr); openCoral(this.c, t.id, d.uid, () => this.refreshInfo()); } });
    items.push(
      { label: 'Move to stockroom', hint: 'Keep it to reuse or sell later.', action: () => { this.c.perform(removeToStorage(this.c.state, t, d.uid)); this.c.ui.remove(scr); this.editIndex = Math.max(0, this.editIndex - 1); this.refreshInfo(); if (!t.decor.length) this.showMain(); } },
      { label: 'Cancel', action: () => this.c.ui.remove(scr) },
    );
    const scr = this.c.ui.menu({ title: def.name, items, body: h('div', { class: 'small' }, def.kind === 'plant' ? `${sizeLabel(d.size)}, ${Math.round(d.size * 100)}% grown, health ${Math.round(d.health * 100)}%.` : def.kind === 'coral' ? `${coralSizeLabel(d.size)}, ${Math.round(d.size * 100)}% grown, health ${Math.round(d.health * 100)}%${(d.bleach ?? 0) > 0.1 ? `, ${Math.round((d.bleach ?? 0) * 100)}% bleached` : ''}.` : def.description) });
  }

  // -------------------------------------------------------------------------

  private setHint(override?: string): void {
    const placing = this.mode === 'place' && !!this.placing;
    this.placeButtons.style.display = placing ? '' : 'none';
    this.el?.classList.toggle('placing', placing);
    if (!placing) this.placeInfo.replaceChildren();
    if (override) {
      this.hintText.textContent = override;
      return;
    }
    if (this.mode === 'place' && this.placing) {
      const def = getDecor(this.placing.defId);
      const cost = this.placing.source === 'buy' ? ` for ${formatMoney(def.cost)}` : this.placing.source === 'move' ? '' : ' (from stockroom)';
      // Corals use the same three steps for height on the rockwork: top, middle, sand.
      const coral = def.kind === 'coral';
      this.upBtn.textContent = coral ? '▲ Higher' : '▲ Back';
      this.downBtn.textContent = coral ? '▼ Lower' : '▼ Front';
      const where = coral ? `height (${['top of rock', 'middle of rock', 'sand'][this.placing.layer]})` : `depth (${['back', 'middle', 'front'][this.placing.layer]})`;
      this.hintText.textContent = `${this.placing.source === 'move' ? 'Moving' : 'Placing'} ${def.name}${cost} · ◀▶ position · ▲▼ ${where} · Z confirm · X cancel`;
    } else if (this.mode === 'edit') {
      const d = this.tank.decor[this.editIndex];
      this.hintText.textContent = d ? `${getDecor(d.defId).name}${getDecor(d.defId).kind === 'plant' ? ` (${sizeLabel(d.size)})` : ''} · ◀▶ select · Z options · R to stockroom · X back` : '';
    } else {
      this.hintText.textContent = 'Highlight an item to see what it adds and its effect on the score before you buy or place it.';
    }
  }

  /**
   * Explains the highlighted or placed item from the real scoring (see
   * sim/scapePreview.ts): what it provides, the score now and after, which
   * parts of the score move, caps, the fish's needs and trade-offs.
   */
  private showExplanation(p: Placing, into: HTMLElement, compact: boolean): void {
    const key = `${compact}|${p.defId}|${p.x.toFixed(3)}|${p.layer}|${p.size}|${p.source}|${p.moveUid ?? ''}|${this.tank.decor.length}|${this.c.state.money >= getDecor(p.defId).cost}`;
    if (into === this.placeInfo ? key === this.explainKey : false) return;
    if (into === this.placeInfo) this.explainKey = key;
    const ex = explainPlacement(this.c.state, this.tank.id, { defId: p.defId, x: p.x, layer: p.layer, size: p.size, source: p.source, potUid: p.potUid, moveUid: p.moveUid });
    into.replaceChildren(explanationEl(ex, compact));
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
      this.el.classList.toggle('ghost-right', p.x > 0.5);
      // Short phone screens in landscape get the short version so the buttons stay visible.
      const short = document.body.classList.contains('compact') && document.body.classList.contains('landscape');
      this.showExplanation(p, this.placeInfo, short);
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

/** Compact, mobile-friendly explanation block. Score lines and fish care are kept visibly separate. */
export function explanationEl(ex: ScapeExplanation, compact: boolean): HTMLElement {
  const d = ex.layoutAfter - ex.layoutBefore;
  const sign = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}`;
  const rows: HTMLElement[] = [];
  rows.push(
    h('div', { class: 'aq-ex-score' },
      h('span', null, 'Layout score '),
      h('b', null, `${Math.round(ex.layoutBefore)} → ${Math.round(ex.layoutAfter)}`),
      h('span', { class: d > 0.05 ? 'good' : d < -0.05 ? 'bad' : 'dim' }, ` (${sign(d)})`),
      ex.layoutGrown !== undefined ? h('span', { class: 'dim' }, ` · grown ${Math.round(ex.layoutGrown)}`) : null),
  );
  if (!ex.allowed) rows.push(h('div', { class: 'bad' }, ex.refusal ?? 'Cannot be placed here.'));
  else if (ex.cost > 0) rows.push(h('div', { class: ex.affordable ? 'small' : 'small bad' }, ex.affordable ? `Costs ${formatMoney(ex.cost)}` : `Costs ${formatMoney(ex.cost)}: not enough money`));
  if (ex.provides.length) rows.push(h('div', { class: 'aq-ex-line' }, h('span', { class: 'aq-ex-k' }, 'Gives '), ex.provides.slice(0, compact ? 2 : 6).join(' · ')));
  if (ex.changes.length) {
    rows.push(
      h('div', { class: 'aq-ex-line' }, h('span', { class: 'aq-ex-k' }, 'Score '),
        ex.changes.slice(0, compact ? 3 : 8).map((c) => `${c.label} ${sign(c.after - c.before)} (${Math.round(c.after * 10) / 10}/${c.max})`).join(' · ')),
    );
  } else if (ex.allowed) rows.push(h('div', { class: 'aq-ex-line dim' }, 'Score: no change'));
  if (!compact && ex.limits.length) rows.push(h('div', { class: 'aq-ex-line dim' }, h('span', { class: 'aq-ex-k' }, 'Limits '), ex.limits.join(' · ')));
  if (ex.coral) {
    const k = ex.coral;
    const inR = (v: number, r: [number, number]) => v >= r[0] && v <= r[1];
    rows.push(
      h('div', { class: 'aq-ex-care' },
        h('span', { class: 'aq-ex-k' }, 'Coral '),
        h('span', null, `${k.where}: `),
        h('span', { class: inR(k.par, k.parRange) ? 'good' : 'warn' }, `${inR(k.par, k.parRange) ? '✔' : '✘'} light ${k.par} PAR (wants ${k.parRange[0]}-${k.parRange[1]}) `),
        h('span', { class: inR(k.flow, k.flowRange) ? 'good' : 'warn' }, `${inR(k.flow, k.flowRange) ? '✔' : '✘'} flow ${k.flow.toFixed(2)} (wants ${k.flowRange[0]}-${k.flowRange[1]}) `),
        h('span', { class: 'dim' }, `· growth ${Math.round(k.growthFactor * 100)}% of ideal`)),
    );
    const other = k.lines.filter((l) => !l.good && !/^Too (dim|bright)|^Too (little|much)/.test(l.text));
    if (other.length) rows.push(h('div', { class: 'aq-ex-line warn' }, ...other.slice(0, compact ? 1 : 3).map((l) => h('span', null, `✘ ${l.text} `))));
  }
  if (ex.care.length) {
    rows.push(
      h('div', { class: 'aq-ex-care' },
        h('span', { class: 'aq-ex-k' }, 'Fish care '),
        ...ex.care.slice(0, compact ? 1 : 4).map((c) => h('span', { class: c.good ? 'good' : 'warn' }, `${c.good ? '✔' : '✘'} ${c.text} `))),
    );
  }
  if (ex.tradeoffs.length) rows.push(h('div', { class: 'aq-ex-line warn' }, h('span', { class: 'aq-ex-k' }, 'Trade-off '), ex.tradeoffs.slice(0, compact ? 1 : 3).join(' · ')));
  return h('div', { class: `aq-ex ${compact ? 'compact' : ''}` }, ...rows);
}
