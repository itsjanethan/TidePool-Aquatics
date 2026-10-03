/**
 * Shop overworld: tile floor, props, animated tanks, the player and customers.
 * Reads simulation state every frame; player input routes through the
 * GameController when no UI screen is open.
 */
import Phaser from 'phaser';
import { controller } from '../../game/GameController';
import type { Action } from '../../input/input';
import { FLOOR1, propAt, TILE, type PropPlacement } from '../../data/shopLayout';
import { customerAt, helpableCustomerNear, queueCustomers } from '../../sim/customers';
import { fishInTank } from '../../sim/fish';
import { getSpecies } from '../../data/species';
import { isShopOpen, minuteOfDay, OPEN_HOUR } from '../../sim/time';
import type { CustomerState } from '../../sim/types';
import { customerPalette, makeCharacterTexture, type Dir } from '../art/characters';
import { OverworldTank } from '../overworldTank';
import { LOGICAL_H, LOGICAL_W, RES } from '../res';
import { h } from '../../ui/dom';
import { openTankMenu } from '../../ui/screens/tankMenu';
import { openOffice } from '../../ui/screens/office';
import { serveAtTill, talkToCustomer } from '../../ui/screens/serve';
import { openPauseMenu } from '../../ui/screens/pause';
import { openStockroom } from '../../ui/screens/office';
import { feedTank } from '../../sim/tank';

const STEP_TIME = 0.17;
const RUN_TIME = 0.1;
const DV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface CustomerView {
  sprite: Phaser.GameObjects.Sprite;
  label: HTMLElement;
}

