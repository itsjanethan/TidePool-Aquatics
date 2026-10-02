/**
 * Detailed aquarium renderer: background, substrate, decor, equipment,
 * persistent fish agents, food, bubbles and cleanliness overlays.
 * Used by the inspection view and (in demo mode) the title screen.
 */
import Phaser from 'phaser';
import { clamp } from '../core/math';
import { Rng, visualRng as vr } from '../core/rng';
import { getDecor, getFilter, getSubstrate } from '../data/catalog';
import { fishInTank } from '../sim/fish';
import type { DecorItem, FishEntity, GameState, TankState } from '../sim/types';
import { buildPlant, drawPlant, ensureHardscapeTexture, type PlantModel } from './art/decorArt';
import { makeTexture, mix, noiseFill, px, shade } from './art/pixel';
import { FishAgent, type HideSpot, type Pellet, type TankWorld } from './fishBehaviour';

export const VIEW = {
  left: 14,
  right: 466,
  surface: 46,
  floor: 266,
  subBottom: 298,
  frameTop: 32,
};

interface DecorView {
  item: DecorItem;
  plant: PlantModel | null;
  image: Phaser.GameObjects.Image | null;
  x: number;
  baseY: number;
  layer: number;
}

interface Bubble {
  obj: Phaser.GameObjects.Arc;
  vy: number;
  wob: number;
}

export interface TankRendererOptions {
  onEat?: (fish: FishEntity, units: number) => number;
  onSelect?: (fish: FishEntity) => void;
}

export class TankRenderer {
  world: TankWorld;
  agents = new Map<string, FishAgent>();
  private decorViews: DecorView[] = [];
  private plantGfx: Phaser.GameObjects.Graphics[] = [];
  private bubbles: Bubble[] = [];
  private particles: Phaser.GameObjects.Rectangle[] = [];
  private rays: Phaser.GameObjects.Image | null = null;
  private overlays: { cloud: Phaser.GameObjects.Rectangle; algae: Phaser.GameObjects.Image; dirt: Phaser.GameObjects.Image; night: Phaser.GameObjects.Rectangle };
  private heaterGlow: Phaser.GameObjects.Rectangle | null = null;
  private selectRing: Phaser.GameObjects.Graphics;
  private static: Phaser.GameObjects.GameObject[] = [];
  private bubbleTimer = 0;
  selectedId: string | null = null;
  ghost: Phaser.GameObjects.GameObject | null = null;
  private time = 0;
  private decorSignature = '';

  constructor(public scene: Phaser.Scene, private getState: () => GameState, public tankId: string, private opts: TankRendererOptions = {}) {
    const tank = this.tank;
    this.world = {
      left: VIEW.left,
      right: VIEW.right,
      surface: VIEW.surface,
      floor: VIEW.floor,
      pxPerCm: (VIEW.right - VIEW.left) / tank.lengthCm,
      lightsOn: tank.lightOn,
      pellets: [],
      hides: [],
      agents: [],
      flow: 0.5,
      onEat: (agent, pellet) => this.eat(agent, pellet),
    };
    this.buildStatic();
    this.overlays = this.buildOverlays();
    this.selectRing = scene.add.graphics().setDepth(35);
    this.rebuildDecor();
    this.syncFish();
    for (let i = 0; i < 26; i++) {
      const p = scene.add.rectangle(vr.range(VIEW.left, VIEW.right), vr.range(VIEW.surface, VIEW.floor), 1, 1, 0xe8f4ff, vr.range(0.15, 0.45)).setDepth(26);
      this.particles.push(p);
    }
  }

  get tank(): TankState {
    return this.getState().tanks[this.tankId];
  }

