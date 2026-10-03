/**
 * Shop overworld: tile floor, props, animated tanks, the player and customers.
 * Reads simulation state every frame; player input routes through the
 * GameController when no UI screen is open.
 */
import Phaser from 'phaser';
import { controller } from '../../game/GameController';
import type { Action } from '../../input/input';
import { propAt, TILE, type FloorLayout, type PropPlacement } from '../../data/shopLayout';
import { getFloor, getFloorLayout, stairsArrival } from '../../data/floors';
import { customerAt, customerFloor, helpableCustomerNear, queueCustomers } from '../../sim/customers';
import { floorTextureKey, propTextureKey } from '../art/shopArt';
import { isOnDuty } from '../../sim/staff';
import { openStaffMember } from '../../ui/screens/staff';
import { openRetail } from '../../ui/screens/retail';
import { fishInTank } from '../../sim/fish';
import { getSpecies } from '../../data/species';
import { isShopOpen, minuteOfDay, OPEN_HOUR } from '../../sim/time';
import type { CustomerState, StaffEntity } from '../../sim/types';
import { customerPalette, makeCharacterTexture, staffPalette, type Dir } from '../art/characters';
import { OverworldTank } from '../overworldTank';
import { h } from '../../ui/dom';
import { openTankMenu } from '../../ui/screens/tankMenu';
import { openOffice } from '../../ui/screens/office';
import { serveAtTill, talkToCustomer } from '../../ui/screens/serve';
import { openPauseMenu } from '../../ui/screens/pause';
import { openStockroom } from '../../ui/screens/office';
import { feedTank } from '../../sim/tank';
import { play } from '../../audio/sfx';
import { noteRan, runHint } from '../../input/runHint';
import { stepDuration } from '../walkTiming';
import { clampCentre, setLabelPos, setLabelTransform, shopZoom, view } from '../view';
import { dirBetween, faceToward, planTapPath, type Tile } from '../tapPath';
import { getPrefs } from '../../ui/displayPrefs';

const DV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface CustomerView {
  sprite: Phaser.GameObjects.Sprite;
  label: HTMLElement;
}

interface StaffView extends CustomerView {
  name: HTMLElement;
}

const FACINGS: Dir[] = ['down', 'left', 'up', 'right'];

/** Idle Mode: people stay where they are but look around (purely visual). */
function idleFacing(id: string, t: number, base: Dir): Dir {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const slot = Math.floor(t / (3 + (Math.abs(h) % 4)) + (Math.abs(h) % 7));
  return slot % 3 === 0 ? base : FACINGS[Math.abs(h + slot * 7) % 4];
}