export class ShopScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private tanks: OverworldTank[] = [];
  private custViews = new Map<string, CustomerView>();
  private move: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  private facing: Dir = 'up';
  private turnDelay = 0;
  private walkAnim = 0;
  private night!: Phaser.GameObjects.Rectangle;
  private queueLabel!: HTMLElement;
  private grid: boolean[][] = [];

  constructor() {
    super('Shop');
  }

  create(): void {
    const c = controller;
    const s = c.state;
    this.grid = c.sim!.grid;
    // The shop is drawn at logical resolution and zoomed for chunky pixels.
    this.cameras.main.setZoom(RES).centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
    this.add.image(0, 0, 'floor-layer').setOrigin(0, 0).setDepth(-100);
    for (const p of FLOOR1.props) {
      if (p.kind === 'tank') this.tanks.push(new OverworldTank(this, p, () => controller.state));
      else {
        const key = `prop-${p.kind}-${p.w}x${p.h}`;
        const img = this.add.image(p.x * TILE, (p.y + p.h) * TILE, key).setOrigin(0, 1).setDepth((p.y + p.h) * TILE - 1);
        if (p.kind === 'counter') img.y += 4;
      }
    }
    this.facing = s.player.facing;
    this.player = this.add.sprite(0, 0, 'player', `${this.facing}0`).setOrigin(0.5, 1);
    this.placePlayer(s.player.x, s.player.y);
    this.night = this.add.rectangle(0, 0, 480, 320, 0x0a1430, 0).setOrigin(0, 0).setDepth(9000);
    this.queueLabel = h('div', { class: 'world-label queue-label' });
    c.ui.worldLayer.appendChild(this.queueLabel);

    c.worldInput = (a) => this.onAction(a);
    // Scene event emitters outlive a stop/start, so every listener added here
    // is removed on shutdown (otherwise they stack up each time the scene starts).
    const onWake = () => {
      controller.worldInput = (a) => this.onAction(a);
      controller.hud.setGoalVisible(true);
    };
    const onSleep = () => this.hideLabels();
    this.events.on(Phaser.Scenes.Events.WAKE, onWake);
    this.events.on(Phaser.Scenes.Events.SLEEP, onSleep);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.WAKE, onWake);
      this.events.off(Phaser.Scenes.Events.SLEEP, onSleep);
      this.cleanup();
    });
  }

  private cleanup(): void {
    for (const v of this.custViews.values()) {
      v.sprite.destroy();
      v.label.remove();
    }
    this.custViews.clear();
    for (const t of this.tanks) t.destroy();
    this.tanks = [];
    this.queueLabel?.remove();
    controller.hud.setPrompt(null);
  }

  private hideLabels(): void {
    for (const v of this.custViews.values()) v.label.style.display = 'none';
    this.queueLabel.style.display = 'none';
    controller.hud.setPrompt(null);
  }

  private placePlayer(x: number, y: number): void {
    this.player.setPosition(Math.round(x * TILE + 8), Math.round(y * TILE + 16));
    this.player.setDepth(y * TILE + 16);
  }

  private walkable(x: number, y: number): boolean {
    return !!this.grid[y]?.[x];
  }

  private facingTile(): { x: number; y: number } {
    const s = controller.state;
    const [dx, dy] = DV[this.facing];
    return { x: Math.round(s.player.x) + dx, y: Math.round(s.player.y) + dy };
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    const c = controller;
    if (!c.sim) return;
    const s = c.state;
    const canMove = !c.ui.isBlocking();

    // Player movement (grid based, GBA style: tap to turn, hold to walk).
    if (this.move) {
      this.move.t += dt;
      const k = Math.min(1, this.move.t / this.move.dur);
      s.player.x = this.move.fx + (this.move.tx - this.move.fx) * k;
      s.player.y = this.move.fy + (this.move.ty - this.move.fy) * k;
      this.walkAnim += dt;
      if (k >= 1) {
        this.move = null;
        s.player.x = Math.round(s.player.x);
        s.player.y = Math.round(s.player.y);
      }
    }
    if (!this.move && canMove) {
      const dir = c.input.heldDirection();
      if (dir) {
        if (dir !== this.facing) {
          this.facing = dir;
          this.turnDelay = 0.08;
        } else if (this.turnDelay > 0) {
          this.turnDelay -= dt;
        } else {
          const [dx, dy] = DV[dir];
          const nx = Math.round(s.player.x) + dx;
          const ny = Math.round(s.player.y) + dy;
          if (this.walkable(nx, ny)) {
            const run = c.input.isHeld('run');
            this.move = { fx: s.player.x, fy: s.player.y, tx: nx, ty: ny, t: 0, dur: run ? RUN_TIME : STEP_TIME };
          }
        }
      } else {
        this.turnDelay = 0;
      }
    }
    s.player.facing = this.facing;
    this.placePlayer(s.player.x, s.player.y);
    const frame = this.move ? (Math.floor(this.walkAnim / 0.12) % 2) + 1 : 0;
    this.player.setFrame(`${this.facing}${frame}`);

    for (const t of this.tanks) t.update(dt);
    this.updateCustomers(dt);

    // Night lighting.
    const h = minuteOfDay(s.minute) / 60;
    const dark = h < 7 || h >= 21 ? 0.5 : h < 8 ? 0.5 - (h - 7) * 0.5 : h >= 19 ? (h - 19) * 0.25 : 0;
    this.night.setFillStyle(0x0a1430, dark);

    // Queue indicator.
    const q = queueCustomers(s).length;
    this.queueLabel.style.display = q ? '' : 'none';
    this.queueLabel.textContent = `${q} waiting`;
    setLabelPos(this.queueLabel, FLOOR1.till.x * TILE + 8, FLOOR1.till.y * TILE + 4);

    if (canMove && !this.move) controller.hud.setPrompt(this.promptText());
    else if (!canMove) controller.hud.setPrompt(null);
  }

  private updateCustomers(dt: number): void {
    const s = controller.state;
    const seen = new Set<string>();
    for (const cu of s.customers) {
      seen.add(cu.id);
      let v = this.custViews.get(cu.id);
      if (!v) v = this.createCustomerView(cu);
      const walking = cu.path.length > 0;
      const f = walking ? (Math.floor(cu.walkPhase * 2.4) % 2) + 1 : 0;
      v.sprite.setFrame(`${cu.facing}${f}`);
      const x = Math.round(cu.x * TILE + 8);
      const y = Math.round(cu.y * TILE + 16);
      v.sprite.setPosition(x, y).setDepth(y - 0.5);
      if (cu.thought) {
        v.label.style.display = '';
        v.label.textContent = cu.thought;
        v.label.classList.toggle('help', cu.thought === '?');
        setLabelPos(v.label, x, y - 18);
      } else v.label.style.display = 'none';
    }
    for (const [id, v] of this.custViews) {
      if (!seen.has(id)) {
        v.sprite.destroy();
        v.label.remove();
        this.custViews.delete(id);
      }
    }
    void dt;
  }

  private createCustomerView(cu: CustomerState): CustomerView {
    const key = `cust:${cu.appearance}`;
    if (!this.textures.exists(key)) makeCharacterTexture(this, key, customerPalette(cu.appearance));
    const sprite = this.add.sprite(0, 0, key, 'down0').setOrigin(0.5, 1);
    const label = h('div', { class: 'world-label bubble' });
    controller.ui.worldLayer.appendChild(label);
    const v = { sprite, label };
    this.custViews.set(cu.id, v);
    return v;
  }

  private propInFront(): PropPlacement | undefined {
    const ft = this.facingTile();
    return propAt(FLOOR1, ft.x, ft.y);
  }

  /** Customer directly in front, or (if not at the till) one nearby who wants help. */
  private customerInFront(): CustomerState | null {
    const s = controller.state;
    const ft = this.facingTile();
    const direct = customerAt(s, ft.x, ft.y);
    if (direct && !(this.atTill() && direct.phase === 'queueing')) return direct;
    if (this.atTill()) return null;
    return helpableCustomerNear(s, s.player.x, s.player.y);
  }

  private atTill(): boolean {
    const s = controller.state;
    const ft = this.facingTile();
    const p = propAt(FLOOR1, ft.x, ft.y);
    return p?.kind === 'counter' && this.facing === 'down' && Math.round(s.player.y) === p.y - 1;
  }

  private atDoor(): boolean {
    const ft = this.facingTile();
    return FLOOR1.tiles[ft.y]?.[ft.x] === 'D';
  }

  private promptText(): string | null {
    const s = controller.state;
    const cu = this.customerInFront();
    if (cu) return cu.phase === 'waiting_help' || cu.phase === 'seeking_help' ? `Z: Help ${cu.name}` : `Z: Talk to ${cu.name}`;
    if (this.atTill()) {
      const q = queueCustomers(s).length;
      return q ? `Z: Serve customer (${q} waiting)` : 'Till: nobody waiting';
    }
    const p = this.propInFront();
    if (p?.kind === 'tank') {
      const fish = fishInTank(s, p.id);
      const counts = new Map<string, number>();
      for (const f of fish) counts.set(f.speciesId, (counts.get(f.speciesId) ?? 0) + 1);
      const desc = [...counts].map(([id, n]) => `${getSpecies(id).commonName} x${n}`).join(', ') || 'empty';
      return `Z: ${s.tanks[p.id].name} (${desc})  F: Feed`;
    }
    if (p?.kind === 'desk') return 'Z: Office PC (orders, stock, end day)';
    if (p?.kind === 'shelf') return 'Z: Stockroom shelves';
    if (p?.kind === 'counter') return 'Serve from behind the counter';
    if (this.atDoor()) return minuteOfDay(s.minute) < OPEN_HOUR * 60 ? 'Z: Open up early' : isShopOpen(s.minute) ? 'Z: Front door' : 'Z: Lock up and end the day';
    return null;
  }

  private onAction(a: Action): void {
    const c = controller;
    if (this.move) return;
    if (a === 'menu') {
      openPauseMenu(c);
      return;
    }
    if (a === 'feed') {
      const p = this.propInFront();
      if (p?.kind === 'tank') {
        c.perform(feedTank(c.state, c.state.tanks[p.id], 'normal'));
      }
      return;
    }
    if (a !== 'confirm') return;
    const cu = this.customerInFront();
    if (cu) {
      void talkToCustomer(c, cu);
      return;
    }
    if (this.atTill()) {
      void serveAtTill(c);
      return;
    }
    const p = this.propInFront();
    if (p?.kind === 'tank') openTankMenu(c, p.id);
    else if (p?.kind === 'desk') openOffice(c);
    else if (p?.kind === 'shelf') openStockroom(c);
    else if (p?.kind === 'plant') void c.ui.say(null, 'A healthy pothos. It has outlived three previous owners.');
    else if (p?.kind === 'bench') void c.ui.say(null, 'A bench for customers. Kids like to press their noses on the tanks from here.');
    else if (p?.kind === 'counter') void c.ui.say(null, 'Walk behind the counter and face the customer to serve.');
    else if (this.atDoor()) {
      const open = isShopOpen(c.state.minute);
      const early = minuteOfDay(c.state.minute) < OPEN_HOUR * 60;
      void c.ui.ask(null, early ? 'Open the doors now? (Skips to 09:00)' : open ? 'The shop is open. Close early and end the day?' : 'Lock up and end the day?', [early ? 'Wait until opening' : 'End the day', 'Not yet']).then((i) => {
        if (i === 0) c.endDay();
      });
    }
  }
}

/** Positions a DOM world label at game pixel coordinates. */
export function setLabelPos(el: HTMLElement, x: number, y: number): void {
  el.style.left = `calc(var(--px) * ${x})`;
  el.style.top = `calc(var(--px) * ${y})`;
}
