/**
 * Detailed aquarium renderer (inspection view and title screen).
 *
 * Draws at RES x the logical resolution: layered background, light rays,
 * animated caustics, shaded substrate, equipment, hardscape and swaying
 * plants in three depth layers, persistent fish agents with soft shadows,
 * food flakes, bubbles, drifting particles, an animated surface, glass
 * reflections and cleanliness overlays.
 *
 * Supports non-destructive previews for aquascaping: `setLook` (substrate /
 * background) and `setGhost` (a decor item or plant before it is placed).
 */
import Phaser from 'phaser';
import { clamp } from '../core/math';
import { Rng, visualRng as vr } from '../core/rng';
import { getDecor, getFilter, getSubstrate } from '../data/catalog';
import { fishInTank } from '../sim/fish';
import type { DecorItem, FishEntity, GameState, TankState } from '../sim/types';
import { buildPlant, drawPlant, ensureHardscapeTexture, type PlantModel } from './art/decorArt';
import { makeTexture, mix, px, shade } from './art/pixel';
import { FishAgent, type HideSpot, type Pellet, type TankWorld } from './fishBehaviour';
import { CANVAS_H, CANVAS_W, RES } from './res';

/** Tank view layout in canvas pixels. */
export const VIEW = {
  left: 14 * RES,
  right: 466 * RES,
  surface: 46 * RES,
  floor: 266 * RES,
  subBottom: 298 * RES,
  frameTop: 32 * RES,
};

export interface GhostSpec {
  defId: string;
  x: number;
  layer: 0 | 1 | 2;
  size: number;
}

interface DecorView {
  item: DecorItem;
  plant: PlantModel | null;
  image: Phaser.GameObjects.Image | null;
  x: number;
  baseY: number;
  layer: number;
}

interface Bubble {
  obj: Phaser.GameObjects.Image;
  vy: number;
  wob: number;
  grow: number;
}

interface Speck {
  obj: Phaser.GameObjects.Rectangle;
  depth: number;
}

export interface TankRendererOptions {
  onEat?: (fish: FishEntity, units: number) => number;
  onSelect?: (fish: FishEntity) => void;
}

const W = VIEW.right - VIEW.left;

/** Decor horizontal position 0..1 to canvas x. */
export function decorX(x: number): number {
  return VIEW.left + 10 * RES + x * (W - 20 * RES);
}
export function decorBaseY(layer: number): number {
  return VIEW.floor - 2 * RES + layer * 4 * RES;
}
export function decorScale(tank: TankState): number {
  return clamp(Math.sqrt(60 / tank.lengthCm), 0.6, 1.1) * RES;
}

export class TankRenderer {
  world: TankWorld;
  agents = new Map<string, FishAgent>();
  selectedId: string | null = null;
  private decorViews: DecorView[] = [];
  private plantGfx: Phaser.GameObjects.Graphics[] = [];
  private bubbles: Bubble[] = [];
  private specks: Speck[] = [];
  private rays: Phaser.GameObjects.Image[] = [];
  private caustics: Phaser.GameObjects.TileSprite[] = [];
  private surfaceGfx: Phaser.GameObjects.Graphics;
  private shadowGfx: Phaser.GameObjects.Graphics;
  private overlays: { cloud: Phaser.GameObjects.Rectangle; algae: Phaser.GameObjects.Image; dirt: Phaser.GameObjects.Image; night: Phaser.GameObjects.Rectangle };
  private heaterGlow: Phaser.GameObjects.Rectangle | null = null;
  private equipment: Phaser.GameObjects.Graphics | null = null;
  private bgImage: Phaser.GameObjects.Image | null = null;
  private subImage: Phaser.GameObjects.Image | null = null;
  private selectRing: Phaser.GameObjects.Graphics;
  private ghostGfx: Phaser.GameObjects.Graphics;
  private ghostImage: Phaser.GameObjects.Image | null = null;
  private ghost: GhostSpec | null = null;
  private ghostPlant: PlantModel | null = null;
  private ghostKey = '';
  private bubbleTimer = 0;
  private time = 0;
  private decorSignature = '';
  private lookKey = '';
  private equipKey = '';
  private preview: { backgroundId?: string; substrateId?: string } = {};