  private buildStatic(): void {
    const s = this.scene;
    const t = this.tank;
    const W = VIEW.right - VIEW.left;
    const waterH = VIEW.subBottom - VIEW.surface + 6;
    // Wall behind the tank.
    this.static.push(s.add.rectangle(240, 160, 480, 320, 0x2a2438).setDepth(-10));
    // Water background.
    const bgKey = `tankbg:${t.backgroundId}`;
    makeTexture(s, bgKey, W, waterH, (ctx) => {
      const top = t.backgroundId === 'black' ? '#1a2a34' : t.backgroundId === 'blue' ? '#3a86c8' : t.backgroundId === 'rocky' ? '#4a7a8a' : '#5aa6c0';
      const bot = t.backgroundId === 'black' ? '#0a1014' : t.backgroundId === 'blue' ? '#163a6a' : t.backgroundId === 'rocky' ? '#24404a' : '#2c6a80';
      for (let y = 0; y < waterH; y++) px(ctx, 0, y, mix(top, bot, y / waterH), W, 1);
      if (t.backgroundId === 'rocky') {
        const r = new Rng(5);
        for (let i = 0; i < 18; i++) {
          const cx = r.range(0, W);
          const cy = r.range(waterH * 0.35, waterH);
          const rad = r.range(14, 40);
          for (let y = -rad; y < rad; y++) {
            const hw = Math.sqrt(rad * rad - y * y) * 1.3;
            px(ctx, cx - hw, cy + y, mix('#3a5a64', '#2a444c', (y + rad) / (rad * 2)), hw * 2, 1);
          }
        }
      }
      if (t.backgroundId === 'none') {
        // Faint view of the shop wall through clear glass.
        px(ctx, 0, waterH * 0.55, '#4f8c9c', W, 2);
        for (let x = 30; x < W; x += 90) px(ctx, x, waterH * 0.2, '#62a0b2', 30, 18);
      }
    });
    this.static.push(s.add.image(VIEW.left, VIEW.surface - 4, bgKey).setOrigin(0, 0).setDepth(0));

    // Light rays.
    makeTexture(s, 'tank-rays', W, VIEW.floor - VIEW.surface, (ctx) => {
      for (let i = 0; i < 7; i++) {
        const x0 = 20 + i * 70;
        for (let y = 0; y < VIEW.floor - VIEW.surface; y++) {
          const a = 0.06 * (1 - y / (VIEW.floor - VIEW.surface));
          ctx.fillStyle = `rgba(255,255,230,${a})`;
          ctx.fillRect(x0 + y * 0.35, y, 14 + (i % 3) * 6, 1);
        }
      }
    });
    this.rays = s.add.image(VIEW.left, VIEW.surface, 'tank-rays').setOrigin(0, 0).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);

    // Substrate.
    const sub = getSubstrate(t.substrateId);
    const subKey = `substrate:${t.substrateId}`;
    const subH = VIEW.subBottom - VIEW.floor + 12;
    makeTexture(s, subKey, W, subH, (ctx) => {
      const r = new Rng(17);
      const cols = [sub.colourA, sub.colourB, shade(sub.colourA, -0.15), shade(sub.colourB, 0.1)];
      for (let x = 0; x < W; x++) {
        const bump = Math.round(3 + Math.sin(x * 0.05) * 2 + Math.sin(x * 0.17) * 1.2);
        for (let y = bump; y < subH; y++) {
          const depthShade = (y - bump) / subH;
          const c = t.substrateId === 'bare' ? mix(sub.colourA, sub.colourB, depthShade) : shade(r.pick(cols), -depthShade * 0.25);
          px(ctx, x, y, c);
        }
        if (t.substrateId !== 'bare') px(ctx, x, bump, shade(sub.colourB, 0.25));
      }
      if (t.substrateId === 'gravel' || t.substrateId === 'black_gravel') {
        for (let i = 0; i < W / 2; i++) {
          const gx = r.range(0, W);
          const gy = r.range(6, subH - 2);
          px(ctx, gx, gy, shade(r.pick(cols), 0.3), 2, 1);
          px(ctx, gx, gy + 1, shade(r.pick(cols), -0.3), 2, 1);
        }
      }
    });
    this.static.push(s.add.image(VIEW.left, VIEW.floor - 6, subKey).setOrigin(0, 0).setDepth(4));