export class ShopScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private tanks: OverworldTank[] = [];
  private custViews = new Map<string, CustomerView>();
  private staffViews = new Map<string, StaffView>();
  private layout!: FloorLayout;
  private clock = 0;
  private move: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  private facing: Dir = 'up';
  private turnDelay = 0;
  private walkAnim = 0;
  private night!: Phaser.GameObjects.Rectangle;
  private queueLabel!: HTMLElement;
  private grid: boolean[][] = [];
  /** Tap to move: remaining tiles and the facing to take at the end. */
  private path: Tile[] = [];
  private pathFace: Dir | null = null;
  private marker!: Phaser.GameObjects.Rectangle;
  /** Smoothed camera centre in world px (NaN until placed). */
  private camX = NaN;
  private camY = NaN;

  constructor() {
    super('Shop');
  }

  create(): void {
    const c = controller;
    const s = c.state;
    // Only the player's current floor is rendered; the others keep simulating.
    if (!s.unlocks.floors.includes(getFloor(s.player.floor).id)) s.player.floor = 'ground';
    this.layout = getFloorLayout(s.player.floor);
    s.player.floor = this.layout.id;
    this.grid = c.sim!.grid;
    // The shop is drawn at logical resolution; the camera zooms in for chunky
    // pixels and follows the player (or shows the whole floor in map view).
    this.camX = NaN;
    this.path = [];
    this.pathFace = null;
    this.add.image(0, 0, floorTextureKey(this.layout)).setOrigin(0, 0).setDepth(-100);
    for (const p of this.layout.props) {
      if (p.kind === 'tank') {
        // Tanks exist once their expansion is built; until then the stand is empty.
        if (s.tanks[p.id]) this.tanks.push(new OverworldTank(this, p, () => controller.state));
        continue;
      }
      const img = this.add.image(p.x * TILE, (p.y + p.h) * TILE, propTextureKey(p)).setOrigin(0, 1).setDepth((p.y + p.h) * TILE - 1);
      if (p.kind === 'counter') img.y += 4;
      if (p.kind === 'stairs') {
        img.setDepth(-50);
        if (p.to && !s.unlocks.floors.includes(p.to)) {
          // Roped off until the expansion is bought.
          const rope = this.add.rectangle(p.x * TILE + 1, (p.y + 1) * TILE, p.w * TILE - 2, 2, 0xc03030).setOrigin(0, 0.5).setDepth(-49);
          this.add.rectangle(p.x * TILE + 1, (p.y + 1) * TILE - 4, 2, 8, 0xd8c070).setOrigin(0, 0.5).setDepth(-49);
          this.add.rectangle((p.x + p.w) * TILE - 3, (p.y + 1) * TILE - 4, 2, 8, 0xd8c070).setOrigin(0, 0.5).setDepth(-49);
          void rope;
        }
      }
    }
    this.facing = s.player.facing;
    this.player = this.add.sprite(0, 0, 'player', `${this.facing}0`).setOrigin(0.5, 1);
    this.placePlayer(s.player.x, s.player.y);
    this.night = this.add.rectangle(0, 0, this.layout.width * TILE, this.layout.height * TILE, 0x0a1430, 0).setOrigin(0, 0).setDepth(9000);
    this.marker = this.add.rectangle(0, 0, TILE - 2, TILE - 2).setStrokeStyle(1, 0xffd45a, 0.9).setDepth(8999).setVisible(false);
    this.updateCamera(0, true);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onTap(p));
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
    for (const v of this.staffViews.values()) {
      v.sprite.destroy();
      v.label.remove();
      v.name.remove();
    }
    this.staffViews.clear();
    for (const t of this.tanks) t.destroy();
    this.tanks = [];
    this.queueLabel?.remove();
    controller.hud.setPrompt(null);
  }

  private hideLabels(): void {
    for (const v of this.custViews.values()) v.label.style.display = 'none';
    for (const v of this.staffViews.values()) {
      v.label.style.display = 'none';
      v.name.style.display = 'none';
    }
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
    this.clock += dt;
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
    if (!canMove) this.clearPath();
    if (!this.move && canMove) {
      const held = c.input.heldDirection();
      if (held) this.clearPath();
      const next = held ? null : this.path[0];
      const dir = held ?? (next ? dirBetween({ x: Math.round(s.player.x), y: Math.round(s.player.y) }, next) : null);
      if (dir) {
        if (dir !== this.facing && held) {
          this.facing = dir;
          this.turnDelay = 0.08;
        } else if (this.turnDelay > 0 && held) {
          this.turnDelay -= dt;
        } else {
          this.facing = dir;
          const [dx, dy] = DV[dir];
          const nx = Math.round(s.player.x) + dx;
          const ny = Math.round(s.player.y) + dy;
          if (this.walkable(nx, ny)) {
            const run = c.input.runHeld();
            if (run) noteRan();
            if (next) this.path.shift();
            this.move = { fx: s.player.x, fy: s.player.y, tx: nx, ty: ny, t: 0, dur: stepDuration(run) };
          } else this.clearPath();
        }
      } else {
        this.turnDelay = 0;
        if (this.pathFace) {
          this.facing = this.pathFace;
          this.pathFace = null;
        }
        if (!this.path.length) this.marker.setVisible(false);
      }
    }
    s.player.facing = this.facing;
    this.placePlayer(s.player.x, s.player.y);
    this.updateCamera(dt, false);
    const frame = this.move ? (Math.floor(this.walkAnim / 0.12) % 2) + 1 : 0;
    this.player.setFrame(`${this.facing}${frame}`);

    for (const t of this.tanks) t.update(dt);
    this.updateCustomers(dt);
    this.updateStaff();

    // Night lighting.
    const h = minuteOfDay(s.minute) / 60;
    const dark = h < 7 || h >= 21 ? 0.5 : h < 8 ? 0.5 - (h - 7) * 0.5 : h >= 19 ? (h - 19) * 0.25 : 0;
    this.night.setFillStyle(0x0a1430, dark);

    // Queue indicator (on the floor with the till).
    const q = queueCustomers(s).length;
    const till = this.layout.till;
    this.queueLabel.style.display = q && till ? '' : 'none';
    this.queueLabel.textContent = `${q} waiting`;
    if (till) setLabelPos(this.queueLabel, till.x * TILE + 8, till.y * TILE + 4);

    if (canMove && !this.move) {
      controller.hud.setPrompt(this.promptText() ?? runHint(c.input.lastDevice));
      controller.worldContext = this.touchContext();
    }
    else if (!canMove) controller.hud.setPrompt(null);
  }

  private updateCustomers(dt: number): void {
    const s = controller.state;
    const seen = new Set<string>();
    const idle = controller.idle;
    for (const cu of s.customers) {
      if (customerFloor(cu) !== this.layout.id) continue;
      seen.add(cu.id);
      let v = this.custViews.get(cu.id);
      if (!v) v = this.createCustomerView(cu);
      const walking = cu.path.length > 0 && !idle;
      const f = walking ? (Math.floor(cu.walkPhase * 2.4) % 2) + 1 : 0;
      v.sprite.setFrame(`${idle ? idleFacing(cu.id, this.clock, cu.facing) : cu.facing}${f}`);
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

  private updateStaff(): void {
    const s = controller.state;
    const idle = controller.idle;
    const seen = new Set<string>();
    const duty = isOnDuty(s.minute);
    for (const m of s.staff) {
      // Off-duty staff have gone home.
      if (m.floor !== this.layout.id || (!duty && m.task?.kind === 'break' && !m.path.length)) continue;
      seen.add(m.id);
      let v = this.staffViews.get(m.id);
      if (!v) v = this.createStaffView(m);
      const walking = m.path.length > 0 && !idle;
      const f = walking ? (Math.floor(m.walkPhase * 3) % 2) + 1 : 0;
      v.sprite.setFrame(`${idle ? idleFacing(m.id, this.clock, m.facing) : m.facing}${f}`);
      const x = Math.round(m.x * TILE + 8);
      const y = Math.round(m.y * TILE + 16);
      v.sprite.setPosition(x, y).setDepth(y - 0.4);
      v.name.style.display = '';
      setLabelPos(v.name, x, y + 1);
      if (m.dialogue && !idle) {
        v.label.style.display = '';
        v.label.textContent = m.dialogue;
        setLabelPos(v.label, x, y - 18);
      } else v.label.style.display = 'none';
    }
    for (const [id, v] of this.staffViews) {
      if (!seen.has(id)) {
        v.sprite.destroy();
        v.label.remove();
        v.name.remove();
        this.staffViews.delete(id);
      }
    }
  }

  private createStaffView(m: StaffEntity): StaffView {
    const key = `staff:${m.appearance}`;
    if (!this.textures.exists(key)) makeCharacterTexture(this, key, staffPalette(m.appearance), true);
    const sprite = this.add.sprite(0, 0, key, 'down0').setOrigin(0.5, 1);
    const label = h('div', { class: 'world-label bubble staff-bubble' });
    const name = h('div', { class: 'world-label staff-name' }, m.name);
    controller.ui.worldLayer.append(label, name);
    const v = { sprite, label, name };
    this.staffViews.set(m.id, v);
    return v;
  }

  private staffInFront(): StaffEntity | null {
    const s = controller.state;
    const ft = this.facingTile();
    return s.staff.find((m) => m.floor === this.layout.id && Math.hypot(m.x - ft.x, m.y - ft.y) < 0.7) ?? null;
  }

  /** Takes the stairs: the scene restarts on the other floor (only the active floor is rendered). */
  private takeStairs(p: PropPlacement): void {
    const c = controller;
    const s = c.state;
    if (!p.to) return;
    if (!s.unlocks.floors.includes(p.to)) {
      void c.ui.say(null, `${getFloorLayout(p.to).name}: closed for now. See Shop Progression at the office PC to open it.`);
      return;
    }
    const arr = stairsArrival(this.layout.id, p);
    s.player.floor = arr.floor;
    s.player.x = arr.x;
    s.player.y = arr.y;
    s.player.facing = arr.facing;
    play('door');
    this.scene.restart();
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
    return propAt(this.layout, ft.x, ft.y);
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
    const p = propAt(this.layout, ft.x, ft.y);
    return p?.kind === 'counter' && this.facing === 'down' && Math.round(s.player.y) === p.y - 1;
  }

  private atDoor(): boolean {
    const ft = this.facingTile();
    return this.layout.tiles[ft.y]?.[ft.x] === 'D';
  }

  private clearPath(): void {
    if (!this.path.length && !this.pathFace) return;
    this.path = [];
    this.pathFace = null;
    this.marker?.setVisible(false);
  }

  /**
   * Fits the camera to the canvas: close to the player (following them) or
   * the whole floor in map view. Publishes the transform for world labels.
   */
  private updateCamera(dt: number, snap: boolean): void {
    const cam = this.cameras.main;
    const cw = this.scale.width;
    const ch = this.scale.height;
    if (cam.width !== cw || cam.height !== ch) cam.setSize(cw, ch);
    const worldW = this.layout.width * TILE;
    const worldH = this.layout.height * TILE;
    const touch = typeof document !== 'undefined' && document.body.classList.contains('has-touch');
    const z = shopZoom(getPrefs().camera, worldW, worldH, cw, ch, view.k, touch ? 2.25 : 2);
    if (cam.zoom !== z) {
      cam.setZoom(z);
      snap = true;
    }
    const vw = cw / z;
    const vh = ch / z;
    const s = controller.state;
    const tx = clampCentre(s.player.x * TILE + 8, worldW, vw);
    const ty = clampCentre(s.player.y * TILE + 8, worldH, vh);
    if (snap || Number.isNaN(this.camX)) {
      this.camX = tx;
      this.camY = ty;
    } else {
      const k = 1 - Math.exp(-dt * 8);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    // Whole canvas pixels keep pixel art steady while the camera glides.
    const cx = Math.round(this.camX * z) / z;
    const cy = Math.round(this.camY * z) / z;
    cam.centerOn(cx, cy);
    const css = z / view.k;
    setLabelTransform(css, (vw / 2 - cx) * css, (vh / 2 - cy) * css);
  }

  /** Tap to move (touch and pen only): walk to the tapped tile, or tap what you face to use it. */
  private onTap(p: Phaser.Input.Pointer): void {
    const c = controller;
    const ev = p.event as PointerEvent | undefined;
    const kind = ev?.pointerType ?? (p.wasTouch ? 'touch' : 'mouse');
    if (kind === 'mouse' || !getPrefs().tapToMove || !c.walking) return;
    const s = c.state;
    const tile = { x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) };
    const here = { x: Math.round(s.player.x), y: Math.round(s.player.y) };
    const ft = this.facingTile();
    const prop = propAt(this.layout, tile.x, tile.y);
    const facingIt = (ft.x === tile.x && ft.y === tile.y) || (!!prop && propAt(this.layout, ft.x, ft.y) === prop);
    if (!this.move && !this.path.length && facingIt) {
      this.onAction('confirm');
      return;
    }
    const approach = prop?.interact?.map((t) => ({ ...t, face: faceToward(t, prop.x, prop.y, prop.w, prop.h) }));
    const plan = planTapPath(this.grid, here, tile, approach);
    if (!plan) return;
    this.path = plan.path;
    this.pathFace = plan.face;
    const end = plan.path[plan.path.length - 1] ?? here;
    this.marker.setPosition(end.x * TILE + 8, end.y * TILE + 8).setVisible(plan.path.length > 0);
  }

  /** What the touch A button means here, and whether F feeds something. */
  private touchContext(): { a?: string; feed?: boolean } {
    const s = controller.state;
    const cu = this.customerInFront();
    if (cu) return { a: cu.phase === 'waiting_help' || cu.phase === 'seeking_help' ? 'Help' : 'Talk' };
    if (this.staffInFront()) return { a: 'Staff' };
    if (this.atTill()) return { a: 'Serve' };
    const p = this.propInFront();
    if (p?.kind === 'tank' && s.tanks[p.id]) return { a: 'Tank', feed: true };
    if (p?.kind === 'stairs') return { a: p.dir === 'down' ? 'Down' : 'Up' };
    if (p?.kind === 'desk') return { a: 'PC' };
    if (p?.kind === 'shelf') return { a: 'Stock' };
    if (p?.kind === 'rack') return { a: 'Retail' };
    if (this.atDoor()) return { a: 'Door' };
    return {};
  }

  private promptText(): string | null {
    const s = controller.state;
    // Keyboard players press Z; touch and gamepad players press A.
    const k = controller.input.lastDevice === 'keyboard' ? 'Z' : 'A';
    const cu = this.customerInFront();
    if (cu) return cu.phase === 'waiting_help' || cu.phase === 'seeking_help' ? `${k}: Help ${cu.name}` : `${k}: Talk to ${cu.name}`;
    const st = this.staffInFront();
    if (st) return `${k}: ${st.name} (${st.task?.label ?? 'staff'})`;
    if (this.atTill()) {
      const q = queueCustomers(s).length;
      return q ? `${k}: Serve customer (${q} waiting)` : 'Till: nobody waiting';
    }
    const p = this.propInFront();
    if (p?.kind === 'stairs' && p.to) return s.unlocks.floors.includes(p.to) ? `${k}: ${p.dir === 'down' ? 'Down' : 'Up'} to ${getFloorLayout(p.to).name}` : `${getFloorLayout(p.to).name} (not open yet)`;
    if (p?.kind === 'tank' && !s.tanks[p.id]) return null;
    if (p?.kind === 'rack') return s.unlocks.floors.includes('basement') ? `${k}: Equipment retail stock` : null;
    if (p?.kind === 'tank') {
      const fish = fishInTank(s, p.id);
      const counts = new Map<string, number>();
      for (const f of fish) counts.set(f.speciesId, (counts.get(f.speciesId) ?? 0) + 1);
      const desc = [...counts].map(([id, n]) => `${getSpecies(id).commonName} x${n}`).join(', ') || 'empty';
      return `${k}: ${s.tanks[p.id].name} (${desc})  F: Feed`;
    }
    if (p?.kind === 'desk') return `${k}: Office PC (orders, stock, end day)`;
    if (p?.kind === 'shelf') return `${k}: Stockroom shelves`;
    if (p?.kind === 'counter') return 'Serve from behind the counter';
    if (this.atDoor()) return minuteOfDay(s.minute) < OPEN_HOUR * 60 ? `${k}: Open up early` : isShopOpen(s.minute) ? `${k}: Front door` : `${k}: Lock up and end the day`;
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
      if (p?.kind === 'tank' && c.state.tanks[p.id]) {
        const blocked = c.lockReason('maintenance');
        if (blocked) c.ui.toast(blocked, 'warn');
        else c.perform(feedTank(c.state, c.state.tanks[p.id], 'normal'));
      }
      return;
    }
    if (a !== 'confirm') return;
    const cu = this.customerInFront();
    if (cu) {
      void talkToCustomer(c, cu);
      return;
    }
    const st = this.staffInFront();
    if (st) {
      openStaffMember(c, st.id);
      return;
    }
    if (this.atTill()) {
      void serveAtTill(c);
      return;
    }
    const p = this.propInFront();
    if (p?.kind === 'tank') {
      if (c.state.tanks[p.id]) openTankMenu(c, p.id);
    } else if (p?.kind === 'stairs') this.takeStairs(p);
    else if (p?.kind === 'rack') {
      if (c.state.unlocks.floors.includes('basement')) openRetail(c);
    } else if (p?.kind === 'pallet') void c.ui.say(null, 'Pallets of substrate bags and boxed equipment, waiting to go on the racks.');
    else if (p?.kind === 'desk') openOffice(c);
    else if (p?.kind === 'shelf') openStockroom(c);
    else if (p?.kind === 'plant') void c.ui.say(null, 'A healthy pothos. It has outlived three previous owners.');
    else if (p?.kind === 'bench') void c.ui.say(null, 'A bench for customers. Kids like to press their noses on the tanks from here.');
    else if (p?.kind === 'counter') void c.ui.say(null, 'Walk behind the counter and face the customer to serve.');
    else if (this.atDoor()) {
      const blocked = c.lockReason('time');
      if (blocked) {
        void c.ui.say(null, blocked);
        return;
      }
      const open = isShopOpen(c.state.minute);
      const early = minuteOfDay(c.state.minute) < OPEN_HOUR * 60;
      void c.ui.ask(null, early ? 'Open the doors now? (Skips to 09:00)' : open ? 'The shop is open. Close early and end the day?' : 'Lock up and end the day?', [early ? 'Wait until opening' : 'End the day', 'Not yet']).then((i) => {
        if (i === 0) c.endDay();
      });
    }
  }
}

/** Positions a DOM world label at game pixel coordinates. */