  constructor(public scene: Phaser.Scene, private getState: () => GameState, public tankId: string, private opts: TankRendererOptions = {}) {
    const tank = this.tank;
    this.world = {
      left: VIEW.left,
      right: VIEW.right,
      surface: VIEW.surface,
      floor: VIEW.floor,
      pxPerCm: W / tank.lengthCm,
      lightsOn: tank.lightOn,
      pellets: [],
      hides: [],
      agents: [],
      flow: 0.5,
      scale: RES,
      onEat: (agent, pellet) => this.eat(agent, pellet),
    };
    ensureSharedTextures(scene);
    scene.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x221d30).setOrigin(0, 0).setDepth(-10);
    this.buildRays();
    this.caustics = [
      scene.add.tileSprite(VIEW.left, VIEW.floor - 14 * RES, W, VIEW.subBottom - VIEW.floor + 14 * RES, 'caustics').setOrigin(0, 0).setDepth(4.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.32),
      scene.add.tileSprite(VIEW.left, VIEW.floor - 14 * RES, W, VIEW.subBottom - VIEW.floor + 14 * RES, 'caustics').setOrigin(0, 0).setDepth(4.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22).setFlipX(true),
      scene.add.tileSprite(VIEW.left, VIEW.surface, W, VIEW.floor - VIEW.surface, 'caustics').setOrigin(0, 0).setDepth(0.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.07),
    ];
    this.shadowGfx = scene.add.graphics().setDepth(4.5);
    this.surfaceGfx = scene.add.graphics().setDepth(28);
    this.buildFrame();
    this.overlays = this.buildOverlays();
    this.selectRing = scene.add.graphics().setDepth(35);
    this.ghostGfx = scene.add.graphics().setDepth(27);
    this.applyLook();
    this.rebuildEquipment();
    this.rebuildDecor();
    this.syncFish();
    for (let i = 0; i < 70; i++) {
      const depth = vr.next();
      const size = depth > 0.7 ? 2 : 1;
      const obj = scene.add
        .rectangle(vr.range(VIEW.left, VIEW.right), vr.range(VIEW.surface, VIEW.floor), size, size, depth > 0.5 ? 0xeef8ff : 0xb8d8e0, vr.range(0.12, 0.4) * (0.5 + depth))
        .setDepth(depth > 0.6 ? 26 : 8);
      this.specks.push({ obj, depth });
    }
  }

  get tank(): TankState {
    return this.getState().tanks[this.tankId];
  }

  // -------------------------------------------------------------------------
  // Static layers

  private buildRays(): void {
    const s = this.scene;
    const h = VIEW.floor - VIEW.surface;
    if (!s.textures.exists('ray')) {
      makeTexture(s, 'ray', 40 * RES, h, (ctx) => {
        for (let y = 0; y < h; y++) {
          const fade = 1 - y / h;
          for (let x = 0; x < 40 * RES; x++) {
            const edge = 1 - Math.abs(x / (40 * RES) - 0.5) * 2;
            const a = 0.11 * fade * Math.pow(Math.max(0, edge), 1.6);
            if (a < 0.004) continue;
            ctx.fillStyle = `rgba(255,252,225,${a.toFixed(3)})`;
            ctx.fillRect(x + y * 0.32, y, 1, 1);
          }
        }
      });
    }
    for (let i = 0; i < 6; i++) {
      const img = s.add.image(VIEW.left + (i * W) / 6 + vr.range(-20, 20) * RES, VIEW.surface, 'ray').setOrigin(0, 0).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      img.setScale(vr.range(0.7, 1.4), 1);
      this.rays.push(img);
    }
  }

  /** Background and substrate textures; previews override the tank's own ids. */
  private applyLook(): void {
    const t = this.tank;
    const bgId = this.preview.backgroundId ?? t.backgroundId;
    const subId = this.preview.substrateId ?? t.substrateId;
    const key = `${bgId}|${subId}`;
    if (key === this.lookKey) return;
    this.lookKey = key;
    const bgKey = ensureBackground(this.scene, bgId);
    const subKey = ensureSubstrate(this.scene, subId);
    if (!this.bgImage) this.bgImage = this.scene.add.image(VIEW.left, VIEW.surface - 4 * RES, bgKey).setOrigin(0, 0).setDepth(0);
    else this.bgImage.setTexture(bgKey);
    if (!this.subImage) this.subImage = this.scene.add.image(VIEW.left, VIEW.floor - 6 * RES, subKey).setOrigin(0, 0).setDepth(4);
    else this.subImage.setTexture(subKey);
  }

  /** Shows a substrate/background without buying it. Pass {} to clear. */
  setLook(preview: { backgroundId?: string; substrateId?: string }): void {
    this.preview = { ...preview };
    this.applyLook();
  }

  private rebuildEquipment(): void {
    const t = this.tank;
    const key = `${t.filterId}|${t.heaterId}|${t.airStone}`;
    if (key === this.equipKey) return;
    this.equipKey = key;
    this.equipment?.destroy();
    this.heaterGlow?.destroy();
    this.heaterGlow = null;
    const R = RES;
    const g = this.scene.add.graphics().setDepth(3);
    const filter = getFilter(t.filterId);
    if (filter.id === 'sponge') {
      const fx = VIEW.right - 34 * R;
      g.fillStyle(0x2a2a30).fillRect(fx - 2 * R, VIEW.floor - 42 * R, 24 * R, 4 * R);
      for (let y = 0; y < 34 * R; y++) {
        const c = Phaser.Display.Color.GetColor(52 + (y % 6 < 3 ? 6 : 0), 52, 62);
        g.fillStyle(c).fillRect(fx, VIEW.floor - 38 * R + y, 20 * R, 1);
      }
      g.fillStyle(0x1f1f26, 0.6).fillRect(fx + 15 * R, VIEW.floor - 38 * R, 5 * R, 34 * R);
      g.fillStyle(0xb8c0ca).fillRect(fx + 9 * R, VIEW.surface - 4 * R, 2 * R, VIEW.floor - VIEW.surface - 38 * R);
      g.fillStyle(0xffffff, 0.35).fillRect(fx + 9 * R, VIEW.surface - 4 * R, R, VIEW.floor - VIEW.surface - 38 * R);
    } else if (filter.id === 'hang_on') {
      g.fillStyle(0x30343e).fillRect(VIEW.right - 58 * R, VIEW.frameTop - 4 * R, 46 * R, 22 * R);
      g.fillStyle(0x4a505e).fillRect(VIEW.right - 56 * R, VIEW.frameTop - 2 * R, 42 * R, 3 * R);
      g.fillStyle(0x262a33).fillRect(VIEW.right - 30 * R, VIEW.surface, 7 * R, 100 * R);
      g.fillStyle(0x3a3f4c).fillRect(VIEW.right - 30 * R, VIEW.surface, 2 * R, 100 * R);
      g.fillStyle(0x9fd6ff, 0.45).fillRect(VIEW.right - 52 * R, VIEW.surface - 2 * R, 18 * R, 8 * R);
    } else {
      g.fillStyle(0x262a33).fillRect(VIEW.right - 28 * R, VIEW.surface - 6 * R, 6 * R, 160 * R);
      g.fillStyle(0x3a3f4c).fillRect(VIEW.right - 28 * R, VIEW.surface - 6 * R, 2 * R, 160 * R);
      for (let k = 0; k < 6; k++) g.fillStyle(0x1a1d24).fillRect(VIEW.right - 29 * R, VIEW.surface + (120 + k * 5) * R, 8 * R, 2 * R);
      g.fillStyle(0x262a33).fillRect(VIEW.left + 40 * R, VIEW.surface - 6 * R, 6 * R, 40 * R);
      g.fillStyle(0x262a33).fillRect(VIEW.left + 40 * R, VIEW.surface + 30 * R, 22 * R, 6 * R);
    }
    if (t.heaterId) {
      const hx = VIEW.left + 12 * R;
      g.fillStyle(0xcfe4ec, 0.35).fillRect(hx, VIEW.surface + 8 * R, 8 * R, 112 * R);
      g.fillStyle(0xffffff, 0.35).fillRect(hx + R, VIEW.surface + 8 * R, R, 112 * R);
      for (let y = 0; y < 90 * R; y += 3 * R) g.fillStyle(0x8a5a3a, 0.5).fillRect(hx + 3 * R, VIEW.surface + 20 * R + y, 2 * R, R);
      g.fillStyle(0x2a2a30).fillRect(hx - R, VIEW.surface - 4 * R, 10 * R, 14 * R);
      g.fillStyle(0x2a2a30).fillRect(hx - R, VIEW.surface + 118 * R, 10 * R, 4 * R);
      this.heaterGlow = this.scene.add.rectangle(hx + 4 * R, VIEW.surface + 66 * R, 3 * R, 84 * R, 0xff7a2a, 0).setDepth(3.1).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.equipment = g;
  }

  private buildFrame(): void {
    const s = this.scene;
    const R = RES;
    const frame = s.add.graphics().setDepth(40);
    // Hood with a lit strip.
    for (let y = 0; y < 12 * R; y++) frame.fillStyle(Phaser.Display.Color.GetColor(30 + y, 32 + y, 42 + y)).fillRect(VIEW.left - 6 * R, VIEW.frameTop - 10 * R + y, W + 12 * R, 1);
    frame.fillStyle(0xfff4d0, 0.8).fillRect(VIEW.left + 20 * R, VIEW.frameTop + R, W - 40 * R, R);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.left - 6 * R, VIEW.frameTop, 6 * R, VIEW.subBottom - VIEW.frameTop + 6 * R);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.right, VIEW.frameTop, 6 * R, VIEW.subBottom - VIEW.frameTop + 6 * R);
    frame.fillStyle(0x3a3f4c).fillRect(VIEW.left - R, VIEW.frameTop, R, VIEW.subBottom - VIEW.frameTop);
    frame.fillStyle(0x3a3f4c).fillRect(VIEW.right, VIEW.frameTop, R, VIEW.subBottom - VIEW.frameTop);
    frame.fillStyle(0x1c1e26).fillRect(VIEW.left - 6 * R, VIEW.subBottom, W + 12 * R, 6 * R);
    // Front glass reflections.
    if (!s.textures.exists('glass-sheen')) {
      makeTexture(s, 'glass-sheen', W, VIEW.subBottom - VIEW.frameTop, (ctx) => {
        const h = VIEW.subBottom - VIEW.frameTop;
        for (let y = 0; y < h; y++) {
          for (const [x0, w0, a] of [[60, 26, 0.05], [100, 8, 0.04], [W - 220, 40, 0.035]] as Array<[number, number, number]>) {
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillRect(x0 * RES + y * 0.5, y, w0 * RES, 1);
          }
        }
        // Darker corners.
        const grad = ctx.createRadialGradient(W / 2, h / 2, h * 0.4, W / 2, h / 2, W * 0.62);
        grad.addColorStop(0, 'rgba(0,0,10,0)');
        grad.addColorStop(1, 'rgba(0,0,10,0.28)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, h);
      });
    }
    s.add.image(VIEW.left, VIEW.frameTop, 'glass-sheen').setOrigin(0, 0).setDepth(33);
  }

  private buildOverlays() {
    const s = this.scene;
    const H = VIEW.subBottom - VIEW.surface + 4 * RES;
    if (!s.textures.exists('overlay-algae')) {
      makeTexture(s, 'overlay-algae', W, H, (ctx) => {
        const r = new Rng(77);
        for (let i = 0; i < 420; i++) {
          const x = r.range(0, W);
          const y = r.chance(0.55) ? r.range(H * 0.55, H) : r.range(0, H);
          const rad = r.range(2, 10) * RES;
          for (let yy = -rad; yy < rad; yy++) {
            const hw = Math.sqrt(rad * rad - yy * yy);
            ctx.fillStyle = r.pick(['rgba(70,140,50,0.45)', 'rgba(90,160,60,0.38)', 'rgba(50,110,40,0.42)']);
            ctx.fillRect(Math.round(x - hw), Math.round(y + yy), Math.round(hw * 2), 1);
          }
        }
      });
      makeTexture(s, 'overlay-dirt', W, H, (ctx) => {
        const r = new Rng(91);
        for (let i = 0; i < W * H * 0.02; i++) {
          ctx.fillStyle = r.pick(['rgba(120,110,80,0.22)', 'rgba(140,130,90,0.16)']);
          ctx.fillRect(Math.round(r.range(0, W)), Math.round(r.range(0, H)), RES, RES);
        }
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = 'rgba(150,140,110,0.22)';
          const x = r.range(0, W);
          const y = r.range(0, H);
          const len = r.range(20, 80) * RES;
          for (let k = 0; k < len; k += RES) ctx.fillRect(Math.round(x + k), Math.round(y + Math.sin(k * 0.05) * 3), RES, RES);
        }
      });
    }
    return {
      cloud: s.add.rectangle(VIEW.left, VIEW.surface - 3 * RES, W, H, 0xdfe8e0, 0).setOrigin(0, 0).setDepth(30),
      algae: s.add.image(VIEW.left, VIEW.surface - 3 * RES, 'overlay-algae').setOrigin(0, 0).setDepth(31).setAlpha(0),
      dirt: s.add.image(VIEW.left, VIEW.surface - 3 * RES, 'overlay-dirt').setOrigin(0, 0).setDepth(32).setAlpha(0),
      night: s.add.rectangle(VIEW.left, VIEW.surface - 3 * RES, W, H, 0x0a1430, 0).setOrigin(0, 0).setDepth(29),
    };
  }

  // -------------------------------------------------------------------------
  // Decor

  private signature(): string {
    return JSON.stringify(this.tank.decor.map((d) => [d.uid, d.x, d.layer, Math.round(d.health * 10), Math.round((d.size ?? 1) * 20)]));
  }

  /** Recreates decor views from the tank's decor list. */
  rebuildDecor(): void {
    const t = this.tank;
    this.decorSignature = this.signature();
    for (const d of this.decorViews) d.image?.destroy();
    this.decorViews = [];
    for (const g of this.plantGfx) g.destroy();
    this.plantGfx = [0, 1, 2].map((layer) => this.scene.add.graphics().setDepth(layer === 0 ? 3.5 : layer === 1 ? 15 : 25));
    const scale = decorScale(t);
    const hides: HideSpot[] = [];
    for (const item of [...t.decor].sort((a, b) => a.layer - b.layer)) {
      const def = getDecor(item.defId);
      const x = decorX(item.x);
      const baseY = decorBaseY(item.layer);
      if (def.kind === 'plant') {
        const plant = buildPlant(def, scale, hashUid(item.uid), item.health, item.size ?? 1);
        this.decorViews.push({ item, plant, image: null, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - plant.height * 0.4, r: Math.max(12 * RES, plant.width * 0.5), cave: false });
      } else {
        const tex = ensureHardscapeTexture(this.scene, def, scale);
        const img = this.scene.add.image(Math.round(x), Math.round(baseY + 2 * RES), tex.key).setOrigin(0.5, 1).setFlipX(item.flip);
        img.setDepth(item.layer === 0 ? 5 : item.layer === 1 ? 15 : 25);
        this.decorViews.push({ item, plant: null, image: img, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - tex.h * 0.45, r: Math.max(10 * RES, tex.w * 0.45), cave: def.cave });
      }
    }
    this.world.hides = hides;
  }

  /** Shows a translucent preview of a decor item; null clears it. */
  setGhost(spec: GhostSpec | null): void {
    this.ghost = spec;
    const key = spec ? `${spec.defId}|${spec.size.toFixed(2)}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghostImage?.destroy();
    this.ghostImage = null;
    this.ghostPlant = null;
    if (!spec) return;
    const def = getDecor(spec.defId);
    const scale = decorScale(this.tank);
    if (def.kind === 'plant') this.ghostPlant = buildPlant(def, scale, 4242, 1, spec.size);
    else {
      const tex = ensureHardscapeTexture(this.scene, def, scale);
      this.ghostImage = this.scene.add.image(0, 0, tex.key).setOrigin(0.5, 1).setDepth(27);
    }
  }

  /** Canvas-space box of a decor item (for edit highlights). */
  decorBounds(item: { defId: string; x: number; layer: number; size?: number }): { x: number; y: number; w: number; h: number } {
    const def = getDecor(item.defId);
    const scale = decorScale(this.tank);
    const g = def.kind === 'plant' ? 0.3 + 0.7 * Math.min(1.8, item.size ?? 1) : 1;
    const w = def.width * scale * (def.kind === 'plant' ? 0.5 + 0.5 * Math.min(g, 1.4) : 1);
    const h = def.height * scale * g;
    const x = decorX(item.x);
    const base = decorBaseY(item.layer);
    return { x: x - w / 2, y: base - h, w, h };
  }

  // -------------------------------------------------------------------------
  // Fish and food

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

  /** Spawns visual food flakes for `units` of food. */
  dropFood(units: number, x?: number): void {
    const n = clamp(Math.round(units * 7), 4, 70);
    const cx = x ?? (VIEW.left + VIEW.right) / 2 + vr.range(-80, 80) * RES;
    for (let i = 0; i < n; i++) this.addPellet(cx + vr.range(-40, 40) * RES, VIEW.surface - RES, units / n, false);
  }

  private addPellet(x: number, y: number, units: number, settled: boolean): void {
    const col = vr.pick([0xc8783a, 0xe0a050, 0xa85a2a, 0xd8c070, 0xb84a30]);
    const obj = this.scene.add.rectangle(Math.round(x), Math.round(y), vr.pick([2, 3, 4]), vr.pick([2, 3]), col).setDepth(18);
    obj.rotation = vr.range(0, Math.PI);
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

  /** Keeps visual food in line with the simulation's uneaten food. */
  private syncFood(): void {
    const t = this.tank;
    const total = this.world.pellets.reduce((s, p) => s + p.units, 0);
    if (total > t.food + 0.05 && this.world.pellets.length) {
      const p = this.world.pellets.find((q) => q.settled) ?? this.world.pellets[0];
      this.removePellet(p);
    } else if (t.food > total + 0.4 && this.world.pellets.length < 70) {
      this.addPellet(vr.range(VIEW.left + 20 * RES, VIEW.right - 20 * RES), VIEW.floor - 3 * RES + vr.range(0, 2 * RES), Math.min(0.3, t.food - total), true);
    }
  }

  // -------------------------------------------------------------------------
  // Frame update

  update(dt: number): void {
    this.time += dt;
    const t = this.tank;
    if (this.signature() !== this.decorSignature) this.rebuildDecor();
    this.applyLook();
    this.rebuildEquipment();
    this.world.lightsOn = t.lightOn;
    this.world.flow = 0.3 + getFilter(t.filterId).aeration + (t.airStone ? 0.3 : 0);
    this.syncFish();

    // Food flakes flutter at the surface then sink with a little spin.
    for (const p of this.world.pellets) {
      if (p.settled) continue;
      if (p.floatT > 0) {
        p.floatT -= dt;
        p.x += Math.sin(this.time * 2 + p.y) * 4 * RES * dt;
      } else {
        p.vy = Math.min(14 * RES, p.vy + 20 * RES * dt);
        p.y += p.vy * dt;
        p.x += Math.sin(this.time * 1.5 + p.x * 0.05) * 6 * RES * dt;
        p.obj.rotation += dt * 2;
        if (p.y >= VIEW.floor - 3 * RES) {
          p.y = VIEW.floor - 3 * RES + vr.range(0, 2 * RES);
          p.settled = true;
        }
      }
      p.obj.setPosition(p.x, p.y);
    }
    this.syncFood();

    for (const a of this.agents.values()) {
      if (Math.random() < dt * 0.5) a.refreshTexture(this.world);
      a.update(dt, this.world, this.time);
    }

    // Soft fish shadows on the substrate (stronger for fish near the bottom).
    this.shadowGfx.clear();
    if (t.lightOn) {
      const waterH = VIEW.floor - VIEW.surface;
      for (const a of this.agents.values()) {
        if (!a.fish.alive) continue;
        const above = clamp((VIEW.floor - a.y) / waterH, 0, 1);
        const alpha = 0.22 * (1 - above) * (1 - above) + 0.03;
        const w = a.len * (0.75 - above * 0.3);
        this.shadowGfx.fillStyle(0x0a1418, alpha).fillEllipse(a.x + above * 12 * RES, VIEW.floor - RES, w, Math.max(2 * RES, w * 0.16));
      }
    }

    // Plants.
    this.plantGfx.forEach((g) => g.clear());
    for (const d of this.decorViews) {
      if (d.plant) drawPlant(this.plantGfx[d.layer], d.plant, d.x, d.baseY, this.time, this.world.flow, 1, VIEW.surface);
    }

    // Aquascape ghost preview.
    this.ghostGfx.clear();
    if (this.ghost) {
      const gx = decorX(this.ghost.x);
      const gy = decorBaseY(this.ghost.layer);
      const pulse = 0.55 + Math.sin(this.time * 5) * 0.15;
      if (this.ghostPlant) drawPlant(this.ghostGfx, this.ghostPlant, gx, gy, this.time, this.world.flow, pulse, VIEW.surface);
      if (this.ghostImage) this.ghostImage.setPosition(gx, gy + 2 * RES).setAlpha(pulse).setTint(0xfff6c8);
      this.ghostGfx.fillStyle(0xfff27a, 0.9).fillRect(gx - RES, gy + 3 * RES, 2 * RES, 6 * RES);
    }

    // Bubbles: grow and wobble as they rise.
    this.bubbleTimer -= dt;
    const filter = getFilter(t.filterId);
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = t.airStone ? 0.06 : filter.id === 'sponge' ? 0.16 : 0.45;
      if (filter.id === 'sponge') this.spawnBubble(VIEW.right - 24 * RES + vr.range(-1, 1) * RES, VIEW.floor - 40 * RES);
      if (t.airStone) this.spawnBubble((VIEW.left + VIEW.right) / 2 + vr.range(-6, 6) * RES, VIEW.floor - 2 * RES);
      if (filter.id !== 'sponge' && vr.chance(0.5)) this.spawnBubble(VIEW.right - 40 * RES + vr.range(-8, 8) * RES, VIEW.surface + 8 * RES);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.obj.y += b.vy * dt;
      b.obj.x += Math.sin(this.time * 7 + b.wob) * 9 * RES * dt;
      b.obj.setScale(Math.min(1.1, b.obj.scaleX + b.grow * dt));
      if (b.obj.y < VIEW.surface + RES) {
        b.obj.destroy();
        this.bubbles.splice(i, 1);
      }
    }

    // Suspended particles with parallax drift.
    for (const p of this.specks) {
      const o = p.obj;
      o.y += (Math.sin(this.time * 0.5 + o.x * 0.01) * 2 - 0.4) * RES * dt * (0.5 + p.depth);
      o.x += Math.cos(this.time * 0.3 + o.y * 0.02) * 3 * RES * dt * this.world.flow * (0.5 + p.depth);
      if (o.y < VIEW.surface) o.y = VIEW.floor;
      if (o.y > VIEW.floor) o.y = VIEW.surface;
      if (o.x < VIEW.left) o.x = VIEW.right;
      if (o.x > VIEW.right) o.x = VIEW.left;
    }

    // Light: rays sway, caustics drift.
    this.rays.forEach((r, i) => {
      r.setAlpha(t.lightOn ? 0.55 + Math.sin(this.time * 0.6 + i * 1.7) * 0.35 : 0);
      r.x += Math.sin(this.time * 0.25 + i) * 0.08 * RES;
    });
    const cOn = t.lightOn ? 1 : 0.15;
    this.caustics[0].tilePositionX = this.time * 7 * RES;
    this.caustics[0].tilePositionY = this.time * 3 * RES;
    this.caustics[1].tilePositionX = -this.time * 5 * RES;
    this.caustics[1].tilePositionY = this.time * 4 * RES;
    this.caustics[2].tilePositionX = this.time * 4 * RES;
    this.caustics[0].setAlpha(0.3 * cOn * (1 - t.water.cloudiness * 0.7));
    this.caustics[1].setAlpha(0.22 * cOn * (1 - t.water.cloudiness * 0.7));
    this.caustics[2].setAlpha(0.025 * cOn);

    this.drawSurface(t);

    if (this.heaterGlow) {
      const heating = !t.heaterBroken && t.water.temperature < t.heaterSetpoint - 0.1;
      this.heaterGlow.setFillStyle(t.heaterBroken ? 0x555555 : 0xff7a2a, heating ? 0.45 + Math.sin(this.time * 4) * 0.2 : 0.05);
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
      const bob = Math.round(Math.sin(this.time * 5) * 2 * RES);
      const x = Math.round(sel.x);
      const y = Math.round(sel.y - sel.height / 2 - 8 * RES + bob);
      this.selectRing.fillStyle(0x20202a, 1).fillTriangle(x - 5 * RES, y - RES, x + 5 * RES, y - RES, x, y + 5 * RES);
      this.selectRing.fillStyle(0xfff27a, 1).fillTriangle(x - 4 * RES, y, x + 4 * RES, y, x, y + 4 * RES);
    } else if (this.selectedId && !this.getState().fish[this.selectedId]) {
      this.selectedId = null;
    }
  }

  private drawSurface(t: TankState): void {
    const g = this.surfaceGfx;
    g.clear();
    const y0 = VIEW.surface - 3 * RES;
    // Air gap above the water.
    g.fillStyle(0x0e1420, 0.55).fillRect(VIEW.left, VIEW.frameTop, W, y0 - VIEW.frameTop);
    const step = 4 * RES;
    for (let x = VIEW.left; x < VIEW.right; x += step) {
      const wave = Math.sin(x * 0.012 + this.time * 1.6) * 1.2 * RES + Math.sin(x * 0.005 - this.time * 0.9) * RES;
      const yy = Math.round(y0 + wave);
      g.fillStyle(0xd8f4ff, t.lightOn ? 0.55 : 0.2).fillRect(x, yy, step, RES);
      g.fillStyle(0xffffff, t.lightOn ? 0.18 : 0.06).fillRect(x, yy + RES, step, 2 * RES);
      // Underside reflection band.
      g.fillStyle(0x9fd8ee, t.lightOn ? 0.1 : 0.03).fillRect(x, yy + 3 * RES, step, 5 * RES);
      if ((x / step + Math.floor(this.time * 3)) % 9 === 0) g.fillStyle(0xffffff, t.lightOn ? 0.7 : 0.2).fillRect(x + RES, yy, 2 * RES, RES);
    }
  }

  private spawnBubble(x: number, y: number): void {
    if (this.bubbles.length > 90) return;
    const obj = this.scene.add.image(x, y, 'bubble').setDepth(26).setScale(vr.range(0.3, 0.6));
    this.bubbles.push({ obj, vy: -vr.range(28, 46) * RES, wob: vr.range(0, 6), grow: vr.range(0.05, 0.25) });
  }

  /** Living fish ids left to right (for keyboard selection). */
  selectableIds(): string[] {
    return [...this.agents.values()].sort((a, b) => a.x - b.x).map((a) => a.fish.id);
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

// ---------------------------------------------------------------------------
// Shared generated textures

function ensureSharedTextures(s: Phaser.Scene): void {
  if (!s.textures.exists('bubble')) {
    makeTexture(s, 'bubble', 8 * RES, 8 * RES, (ctx) => {
      const r = 4 * RES;
      for (let y = 0; y < 2 * r; y++) {
        for (let x = 0; x < 2 * r; x++) {
          const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
          if (d > 1) continue;
          const rim = d > 0.72 ? 0.75 : 0.12;
          ctx.fillStyle = `rgba(225,245,255,${rim})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(Math.round(r * 0.6), Math.round(r * 0.55), RES, RES);
    });
  }
  if (!s.textures.exists('caustics')) {
    const TW = 160 * RES;
    const TH = 80 * RES;
    makeTexture(s, 'caustics', TW, TH, (ctx) => {
      const img = ctx.createImageData(TW, TH);
      const k1 = (Math.PI * 2) / TW;
      const k2 = (Math.PI * 2) / TH;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          // Tileable warped interference: thin bright lines where the field crosses zero.
          const a = Math.sin(x * k1 * 3 + Math.sin(y * k2 * 2) * 1.8) + Math.sin(y * k2 * 3 + Math.sin(x * k1 * 4) * 1.6);
          const b = Math.sin((x * k1 * 5 + y * k2 * 2) + Math.cos(y * k2 * 3) * 1.2);
          const v = Math.max(0, 1 - Math.abs(a) * 2.6) * 0.75 + Math.max(0, 1 - Math.abs(b) * 3.2) * 0.45;
          const i = (y * TW + x) * 4;
          // Quantise for a pixel-art look.
          const q = Math.round(Math.min(1, v) * 4) / 4;
          img.data[i] = 255;
          img.data[i + 1] = 252;
          img.data[i + 2] = 225;
          img.data[i + 3] = q * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }
}

function ensureBackground(s: Phaser.Scene, id: string): string {
  const key = `tankbg2:${id}`;
  if (s.textures.exists(key)) return key;
  const waterH = VIEW.subBottom - VIEW.surface + 6 * RES;
  makeTexture(s, key, W, waterH, (ctx) => {
    const top = id === 'black' ? '#1a2a34' : id === 'blue' ? '#3a8ad0' : id === 'rocky' ? '#4a7a8a' : '#5aa6c0';
    const bot = id === 'black' ? '#060a0e' : id === 'blue' ? '#12346a' : id === 'rocky' ? '#1e3840' : '#2a6478';
    // Banded gradient (dithered steps keep the pixel-art feel).
    const bands = 28;
    for (let y = 0; y < waterH; y++) {
      const t = y / waterH;
      const bt = Math.floor(t * bands) / bands;
      const dither = (y % 2 === 0 && (t * bands) % 1 > 0.5) ? 1 / bands : 0;
      px(ctx, 0, y, mix(top, bot, bt + dither), W, 1);
    }
    const r = new Rng(11);
    if (id === 'rocky') {
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < 14; i++) {
          const cx = r.range(0, W);
          const cy = r.range(waterH * (0.35 + layer * 0.15), waterH);
          const rad = r.range(14, 44) * RES;
          const base = layer ? '#2c4a52' : '#3a5c66';
          for (let y = -rad; y < rad; y++) {
            const hw = Math.sqrt(rad * rad - y * y) * 1.3;
            const light = -y / rad;
            px(ctx, cx - hw, cy + y, shade(base, light * 0.15), hw * 2, 1);
          }
        }
      }
    } else {
      // Distant soft plant silhouettes give the water depth.
      const sil = id === 'black' ? '#0e1a1e' : id === 'blue' ? '#1e4a72' : '#3a7e8e';
      for (let i = 0; i < 22; i++) {
        const bx = r.range(0, W);
        const h = r.range(40, 150) * RES;
        const lean = r.range(-0.3, 0.3);
        for (let y = 0; y < h; y += RES) {
          const w = Math.max(RES, (1 - y / h) * r.range(2, 5) * RES);
          px(ctx, bx + lean * y + Math.sin(y * 0.03) * 3 * RES, waterH - y, sil, w, RES);
        }
      }
      if (id === 'none') {
        // The shop wall seen through clear glass.
        // Soft hint of the shop wall seen through clear glass.
        px(ctx, 0, waterH * 0.42, 'rgba(120,180,190,0.12)', W, 2 * RES);
      }
      if (id === 'blue') {
        for (let i = 0; i < 30; i++) px(ctx, r.range(0, W), r.range(0, waterH * 0.6), 'rgba(160,210,255,0.18)', 3 * RES, 3 * RES);
      }
    }
  });
  return key;
}