    // Equipment.
    const filter = getFilter(t.filterId);
    const g = s.add.graphics().setDepth(3);
    if (filter.id === 'sponge') {
      g.fillStyle(0x2a2a30).fillRect(VIEW.right - 34, VIEW.floor - 40, 20, 4);
      g.fillStyle(0x3a3a44).fillRect(VIEW.right - 30, VIEW.floor - 38, 12, 34);
      for (let y = VIEW.floor - 36; y < VIEW.floor - 4; y += 3) g.fillStyle(0x2c2c34).fillRect(VIEW.right - 30, y, 12, 1);
      g.fillStyle(0x9aa0aa).fillRect(VIEW.right - 25, VIEW.surface - 4, 2, VIEW.floor - VIEW.surface - 34);
    } else if (filter.id === 'hang_on') {
      g.fillStyle(0x30343e).fillRect(VIEW.right - 56, VIEW.frameTop - 2, 44, 22);
      g.fillStyle(0x4a505e).fillRect(VIEW.right - 54, VIEW.frameTop, 40, 3);
      g.fillStyle(0x30343e).fillRect(VIEW.right - 30, VIEW.surface, 6, 90);
      g.fillStyle(0x9fd6ff, 0.5).fillRect(VIEW.right - 50, VIEW.surface, 16, 6);
    } else {
      g.fillStyle(0x30343e).fillRect(VIEW.right - 28, VIEW.surface - 6, 5, 150);
      g.fillStyle(0x30343e).fillRect(VIEW.left + 40, VIEW.surface - 6, 5, 40);
      g.fillStyle(0x30343e).fillRect(VIEW.left + 40, VIEW.surface + 30, 18, 5);
    }
    if (t.heaterId) {
      g.fillStyle(0xcfe4ec, 0.55).fillRect(VIEW.left + 12, VIEW.surface + 8, 7, 110);
      g.fillStyle(0x2a2a30).fillRect(VIEW.left + 11, VIEW.surface - 4, 9, 14);
      this.heaterGlow = s.add.rectangle(VIEW.left + 15.5, VIEW.surface + 70, 3, 80, 0xff7a2a, 0.0).setDepth(3);
    }
    this.static.push(g);