function ensureSubstrate(s: Phaser.Scene, id: string): string {
  const key = `substrate2:${id}`;
  if (s.textures.exists(key)) return key;
  const sub = getSubstrate(id);
  const subH = VIEW.subBottom - VIEW.floor + 12 * RES;
  makeTexture(s, key, W, subH, (ctx) => {
    const r = new Rng(17);
    const surf = (x: number) => Math.round((3 + Math.sin(x * 0.025) * 2 + Math.sin(x * 0.085) * 1.2) * RES);
    // Base with depth darkening.
    for (let x = 0; x < W; x++) {
      const b = surf(x);
      for (let y = b; y < subH; y++) {
        const depthShade = (y - b) / subH;
        px(ctx, x, y, shade(mix(sub.colourA, sub.colourB, 0.4), -depthShade * 0.3));
      }
    }
    if (id === 'bare') {
      for (let x = 0; x < W; x += RES * 30) px(ctx, x, surf(x) + 4 * RES, 'rgba(255,255,255,0.12)', 12 * RES, RES);
      return;
    }
    const cols = [sub.colourA, sub.colourB, shade(sub.colourA, -0.15), shade(sub.colourB, 0.12), shade(sub.colourA, 0.08)];
    if (id === 'sand') {
      // Fine grains and gentle ripples.
      for (let i = 0; i < W * subH * 0.35; i++) {
        const x = r.range(0, W);
        const y = r.range(0, subH);
        if (y < surf(x)) continue;
        px(ctx, x, y, shade(r.pick(cols), (r.next() - 0.5) * 0.12), 1, 1);
      }
      for (let y = 8 * RES; y < subH; y += 7 * RES) {
        for (let x = 0; x < W; x += 2) px(ctx, x, y + Math.sin(x * 0.04 + y) * 2 * RES, 'rgba(255,250,230,0.18)', 2, 1);
      }
    } else {
      // Gravel: individually shaded pebbles packed together.
      const pebbles = Math.round((W * subH) / (9 * RES * RES));
      for (let i = 0; i < pebbles; i++) {
        const x = r.range(0, W);
        const yTop = surf(x);
        const y = r.range(yTop, subH);
        const rx = r.range(1.2, 3.2) * RES;
        const ry = rx * r.range(0.6, 0.9);
        const base = r.pick(cols);
        const dark = (y - yTop) / subH;
        for (let yy = -ry; yy <= ry; yy++) {
          for (let xx = -rx; xx <= rx; xx++) {
            const d = (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry);
            if (d > 1 || y + yy < yTop) continue;
            const light = -xx / rx * 0.3 - yy / ry * 0.5;
            px(ctx, x + xx, y + yy, shade(base, light * 0.35 - dark * 0.3 + (d > 0.75 ? -0.15 : 0)));
          }
        }
      }
    }
    // Lit top edge.
    for (let x = 0; x < W; x++) px(ctx, x, surf(x), shade(sub.colourB, 0.25), 1, RES);
  });
  return key;
}