    // Frame and hood.
    const frame = s.add.graphics().setDepth(40);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.left - 6, VIEW.frameTop - 8, VIEW.right - VIEW.left + 12, 10);
    frame.fillStyle(0x3a3f4c).fillRect(VIEW.left - 6, VIEW.frameTop - 8, VIEW.right - VIEW.left + 12, 2);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.left - 6, VIEW.frameTop, 6, VIEW.subBottom - VIEW.frameTop + 6);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.right, VIEW.frameTop, 6, VIEW.subBottom - VIEW.frameTop + 6);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.left - 6, VIEW.subBottom, VIEW.right - VIEW.left + 12, 6);
    frame.fillStyle(0xffffff, 0.06).fillRect(VIEW.left, VIEW.frameTop, 4, VIEW.subBottom - VIEW.frameTop);
    // Water surface line.
    frame.fillStyle(0xcff0ff, 0.35).fillRect(VIEW.left, VIEW.surface - 3, VIEW.right - VIEW.left, 1);
    frame.fillStyle(0xffffff, 0.18).fillRect(VIEW.left, VIEW.surface - 2, VIEW.right - VIEW.left, 1);
    this.static.push(frame);
  }

  private buildOverlays() {
    const s = this.scene;
    const W = VIEW.right - VIEW.left;
    const H = VIEW.subBottom - VIEW.surface + 4;
    makeTexture(s, 'overlay-algae', W, H, (ctx) => {
      const r = new Rng(77);
      for (let i = 0; i < 260; i++) {
        const x = r.range(0, W);
        const y = r.range(0, H) ** 1 * (r.chance(0.6) ? 1 : 0.35);
        const rad = r.range(2, 9);
        for (let yy = -rad; yy < rad; yy++) {
          const hw = Math.sqrt(rad * rad - yy * yy);
          ctx.fillStyle = r.pick(['rgba(70,140,50,0.55)', 'rgba(90,160,60,0.45)', 'rgba(50,110,40,0.5)']);
          ctx.fillRect(Math.round(x - hw), Math.round(y + yy), Math.round(hw * 2), 1);
        }
      }
    });
    makeTexture(s, 'overlay-dirt', W, H, (ctx) => {
      const r = new Rng(91);
      noiseFill(ctx, 0, 0, W, H, ['rgba(120,110,80,0.18)', 'rgba(140,130,90,0.12)'], 3, 0.35);
      for (let i = 0; i < 40; i++) {
        const x = r.range(0, W);
        const y = r.range(0, H);
        ctx.fillStyle = 'rgba(150,140,110,0.25)';
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(r.range(10, 40)), 1);
      }
    });
    return {
      cloud: s.add.rectangle(VIEW.left, VIEW.surface - 3, W, H, 0xdfe8e0, 0).setOrigin(0, 0).setDepth(30),
      algae: s.add.image(VIEW.left, VIEW.surface - 3, 'overlay-algae').setOrigin(0, 0).setDepth(31).setAlpha(0),
      dirt: s.add.image(VIEW.left, VIEW.surface - 3, 'overlay-dirt').setOrigin(0, 0).setDepth(32).setAlpha(0),
      night: s.add.rectangle(VIEW.left, VIEW.surface - 3, W, H, 0x0a1430, 0).setOrigin(0, 0).setDepth(29),
    };
  }

  /** Recreates decor views from the tank's decor list. */
  rebuildDecor(): void {
    const t = this.tank;
    this.decorSignature = JSON.stringify(t.decor.map((d) => [d.uid, d.x, d.layer, Math.round(d.health * 10)]));
    for (const d of this.decorViews) d.image?.destroy();
    this.decorViews = [];
    for (const g of this.plantGfx) g.destroy();
    this.plantGfx = [0, 1, 2].map((layer) => this.scene.add.graphics().setDepth(layer === 0 ? 3.5 : layer === 1 ? 15 : 25));
    const scale = clamp(Math.sqrt(60 / t.lengthCm), 0.6, 1.1);
    const W = VIEW.right - VIEW.left;
    const hides: HideSpot[] = [];
    for (const item of [...t.decor].sort((a, b) => a.layer - b.layer)) {
      const def = getDecor(item.defId);
      const x = VIEW.left + 10 + item.x * (W - 20);
      const baseY = VIEW.floor - 2 + item.layer * 4;
      if (def.kind === 'plant') {
        const plant = buildPlant(def, scale, hashUid(item.uid), item.health);
        this.decorViews.push({ item, plant, image: null, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - plant.height * 0.4, r: Math.max(12, plant.width * 0.5), cave: false });
      } else {
        const tex = ensureHardscapeTexture(this.scene, def, scale);
        const img = this.scene.add.image(Math.round(x), Math.round(baseY + 2), tex.key).setOrigin(0.5, 1).setFlipX(item.flip);
        img.setDepth(item.layer === 0 ? 5 : item.layer === 1 ? 15 : 25);
        this.decorViews.push({ item, plant: null, image: img, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - tex.h * 0.45, r: Math.max(10, tex.w * 0.45), cave: def.cave });
      }
    }
    this.world.hides = hides;
  }

  /** Adds/removes agents to match the persistent fish list. */
  syncFish(): void {
    const state = this.getState();
    const fish = fishInTank(state, this.tankId, true);
    const ids = new Set(fish.map((f) => f.id));
    for (const [id, a] of this.agents) {
      if (!ids.has(id) || !state.fish[id]) {
        a.destroy();
        this.agents.delete(id);
      }
    }
    for (const f of fish) {
      const existing = this.agents.get(f.id);
      if (existing) {
        existing.fish = f;
        continue;
      }
      const a = new FishAgent(this.scene, f, this.world);
      a.sprite.on('pointerdown', () => {
        this.selectedId = f.id;
        this.opts.onSelect?.(f);
      });
      this.agents.set(f.id, a);
    }
    this.world.agents = [...this.agents.values()];
  }

  /** Spawns visual pellets for `units` of food. */
  dropFood(units: number, x?: number): void {
    const n = clamp(Math.round(units * 6), 3, 60);
    const cx = x ?? (VIEW.left + VIEW.right) / 2 + vr.range(-80, 80);
    for (let i = 0; i < n; i++) this.addPellet(cx + vr.range(-40, 40), VIEW.surface - 1, units / n, false);
  }

  private addPellet(x: number, y: number, units: number, settled: boolean): void {
    const col = vr.pick([0xc8783a, 0xe0a050, 0xa85a2a, 0xd8c070]);
    const obj = this.scene.add.rectangle(Math.round(x), Math.round(y), 2, 2, col).setDepth(18);
    this.world.pellets.push({ x, y, vy: 0, floatT: settled ? 0 : vr.range(0.8, 3), units, settled, obj });
  }

  private eat(agent: FishAgent, pellet: Pellet): void {
    const took = this.opts.onEat ? this.opts.onEat(agent.fish, pellet.units) : pellet.units;
    pellet.units -= took;
    if (pellet.units <= 0.0001) this.removePellet(pellet);
  }

  private removePellet(p: Pellet): void {
    p.obj.destroy();
    const i = this.world.pellets.indexOf(p);
    if (i >= 0) this.world.pellets.splice(i, 1);
  }

  /** Keeps visual pellets in line with the simulation's uneaten food. */
  private syncFood(): void {
    const t = this.tank;
    const total = this.world.pellets.reduce((s, p) => s + p.units, 0);
    if (total > t.food + 0.05 && this.world.pellets.length) {
      // Food rotted away: remove oldest settled pellets first.
      const p = this.world.pellets.find((q) => q.settled) ?? this.world.pellets[0];
      this.removePellet(p);
    } else if (t.food > total + 0.4 && this.world.pellets.length < 60) {
      this.addPellet(vr.range(VIEW.left + 20, VIEW.right - 20), VIEW.floor - vr.range(0, 4), Math.min(0.3, t.food - total), true);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.tank;
    const sig = JSON.stringify(t.decor.map((d) => [d.uid, d.x, d.layer, Math.round(d.health * 10)]));
    if (sig !== this.decorSignature) this.rebuildDecor();
    this.world.lightsOn = t.lightOn;
    this.world.flow = 0.3 + getFilter(t.filterId).aeration + (t.airStone ? 0.3 : 0);
    this.syncFish();

    // Pellets.
    for (const p of this.world.pellets) {
      if (p.settled) continue;
      if (p.floatT > 0) {
        p.floatT -= dt;
        p.x += Math.sin(this.time * 2 + p.y) * 4 * dt;
      } else {
        p.vy = Math.min(14, p.vy + 20 * dt);
        p.y += p.vy * dt;
        p.x += Math.sin(this.time * 1.5 + p.x * 0.1) * 6 * dt;
        if (p.y >= VIEW.floor - 1) {
          p.y = VIEW.floor - 1 + vr.range(0, 4);
          p.settled = true;
        }
      }
      p.obj.setPosition(Math.round(p.x), Math.round(p.y));
    }
    this.syncFood();

    for (const a of this.agents.values()) {
      if (Math.random() < dt * 0.5) a.refreshTexture(this.world);
      a.update(dt, this.world, this.time);
    }

    // Plants.
    this.plantGfx.forEach((g) => g.clear());
    for (const d of this.decorViews) {
      if (d.plant) drawPlant(this.plantGfx[d.layer], d.plant, d.x, d.baseY, this.time, this.world.flow);
    }

    // Bubbles from filter / air stone.
    this.bubbleTimer -= dt;
    const filter = getFilter(t.filterId);
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = t.airStone ? 0.06 : filter.id === 'sponge' ? 0.12 : 0.5;
      if (filter.id === 'sponge') this.spawnBubble(VIEW.right - 24 + vr.range(-1, 1), VIEW.floor - 40);
      if (t.airStone) this.spawnBubble((VIEW.left + VIEW.right) / 2 + vr.range(-6, 6), VIEW.floor - 2);
      if (filter.id !== 'sponge' && vr.chance(0.5)) this.spawnBubble(VIEW.right - 40 + vr.range(-8, 8), VIEW.surface + 8);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.obj.y += b.vy * dt;
      b.obj.x += Math.sin(this.time * 6 + b.wob) * 10 * dt;
      if (b.obj.y < VIEW.surface) {
        b.obj.destroy();
        this.bubbles.splice(i, 1);
      }
    }

    // Particles drift.
    for (const p of this.particles) {
      p.y += Math.sin(this.time * 0.5 + p.x) * 2 * dt - 0.5 * dt;
      p.x += Math.cos(this.time * 0.3 + p.y * 0.1) * 3 * dt * this.world.flow;
      if (p.y < VIEW.surface) p.y = VIEW.floor;
      if (p.x < VIEW.left) p.x = VIEW.right;
      if (p.x > VIEW.right) p.x = VIEW.left;
    }
    if (this.rays) {
      this.rays.setAlpha(t.lightOn ? 0.8 + Math.sin(this.time * 0.7) * 0.2 : 0);
      this.rays.x = VIEW.left + Math.sin(this.time * 0.2) * 6;
    }

    // Heater glow.
    if (this.heaterGlow) {
      const heating = !t.heaterBroken && t.water.temperature < t.heaterSetpoint - 0.1;
      this.heaterGlow.setFillStyle(t.heaterBroken ? 0x555555 : 0xff7a2a, heating ? 0.6 + Math.sin(this.time * 4) * 0.2 : 0.1);
    }

    // Cleanliness overlays.
    this.overlays.cloud.setFillStyle(0xdfe8e0, clamp(t.water.cloudiness * 0.55, 0, 0.6));
    this.overlays.algae.setAlpha(clamp(t.algae * 0.95, 0, 0.95));
    this.overlays.dirt.setAlpha(clamp(t.glassDirt * 0.9, 0, 0.9));
    this.overlays.night.setFillStyle(0x0a1430, t.lightOn ? 0 : 0.45);

    // Selection marker.
    this.selectRing.clear();
    const sel = this.selectedId ? this.agents.get(this.selectedId) : null;
    if (sel) {
      const bob = Math.round(Math.sin(this.time * 5) * 2);
      this.selectRing.fillStyle(0xfff27a, 1);
      const x = Math.round(sel.x);
      const y = Math.round(sel.y - sel.height / 2 - 6 + bob);
      this.selectRing.fillRect(x - 3, y, 7, 1).fillRect(x - 2, y + 1, 5, 1).fillRect(x - 1, y + 2, 3, 1).fillRect(x, y + 3, 1, 1);
    } else if (this.selectedId && !this.getState().fish[this.selectedId]) {
      this.selectedId = null;
    }
  }

  private spawnBubble(x: number, y: number): void {
    if (this.bubbles.length > 80) return;
    const r = vr.chance(0.3) ? 1.5 : 1;
    const obj = this.scene.add.circle(x, y, r, 0xe8f8ff, 0.55).setStrokeStyle(0.5, 0xffffff, 0.6).setDepth(26);
    this.bubbles.push({ obj, vy: -vr.range(28, 44), wob: vr.range(0, 6) });
  }

  /** Sorted list of living fish ids (for keyboard selection). */
  selectableIds(): string[] {
    return [...this.agents.values()]
      .sort((a, b) => a.x - b.x)
      .map((a) => a.fish.id);
  }

  cycleSelection(dir: number): FishEntity | null {
    const ids = this.selectableIds();
    if (!ids.length) return null;
    const i = this.selectedId ? ids.indexOf(this.selectedId) : -1;
    const next = ids[(i + dir + ids.length) % ids.length];
    this.selectedId = next;
    return this.getState().fish[next] ?? null;
  }

  destroy(): void {
    for (const a of this.agents.values()) a.destroy();
    this.agents.clear();
  }
}

function hashUid(uid: string): number {
  let h = 7;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h);
}

