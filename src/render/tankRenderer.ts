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
const getSubstrateColour = (id: string) => getSubstrate(id).colourB;
import { fishInTank } from '../sim/fish';
import type { DecorItem, FishEntity, GameState, TankState } from '../sim/types';
import { buildPlant, drawPlant, type PlantModel } from './art/plantArt';
import { ensureHardscapeTexture } from './art/hardscapeArt';
import { ensureMulm, ensureSubstrate, substrateContour, substratePad } from './art/substrateArt';
import { useTexture } from './textureCache';
import { reducedMotion } from '../ui/displayPrefs';
import { FloatingLayer } from './floatingLayer';
import { LightMap, waterLook, type LightBox } from './lighting';
import { AdaptiveQuality, detailScale, qualitySettings } from './quality';
import { OpticsHost } from './fx/opticsHost';
import type { OpticsInput } from './fx/opticsParams';
import { hardscapeTint, mulmAlpha, pearlRate, stepLightLevel, surfaceFilm } from './stateVisuals';
import { portionCover } from '../sim/floating';
import { makeTexture } from './art/pixel';
import { FishAgent, type HideSpot, type Pellet } from './fishBehaviour';
import { CritterAgent, type CritterWorld } from './critterBehaviour';
import { isCritterShape } from './art/critterArt';
import { CORAL_FRAMES, coralGlow, ensureCoralTexture } from './art/coralArt';
import { getSpecies } from '../data/species';
import { assessCoral, perchOf, reefLight, reefState, tankFlow } from '../sim/reef';
import { beginFishFrame } from './art/fishArt';
import { CANVAS_H, CANVAS_W, RES } from './res';
import { enclosureFeeder, isEnclosure, isLandOnly, isPaludarium, terraOf } from '../sim/terrarium';
import { PALUDARIUM_WATER } from '../data/terra';
import { ensureBank, ensureCondensation, ensureLampCone, ensureMould, landWallPixel, paintLandWall } from './art/enclosureArt';

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
  /** Corals: animated polyp sheet, fluorescence overlay and frame phase. */
  coral?: { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Sprite; phase: number; w: number; h: number };
}

interface Bubble {
  obj: Phaser.GameObjects.Image;
  vy: number;
  wob: number;
  grow: number;
}

interface Pearl {
  obj: Phaser.GameObjects.Image;
  vy: number;
  wob: number;
}

interface Speck {
  obj: Phaser.GameObjects.Rectangle;
  depth: number;
}

/** Enclosure geometry: land-only (vivarium, terrarium) or a paludarium with a soil bank and a pool. */
interface EnclosureGeom {
  land: boolean;
  /** Paludarium pool: x range and water surface. */
  pool: { left: number; right: number; y: number } | null;
  /** Height of the soil bank above the floor (canvas px). */
  bank: number;
}

interface Mist {
  obj: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
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
/** Nominal base line for a decor layer (flat bed); the renderer adds the tank's contour. */
export function decorBaseY(layer: number): number {
  return VIEW.floor - 9 * RES + layer * 2.5 * RES;
}
export function decorScale(tank: TankState): number {
  return clamp(Math.sqrt(60 / tank.lengthCm), 0.6, 1.1) * RES;
}

export class TankRenderer {
  world: CritterWorld;
  agents = new Map<string, FishAgent | CritterAgent>();
  selectedId: string | null = null;
  private decorViews: DecorView[] = [];
  /** Plant drawing: [layer][bucket]. Plants are split into buckets redrawn on alternate frames so the cost is even. */
  private plantGfx: Phaser.GameObjects.Graphics[][] = [];
  private plantBuckets = 1;
  private bubbles: Bubble[] = [];
  private specks: Speck[] = [];
  private puffs: Array<{ obj: Phaser.GameObjects.Rectangle; vx: number; vy: number; life: number }> = [];
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
  private contour: (x: number) => number;
  private lightMap: LightMap;
  private lightT = 0;
  private lightBoxes: LightBox[] = [];
  private floating: FloatingLayer;
  private floatPreview: string | null = null;
  private waterTint: Phaser.GameObjects.Rectangle;
  /** Reef tanks: additive actinic-blue wash over the water. */
  private reefWash: Phaser.GameObjects.Rectangle;
  private frameNo = 0;
  private q = qualitySettings();
  private adaptive = new AdaptiveQuality();
  /** 0..1: lights fade on and off over about a second instead of snapping. */
  private lightLevel = 1;
  /** Calm motion (setting or device preference), re-read every second. */
  private calm = false;
  private calmT = 0;
  private pearls: Pearl[] = [];
  private mulmImage: Phaser.GameObjects.Image | null = null;
  private reflections: Phaser.GameObjects.Sprite[] = [];
  private hardscapeTintT = 0;
  /** Vivarium, terrarium or paludarium layout; null for an aquarium. */
  private encl: EnclosureGeom | null = null;
  private bankImage: Phaser.GameObjects.Image | null = null;
  private poolWater: Phaser.GameObjects.Rectangle | null = null;
  private condense: Phaser.GameObjects.Image | null = null;
  private mould: Phaser.GameObjects.Image | null = null;
  private kit: Phaser.GameObjects.Graphics | null = null;
  private lampCone: Phaser.GameObjects.Image | null = null;
  private baskGlow: Phaser.GameObjects.Ellipse | null = null;
  private uvbGlow: Phaser.GameObjects.Rectangle | null = null;
  private dishGfx: Phaser.GameObjects.Graphics | null = null;
  private dishKey = '';
  private mist: Mist[] = [];
  private mistT = 2;
  private feeder: string | null = null;
  /** Water optics pass (caustics, shafts, depth, surface, glass, haze); null effect at Low. */
  private optics: OpticsHost;
  /** Texture texels per tank canvas pixel for painted art (see quality.detailScale). */
  readonly detail: number;
  private glassSheen: Phaser.GameObjects.Image | null = null;
  /** Vertex-shaded plants need WebGL; the Canvas renderer gets flat polygons. */
  private readonly smoothPlants: boolean;

  constructor(public scene: Phaser.Scene, private getState: () => GameState, public tankId: string, private opts: TankRendererOptions = {}) {
    const tank = this.tank;
    if (isEnclosure(tank)) {
      this.encl = {
        land: isLandOnly(tank),
        pool: isPaludarium(tank) ? { left: VIEW.left + W * (1 - PALUDARIUM_WATER), right: VIEW.right, y: VIEW.floor - 92 * RES } : null,
        bank: 104 * RES,
      };
    }
    const encl = this.encl;
    this.lightLevel = tank.lightOn ? 1 : 0;
    this.calm = reducedMotion();
    this.contour = substrateContour(tankId, W, RES);
    this.lightMap = new LightMap(VIEW.left, VIEW.right, VIEW.surface, VIEW.floor, this.q.lightCells);
    this.optics = new OpticsHost(scene, this.lightMap, tankId);
    // Detail follows how large the camera shows the tank (phones show it below 1:1).
    const zoom = Math.min(scene.scale.width / CANVAS_W, scene.scale.height / CANVAS_H);
    this.detail = detailScale(zoom, this.q.maxDetail);
    this.smoothPlants = scene.game.config.renderType === Phaser.WEBGL;
    // Smooth sub-pixel motion in the tank view (the shop keeps whole-pixel snapping).
    scene.cameras.main.setRoundPixels(false);
    this.world = {
      // In a paludarium fish keep to the pool; land animals use `full`.
      left: encl?.pool ? encl.pool.left + 8 * RES : VIEW.left,
      right: VIEW.right,
      surface: encl?.pool ? encl.pool.y + 3 * RES : encl ? VIEW.frameTop + 10 * RES : VIEW.surface,
      full: encl ? { left: VIEW.left, right: VIEW.right, top: VIEW.frameTop + 16 * RES } : undefined,
      pool: encl?.pool ?? undefined,
      land: encl?.land,
      floor: VIEW.floor,
      pxPerCm: W / tank.lengthCm,
      lightsOn: tank.lightOn,
      pellets: [],
      hides: [],
      agents: [],
      flow: 0.5,
      scale: RES,
      schools: new Map(),
      lightAt: (x, y) => this.lightAt(x, y),
      onEat: (agent, pellet) => this.eat(agent, pellet),
      groundAt: (x) => this.baseYAt(1, x),
      detail: this.detail,
    };
    ensureSharedTextures(scene);
    scene.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x221d30).setOrigin(0, 0).setDepth(-10);
    this.buildRays();
    // Water: the whole tank, or only a paludarium's pool.
    const wl = encl?.pool ? encl.pool.left : VIEW.left;
    const ww = encl?.pool ? encl.pool.right - encl.pool.left : W;
    const ws = encl?.pool ? encl.pool.y : VIEW.surface;
    this.caustics = [
      scene.add.tileSprite(wl, VIEW.floor - 14 * RES, ww, VIEW.subBottom - VIEW.floor + 14 * RES, 'caustics').setOrigin(0, 0).setDepth(4.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.32),
      scene.add.tileSprite(wl, VIEW.floor - 14 * RES, ww, VIEW.subBottom - VIEW.floor + 14 * RES, 'caustics').setOrigin(0, 0).setDepth(4.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22).setFlipX(true),
      scene.add.tileSprite(wl, ws, ww, VIEW.floor - ws, 'caustics').setOrigin(0, 0).setDepth(0.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.07),
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
    this.floating = new FloatingLayer(scene, VIEW.left, VIEW.right, VIEW.surface, RES, hashUid(tankId));
    this.waterTint = scene.add.rectangle(wl, ws - 3 * RES, ww, VIEW.subBottom - ws, 0x8a5418, 0).setOrigin(0, 0).setDepth(29.5);
    this.reefWash = scene.add.rectangle(wl, ws - 3 * RES, ww, VIEW.subBottom - ws, 0x2a4ab8, 0).setOrigin(0, 0).setDepth(29.6).setBlendMode(Phaser.BlendModes.ADD);
    if (encl) {
      const top = VIEW.frameTop;
      const h = VIEW.subBottom - top;
      this.condense = scene.add.image(VIEW.left, top, ensureCondensation(scene, W, h, RES)).setOrigin(0, 0).setDepth(31.5).setAlpha(0);
      this.mould = scene.add.image(VIEW.left, top, ensureMould(scene, W, h, VIEW.floor - top - 4 * RES, RES)).setOrigin(0, 0).setDepth(31.4).setAlpha(0);
      this.overlays.night.setPosition(VIEW.left, top).setSize(W, h + 4 * RES);
      this.overlays.dirt.setPosition(VIEW.left, top);
      if (encl.pool) {
        // The pool's water body, seen against the back wall, and its cloudiness.
        this.poolWater = scene.add.rectangle(wl, ws - RES, ww, VIEW.subBottom - ws + RES, 0x2e6e78, 0.3).setOrigin(0, 0).setDepth(0.5);
        this.overlays.cloud.setPosition(wl, ws).setSize(ww, VIEW.subBottom - ws);
        this.overlays.algae.setCrop(wl - VIEW.left, ws - (VIEW.surface - 3 * RES), ww, VIEW.subBottom - ws);
      }
      if (encl.land) this.dishGfx = scene.add.graphics().setDepth(21);
      this.feeder = enclosureFeeder(this.getState(), tank);
    }
    this.syncFish();
    for (let i = 0; i < this.q.specks; i++) {
      const depth = vr.next();
      const size = depth > 0.7 ? 2 : 1;
      const obj = scene.add
        .rectangle(vr.range(VIEW.left, VIEW.right), vr.range(VIEW.surface, VIEW.floor), size, size, depth > 0.5 ? 0xeef8ff : 0xb8d8e0, vr.range(0.12, 0.4) * (0.5 + depth))
        .setDepth(depth > 0.6 ? 26 : 8);
      this.specks.push({ obj, depth });
    }
    this.applyOpticsMode();
  }

  /**
   * A vertical cylinder (tube, heater, filter body) shaded across its width:
   * lit from the upper left, a narrow highlight, a darker far edge. Flat on
   * the Canvas renderer, which has no gradient fills.
   */
  private cylinder(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: number, a = 1): void {
    if (!this.smoothPlants) {
      g.fillStyle(c, a).fillRect(x, y, w, h);
      return;
    }
    const k = (m: number) => {
      const r = Math.min(255, ((c >> 16) & 255) * m);
      const gg = Math.min(255, ((c >> 8) & 255) * m);
      const b = Math.min(255, (c & 255) * m);
      return (r << 16) | (gg << 8) | b;
    };
    const s = x + w * 0.32;
    g.fillGradientStyle(k(0.62), k(1.45), k(0.62), k(1.45), a).fillRect(x, y, s - x, h);
    g.fillGradientStyle(k(1.45), k(0.45), k(1.45), k(0.45), a).fillRect(s, y, x + w - s, h);
  }

  /** Hardscape painted at the view's detail; sizes returned in tank canvas pixels. */
  private hardscape(def: ReturnType<typeof getDecor>, scale: number): { key: string; w: number; h: number } {
    const tex = ensureHardscapeTexture(this.scene, def, scale * this.detail);
    return { key: tex.key, w: tex.w / this.detail, h: tex.h / this.detail };
  }

  /** Optics pass on (Standard, High) or the older per-object light effects (Low, Canvas). */
  private applyOpticsMode(): void {
    const on = this.optics.enable(this.q.optics);
    for (const r of this.rays) r.setVisible(!on);
    for (const c of this.caustics) c.setVisible(!on);
    this.glassSheen?.setVisible(!on);
  }

  /** World-space inputs for the optics pass, from the tank's state. */
  private opticsInput(t: TankState, lit: number, light: number, actinic: number): OpticsInput {
    const pool = this.encl?.pool;
    const water = this.encl ? (pool ? { x0: pool.left, y0: pool.y, x1: pool.right, y1: VIEW.subBottom } : null) : { x0: VIEW.left, y0: VIEW.surface, x1: VIEW.right, y1: VIEW.subBottom };
    const marine = t.waterType === 'marine';
    const green = Math.max(0, t.algae - 0.55);
    const look = waterLook(t);
    const tannin = !marine && look.tint === 0x8a5418 ? look.tintAlpha : 0;
    const waterColour = green > 0.05 ? 0x2f5a26 : marine ? 0x0c3c78 : tannin > 0.06 ? 0x4a3414 : 0x1a4a48;
    const cloud = this.encl?.land ? 0 : t.water.cloudiness;
    const humid = this.encl ? clamp((terraOf(t).humidity - 40) / 55, 0, 1) : 0;
    return {
      tank: { x0: VIEW.left, y0: VIEW.frameTop, x1: VIEW.right, y1: VIEW.subBottom },
      water,
      lightMap: { x0: VIEW.left, y0: VIEW.surface, x1: VIEW.right, y1: VIEW.floor },
      floor: VIEW.floor,
      lit,
      light,
      waterColour,
      caustics: this.q.caustics ? (marine ? 1.15 : 0.95) * (1 - cloud * 0.8) * (0.4 + 0.6 * actinicWhite(actinic)) : 0,
      rays: (this.q.caustics ? 1 : 0.6) * (1 - cloud * 0.6) * (this.encl ? 0.7 : 1),
      fog: 0.4 + cloud * 2.2 + green * 1.5,
      glass: 1,
      mirror: 7 * RES,
      smoothEdges: this.q.smoothEdges,
      haze: this.encl ? 0.25 + humid * 0.75 : 0,
    };
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
    // Enclosures have no water line: the back wall runs up to the lid.
    const bgTop = this.encl ? VIEW.frameTop : VIEW.surface - 4 * RES;
    const bgKey = ensureBackground(this.scene, bgId, VIEW.subBottom + 2 * RES - bgTop);
    const D = this.detail;
    const subKey = ensureSubstrate(this.scene, subId, this.tankId, Math.round(W * D), Math.round((VIEW.subBottom - VIEW.floor + 12 * RES) * D), RES * D);
    if (!this.bgImage) this.bgImage = this.scene.add.image(VIEW.left, bgTop, bgKey).setOrigin(0, 0).setDepth(0);
    else this.bgImage.setTexture(bgKey);
    if (this.encl?.pool) {
      const pool = this.encl.pool;
      const y0 = Math.round(VIEW.floor - this.encl.bank - 24 * RES);
      const bw = Math.round(pool.left - VIEW.left + 24 * RES);
      const bankKey = ensureBank(this.scene, `bank:${this.tankId}:${subId}`, subId, bw, VIEW.subBottom - y0, RES, (xx) => {
        const x = VIEW.left + xx;
        // The bank stops where it has run down into the pool bed.
        if (this.bankLift(x) < 4 * RES) return Infinity;
        return this.baseYAt(0, x) - 2 * RES - y0;
      }, pool.y - y0);
      useTexture(this.scene, 'bank', bankKey, 4);
      if (!this.bankImage) this.bankImage = this.scene.add.image(VIEW.left, y0, bankKey).setOrigin(0, 0).setDepth(4.3);
      else this.bankImage.setTexture(bankKey);
    }
    if (!this.subImage) this.subImage = this.scene.add.image(VIEW.left, VIEW.floor - 6 * RES - substratePad(RES), subKey).setOrigin(0, 0).setDepth(4).setScale(1 / D);
    else this.subImage.setTexture(subKey);
    useTexture(this.scene, 'substrate', subKey, 6);
    const mulmKey = ensureMulm(this.scene, this.tankId, Math.round(W * D), RES * D);
    useTexture(this.scene, 'mulm', mulmKey, 6);
    if (!this.mulmImage) this.mulmImage = this.scene.add.image(VIEW.left, VIEW.floor - 6 * RES - substratePad(RES), mulmKey).setOrigin(0, 0).setDepth(4.1).setAlpha(0).setScale(1 / D);
  }

  /** Shows a substrate/background without buying it. Pass {} to clear. */
  setLook(preview: { backgroundId?: string; substrateId?: string }): void {
    this.preview = { ...preview };
    this.applyLook();
  }

  private rebuildEquipment(): void {
    const t = this.tank;
    const tr = this.encl ? terraOf(t) : null;
    const key = `${t.filterId}|${t.heaterId}|${t.airStone}|${t.reef?.wavemaker ?? 0}|${t.reef?.light ?? ''}|${tr ? `${tr.mister}|${tr.heatLamp !== null}|${tr.uvb}|${tr.vent}` : ''}`;
    if (key === this.equipKey) return;
    this.equipKey = key;
    this.equipment?.destroy();
    this.heaterGlow?.destroy();
    this.heaterGlow = null;
    const R = RES;
    const g = this.scene.add.graphics().setDepth(3);
    const filter = getFilter(t.filterId);
    if (this.encl) {
      this.equipment = g;
      this.buildEnclosureKit(g);
      return;
    }
    const cyl = (x: number, y: number, w: number, h: number, c: number, a = 1) => this.cylinder(g, x, y, w, h, c, a);
    if (filter.id === 'sponge') {
      const fx = VIEW.right - 34 * R;
      cyl(fx - 2 * R, VIEW.floor - 42 * R, 24 * R, 4 * R, 0x2a2a30);
      // Foam: a dark cylinder with an open-cell texture.
      cyl(fx, VIEW.floor - 38 * R, 20 * R, 34 * R, 0x3c3c48);
      for (let k = 0; k < 160; k++) {
        const px = fx + vr.range(1, 19) * R;
        const py = VIEW.floor - 38 * R + vr.range(1, 33) * R;
        g.fillStyle(0x15151b, 0.5).fillCircle(px, py, vr.range(0.3, 0.8) * R);
      }
      cyl(fx + 9 * R, VIEW.surface - 4 * R, 2 * R, VIEW.floor - VIEW.surface - 38 * R, 0xb8c0ca, 0.85);
    } else if (filter.id === 'hang_on') {
      cyl(VIEW.right - 58 * R, VIEW.frameTop - 4 * R, 46 * R, 22 * R, 0x30343e);
      g.fillStyle(0x4a505e).fillRect(VIEW.right - 56 * R, VIEW.frameTop - 2 * R, 42 * R, 3 * R);
      cyl(VIEW.right - 30 * R, VIEW.surface, 7 * R, 100 * R, 0x2a2e38);
      g.fillStyle(0x9fd6ff, 0.45).fillRect(VIEW.right - 52 * R, VIEW.surface - 2 * R, 18 * R, 8 * R);
    } else {
      cyl(VIEW.right - 28 * R, VIEW.surface - 6 * R, 6 * R, 160 * R, 0x2a2e38);
      for (let k = 0; k < 6; k++) cyl(VIEW.right - 29 * R, VIEW.surface + (120 + k * 5) * R, 8 * R, 2 * R, 0x1a1d24);
      cyl(VIEW.left + 40 * R, VIEW.surface - 6 * R, 6 * R, 40 * R, 0x2a2e38);
      g.fillStyle(0x262a33).fillRoundedRect(VIEW.left + 40 * R, VIEW.surface + 30 * R, 22 * R, 6 * R, 3 * R);
    }
    const wm = reefState(t).wavemaker ?? 0;
    if (t.waterType === 'marine' && wm > 0) {
      // Wavemaker: a puck on the back glass, upper left, with a grille.
      const wx = VIEW.left + 54 * R;
      const wy = VIEW.surface + 26 * R;
      const r = (wm > 1 ? 9 : 7) * R;
      g.fillStyle(0x1a1d24).fillCircle(wx, wy, r);
      g.fillStyle(0x2c303a).fillCircle(wx, wy, r - 2 * R);
      for (let k = -2; k <= 2; k++) g.fillStyle(0x14161c).fillRect(wx - r + 3 * R, wy + k * 2 * R, (r - 3 * R) * 2, R);
      g.fillStyle(0x3a8ad8, 0.9).fillRect(wx + r - 3 * R, wy - r + 2 * R, R, R);
    }
    if (t.waterType === 'marine' && reefLight(t).actinic > 0) {
      // Reef LED fixture: a dark puck array above the water with blue and white diodes.
      const fy = VIEW.frameTop - 2 * R;
      for (let x = VIEW.left + 40 * R; x < VIEW.right - 40 * R; x += 70 * R) {
        g.fillStyle(0x12141a).fillRect(x, fy, 46 * R, 6 * R);
        for (let k = 0; k < 6; k++) g.fillStyle(k % 2 ? 0x7a8aff : 0xe8f4ff).fillRect(x + 4 * R + k * 7 * R, fy + 4 * R, 3 * R, R);
      }
    }
    if (t.heaterId) {
      const hx = VIEW.left + 12 * R;
      // Glass heater: a clear tube with the element coil inside, black caps.
      cyl(hx, VIEW.surface + 8 * R, 8 * R, 112 * R, 0xcfe4ec, 0.32);
      for (let y = 0; y < 90 * R; y += 2 * R) g.fillStyle(0x8a5a3a, 0.45).fillEllipse(hx + 4 * R, VIEW.surface + 20 * R + y, 3.2 * R, 0.9 * R);
      g.fillStyle(0xffffff, 0.5).fillRect(hx + 1.5 * R, VIEW.surface + 9 * R, 0.6 * R, 110 * R);
      cyl(hx - R, VIEW.surface - 4 * R, 10 * R, 14 * R, 0x2a2a30);
      cyl(hx - R, VIEW.surface + 118 * R, 10 * R, 4 * R, 0x2a2a30);
      this.heaterGlow = this.scene.add.rectangle(hx + 4 * R, VIEW.surface + 66 * R, 3 * R, 84 * R, 0xff7a2a, 0).setDepth(3.1).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.equipment = g;
  }

  /**
   * Enclosure equipment: a small internal filter and heater in a paludarium's pool,
   * and on the mesh lid the basking lamp dome, the UVB tube and the mister nozzle,
   * with the lamp's warm cone and basking spot below.
   */
  private buildEnclosureKit(g: Phaser.GameObjects.Graphics): void {
    const t = this.tank;
    const tr = terraOf(t);
    const R = RES;
    const s = this.scene;
    const pool = this.encl!.pool;
    if (pool) {
      // Internal filter in the back corner of the pool, its outflow rippling the surface.
      const fx = VIEW.right - 24 * R;
      g.fillStyle(0x23262e).fillRect(fx, pool.y + 6 * R, 14 * R, 40 * R);
      g.fillStyle(0x343844).fillRect(fx, pool.y + 6 * R, 3 * R, 40 * R);
      for (let k = 0; k < 6; k++) g.fillStyle(0x15171c).fillRect(fx + 4 * R, pool.y + (24 + k * 3) * R, 8 * R, R);
      if (t.heaterId) {
        const hx = pool.left + 26 * R;
        g.fillStyle(0xcfe4ec, 0.35).fillRect(hx, pool.y + 8 * R, 6 * R, 60 * R);
        for (let y = 0; y < 48 * R; y += 3 * R) g.fillStyle(0x8a5a3a, 0.5).fillRect(hx + 2 * R, pool.y + 16 * R + y, 2 * R, R);
        g.fillStyle(0x2a2a30).fillRect(hx - R, pool.y + 4 * R, 8 * R, 6 * R);
      }
    }
    this.kit?.destroy();
    this.lampCone?.destroy();
    this.baskGlow?.destroy();
    this.uvbGlow?.destroy();
    this.lampCone = null;
    this.baskGlow = null;
    this.uvbGlow = null;
    const k = s.add.graphics().setDepth(41);
    this.kit = k;
    const lidY = VIEW.frameTop - 10 * R;
    if (tr.heatLamp !== null) {
      // Basking lamp: a ceramic dome resting on the mesh, with the bulb glowing through.
      const lx = VIEW.left + W * 0.24;
      k.fillStyle(0x16181e).fillEllipse(lx, lidY + R, 34 * R, 8 * R);
      k.fillStyle(0x2a2e38).fillRect(lx - 14 * R, lidY - 14 * R, 28 * R, 14 * R);
      k.fillStyle(0x3a404c).fillRect(lx - 14 * R, lidY - 14 * R, 28 * R, 3 * R);
      k.fillStyle(0x4a5262).fillRect(lx - 10 * R, lidY - 18 * R, 20 * R, 4 * R);
      k.fillStyle(0x1a1c22).fillRect(lx - 2 * R, lidY - 26 * R, 4 * R, 8 * R);
      const cone = ensureLampCone(s, 150 * R, VIEW.floor - VIEW.frameTop);
      this.lampCone = s.add.image(lx, VIEW.frameTop, cone).setOrigin(0.5, 0).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
      this.baskGlow = s.add.ellipse(lx, this.baseYAt(1, lx) - 2 * R, 90 * R, 14 * R, 0xffb060, 0).setDepth(4.4).setBlendMode(Phaser.BlendModes.ADD);
    }
    if (tr.uvb) {
      // A long UVB tube in a reflector on the lid.
      const ux0 = VIEW.left + W * 0.42;
      const ux1 = VIEW.left + W * 0.86;
      k.fillStyle(0x2a2e38).fillRect(ux0, lidY - 6 * R, ux1 - ux0, 6 * R);
      k.fillStyle(0x50586a).fillRect(ux0, lidY - 6 * R, ux1 - ux0, R);
      this.uvbGlow = s.add.rectangle(ux0, VIEW.frameTop + 2 * R, ux1 - ux0, 3 * R, 0xd8d0ff, 0).setOrigin(0, 0).setDepth(41.1).setBlendMode(Phaser.BlendModes.ADD);
    }
    if (tr.mister) {
      // Mister nozzle through the mesh, with its tubing running off to the pump.
      const mx = VIEW.right - W * 0.18;
      k.fillStyle(0x101216).fillRect(mx - R, lidY - 6 * R, 2 * R, 18 * R);
      k.fillStyle(0x1c1e24).fillRect(mx - 3 * R, VIEW.frameTop + R, 6 * R, 4 * R);
      k.fillStyle(0xd0d4dc).fillRect(mx - 2 * R, VIEW.frameTop + 5 * R, 4 * R, R);
      k.fillStyle(0x101216).fillRect(mx, lidY - 6 * R, VIEW.right - mx + 6 * R, R);
    }
  }

  /** Mesh lid, front-opening doors and a low front vent for enclosures. */
  private buildEnclosureFrame(frame: Phaser.GameObjects.Graphics): void {
    const R = RES;
    const top = VIEW.frameTop - 10 * R;
    // Mesh lid: a dark aluminium frame over fine grey mesh.
    frame.fillStyle(0x20232c).fillRect(VIEW.left - 6 * R, top, W + 12 * R, 12 * R);
    for (let x = VIEW.left; x < VIEW.right; x += 2 * R) frame.fillStyle(0x4a505c, 0.8).fillRect(x, top + 2 * R, R, 8 * R);
    for (let y = top + 2 * R; y < top + 10 * R; y += 2 * R) frame.fillStyle(0x3a3f4a, 0.8).fillRect(VIEW.left, y, W, R);
    frame.fillStyle(0x5a6070).fillRect(VIEW.left - 6 * R, top, W + 12 * R, R);
    if (this.encl!.land) {
      // Two front-opening doors meeting in the middle, with handles; they close onto the substrate tray.
      const mid = VIEW.left + W / 2;
      const bottom = VIEW.floor + 4 * R;
      frame.fillStyle(0x1c1e26).fillRect(mid - R, VIEW.frameTop, 2 * R, bottom - VIEW.frameTop);
      frame.fillStyle(0x3a3f4c).fillRect(mid - R, VIEW.frameTop, R, bottom - VIEW.frameTop);
      for (const hx of [mid - 7 * R, mid + 4 * R]) {
        frame.fillStyle(0x15171c).fillRect(hx, VIEW.frameTop + 90 * R, 3 * R, 16 * R);
        frame.fillStyle(0x6a7080).fillRect(hx, VIEW.frameTop + 90 * R, R, 16 * R);
      }
      frame.fillStyle(0x1c1e26, 0.8).fillRect(VIEW.left, bottom, W, R);
    }
  }

  private buildFrame(): void {
    const s = this.scene;
    const R = RES;
    const frame = s.add.graphics().setDepth(40);
    if (this.encl) this.buildEnclosureFrame(frame);
    else {
      // Hood with a lit strip.
      for (let y = 0; y < 12 * R; y++) frame.fillStyle(Phaser.Display.Color.GetColor(30 + y, 32 + y, 42 + y)).fillRect(VIEW.left - 6 * R, VIEW.frameTop - 10 * R + y, W + 12 * R, 1);
      frame.fillStyle(0xfff4d0, 0.8).fillRect(VIEW.left + 20 * R, VIEW.frameTop + R, W - 40 * R, R);
    }
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
    this.glassSheen = s.add.image(VIEW.left, VIEW.frameTop, 'glass-sheen').setOrigin(0, 0).setDepth(33);
  }

  private buildOverlays() {
    const s = this.scene;
    const H = VIEW.subBottom - VIEW.surface + 4 * RES;
    if (!s.textures.exists('overlay-algae')) {
      makeTexture(s, 'overlay-algae', W, H, (ctx) => {
        // Algae on the glass: a patchy green film thickest near the bottom and
        // corners, with darker spot algae dotted through it.
        const r = new Rng(77);
        const img = ctx.createImageData(W, H);
        const cell = 24 * RES;
        const gridW = Math.ceil(W / cell) + 2;
        const gridH = Math.ceil(H / cell) + 2;
        const grid = Array.from({ length: gridW * gridH }, () => r.next());
        const at = (gx: number, gy: number) => grid[Math.min(gridH - 1, gy) * gridW + Math.min(gridW - 1, gx)];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const fx = x / cell;
            const fy = y / cell;
            const xi = Math.floor(fx);
            const yi = Math.floor(fy);
            const u = fx - xi;
            const v = fy - yi;
            const su = u * u * (3 - 2 * u);
            const sv = v * v * (3 - 2 * v);
            const n = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * su + (at(xi, yi + 1) - at(xi, yi)) * sv + (at(xi, yi) - at(xi + 1, yi) - at(xi, yi + 1) + at(xi + 1, yi + 1)) * su * sv;
            const bias = (y / H) * 0.35 + Math.max(0, 1 - Math.min(x, W - x) / (W * 0.15)) * 0.3;
            const film = n * 0.7 + bias;
            if (film < 0.55) continue;
            const i = (y * W + x) * 4;
            const a = Math.min(0.5, (film - 0.55) * 1.4);
            img.data[i] = 78;
            img.data[i + 1] = 128 + Math.round(n * 30);
            img.data[i + 2] = 52;
            img.data[i + 3] = Math.round(a * 255);
          }
        }
        ctx.putImageData(img, 0, 0);
        // Spot algae: small hard green discs with a darker centre.
        for (let i = 0; i < 900; i++) {
          const x = r.range(0, W);
          const y = r.chance(0.6) ? r.range(H * 0.5, H) : r.range(0, H);
          const rad = r.range(0.4, 1.1) * RES;
          ctx.fillStyle = r.pick(['rgba(40,90,30,0.55)', 'rgba(60,110,40,0.45)']);
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      makeTexture(s, 'overlay-dirt', W, H, (ctx) => {
        const r = new Rng(91);
        // Dried spots and water marks on the glass, then soft wipe streaks.
        for (let i = 0; i < W * H * 0.006; i++) {
          ctx.fillStyle = r.pick(['rgba(120,110,80,0.2)', 'rgba(140,130,90,0.14)', 'rgba(200,200,190,0.1)']);
          ctx.beginPath();
          ctx.arc(r.range(0, W), r.range(0, H), r.range(0.3, 1.4) * RES, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          const x = r.range(0, W);
          const y = r.range(0, H);
          const len = r.range(20, 80) * RES;
          ctx.strokeStyle = 'rgba(150,140,110,0.14)';
          ctx.lineWidth = r.range(1, 3) * RES;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < len; k += RES * 2) ctx.lineTo(x + k, y + Math.sin(k * 0.05) * 3);
          ctx.stroke();
        }
      });
    }
    for (const k of ['overlay-algae', 'overlay-dirt']) s.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
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
    return JSON.stringify(this.tank.decor.map((d) => [d.uid, d.x, d.layer, Math.round(d.health * 10), Math.round((d.size ?? 1) * 20), Math.round((d.bleach ?? 0) * 8)]));
  }

  /** Base line for decor at canvas x in a layer, following the substrate contour. */
  private baseYAt(layer: number, x: number): number {
    return decorBaseY(layer) - this.contour(x - VIEW.left) - this.bankLift(x);
  }

  /** Paludarium: how far the soil bank lifts the ground at canvas x (0 in the pool). */
  private bankLift(x: number): number {
    const pool = this.encl?.pool;
    if (!pool) return 0;
    const t = clamp((pool.left + 14 * RES - x) / (54 * RES), 0, 1);
    const s = t * t * (3 - 2 * t);
    return s * (this.encl!.bank + Math.sin(x * 0.013) * 6 * RES + Math.sin(x * 0.041) * 2 * RES);
  }

  /** Where plants stop growing upward: the pool surface for pool plants, the lid on land. */
  private plantSurface(x: number): number {
    if (!this.encl) return VIEW.surface;
    if (this.encl.pool && x > this.encl.pool.left + 10 * RES) return this.encl.pool.y;
    return VIEW.frameTop + 10 * RES;
  }

  /** Recreates decor views from the tank's decor list. */
  rebuildDecor(): void {
    const t = this.tank;
    this.decorSignature = this.signature();
    for (const d of this.decorViews) {
      d.image?.destroy();
      d.coral?.sprite.destroy();
      d.coral?.glow.destroy();
    }
    this.decorViews = [];
    for (const g of this.plantGfx.flat()) g.destroy();
    this.plantBuckets = this.q.plantEvery;
    this.plantGfx = [0, 1, 2].map((layer) => Array.from({ length: this.plantBuckets }, () => this.scene.add.graphics().setDepth(layer === 0 ? 3.5 : layer === 1 ? 15 : 25)));
    const scale = decorScale(t);
    const hides: HideSpot[] = [];
    const boxes: LightBox[] = [];
    const corals: DecorItem[] = [];
    for (const item of [...t.decor].sort((a, b) => a.layer - b.layer)) {
      const def = getDecor(item.defId);
      const x = decorX(item.x);
      const baseY = this.baseYAt(item.layer, x);
      if (def.kind === 'coral') {
        // Corals sit on the rockwork, so they are placed after every rock.
        corals.push(item);
        continue;
      }
      if (def.kind === 'plant') {
        const plant = buildPlant(def, scale, hashUid(item.uid), item.health, item.size ?? 1);
        this.decorViews.push({ item, plant, image: null, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - plant.height * 0.4, r: Math.max(12 * RES, plant.width * 0.5), cave: false });
        // Canopy shade below the plant's crown (denser plants shade more).
        const amount = Math.min(0.3, 0.1 + def.cover * Math.min(1.4, item.size ?? 1) * 0.6);
        boxes.push({ x0: x - plant.width * 0.45, x1: x + plant.width * 0.45, y0: baseY - plant.height * 0.75, y1: baseY + 4 * RES, amount });
      } else {
        const tex = this.hardscape(def, scale);
        const img = this.scene.add.image(x, baseY + 2 * RES, tex.key).setOrigin(0.5, 1).setFlipX(item.flip).setScale(1 / this.detail);
        img.setDepth(item.layer === 0 ? 5 : item.layer === 1 ? 15 : 25);
        // Back hardscape sits a little deeper in the water: slightly darker and bluer.
        if (item.layer === 0) img.setTint(0xc8d4dc);
        this.decorViews.push({ item, plant: null, image: img, x, baseY, layer: item.layer });
        hides.push({ x, y: baseY - tex.h * 0.45, r: Math.max(10 * RES, tex.w * 0.45), cave: def.cave });
        if (def.kind === 'wood') boxes.push({ x0: x - tex.w * 0.4, x1: x + tex.w * 0.4, y0: baseY - tex.h * 0.6, y1: baseY, amount: 0.12 });
        if (def.cave) boxes.push({ x0: x - tex.w * 0.25, x1: x + tex.w * 0.25, y0: baseY - tex.h * 0.5, y1: baseY, amount: 0.35 });
      }
    }
    for (const item of corals) this.addCoralView(item, scale);
    this.world.hides = hides;
    this.lightBoxes = boxes;
    this.lightT = 0;
    this.hardscapeTintT = 0;
  }

  /** Where a coral sits on screen: on top of or halfway up its rock, or on the sand. */
  private coralSpot(item: Pick<DecorItem, 'x' | 'layer' | 'uid'>): { x: number; y: number; depth: number } {
    const t = this.tank;
    const { perch, rock } = perchOf(t, item);
    const x = decorX(item.x);
    if (!rock || perch === 'sand') return { x, y: this.baseYAt(2, x) + 2 * RES, depth: 22 };
    const rv = this.decorViews.find((d) => d.item.uid === rock.uid);
    const rockH = rv?.image?.displayHeight ?? getDecor(rock.defId).height * decorScale(t);
    const rockBase = rv ? rv.baseY + 2 * RES : this.baseYAt(rock.layer, decorX(rock.x));
    const rockDepth = rock.layer === 0 ? 5 : rock.layer === 1 ? 15 : 25;
    // The rock's outline rises toward its middle; sit a little lower near its edges.
    const off = Math.abs(x - decorX(rock.x)) / Math.max(1, (rv?.image?.displayWidth ?? rockH) / 2);
    const k = (perch === 'top' ? 0.86 : 0.5) * (1 - Math.min(0.5, off * off * 0.5));
    return { x, y: rockBase - rockH * k + 3 * RES, depth: rockDepth + 0.3 };
  }

  private coralLook(item: DecorItem, scale: number, healthyPreview = false) {
    const t = this.tank;
    const def = getDecor(item.defId);
    let ext = 1;
    if (!healthyPreview) {
      const a = assessCoral(t, item);
      // Polyps open in suitable flow and close up when unhappy or in the dark.
      ext = Math.max(0.15, Math.min(1, item.health) * (a.notes.some((n) => n.key === 'flow' && !n.good) ? 0.55 : 1) * (t.lightOn ? 1 : 0.7));
    }
    return { def, scale, size: item.size, health: healthyPreview ? 1 : item.health, bleach: healthyPreview ? 0 : item.bleach ?? 0, ext, seed: hashUid(item.uid) };
  }

  private addCoralView(item: DecorItem, scale: number): void {
    const def = getDecor(item.defId);
    const look = this.coralLook(item, scale * this.detail);
    const tex = ensureCoralTexture(this.scene, look);
    const D = this.detail;
    useTexture(this.scene, 'coral', tex.key, 48, this.decorViews.filter((d) => d.coral).map((d) => d.coral!.sprite.texture.key));
    const spot = this.coralSpot(item);
    const sprite = this.scene.add.sprite(spot.x, spot.y, tex.key, '0').setOrigin(0.5, 1).setDepth(spot.depth).setFlipX(item.flip).setScale(1 / D);
    const glow = this.scene.add.sprite(spot.x, spot.y, tex.key, '0').setOrigin(0.5, 1).setDepth(spot.depth + 0.01).setFlipX(item.flip).setBlendMode(Phaser.BlendModes.ADD).setTint(coralGlow(def)).setAlpha(0).setScale(1 / D);
    this.decorViews.push({ item, plant: null, image: null, x: spot.x, baseY: spot.y, layer: item.layer, coral: { sprite, glow, phase: (hashUid(item.uid) % 100) / 100 * CORAL_FRAMES, w: tex.w / D, h: tex.h / D } });
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
    else if (def.kind === 'coral') {
      const tex = ensureCoralTexture(this.scene, { def, scale: scale * this.detail, size: spec.size, health: 1, bleach: 0, ext: 1, seed: 4242 });
      this.ghostImage = this.scene.add.image(0, 0, tex.key, '0').setOrigin(0.5, 1).setDepth(27).setScale(1 / this.detail);
    } else {
      const tex = this.hardscape(def, scale);
      this.ghostImage = this.scene.add.image(0, 0, tex.key).setOrigin(0.5, 1).setDepth(27).setScale(1 / this.detail);
    }
  }

  /** Canvas-space box of a decor item (for edit highlights). */
  decorBounds(item: { defId: string; x: number; layer: number; size?: number; uid?: string }): { x: number; y: number; w: number; h: number } {
    const def = getDecor(item.defId);
    if (def.kind === 'coral') {
      const v = item.uid ? this.decorViews.find((d) => d.item.uid === item.uid)?.coral : undefined;
      const spot = this.coralSpot({ x: item.x, layer: item.layer as 0 | 1 | 2, uid: item.uid ?? '' });
      const w = v?.w ?? def.width * decorScale(this.tank);
      const h = v?.h ?? def.height * decorScale(this.tank);
      return { x: spot.x - w / 2, y: spot.y - h, w, h };
    }
    const scale = decorScale(this.tank);
    const g = def.kind === 'plant' ? 0.3 + 0.7 * Math.min(1.8, item.size ?? 1) : 1;
    const w = def.width * scale * (def.kind === 'plant' ? 0.5 + 0.5 * Math.min(g, 1.4) : 1);
    const h = def.height * scale * g;
    const x = decorX(item.x);
    const base = this.baseYAt(item.layer, x);
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
      const a = isCritterShape(getSpecies(f.speciesId).body.shape) ? new CritterAgent(this.scene, f, this.world) : new FishAgent(this.scene, f, this.world);
      a.sprite.on('pointerdown', () => {
        this.selectedId = f.id;
        this.opts.onSelect?.(f);
      });
      this.agents.set(f.id, a);
    }
    this.world.agents = [...this.agents.values()].filter((a): a is FishAgent => a instanceof FishAgent);
  }

  /** Spawns visual food for `units` of food: flakes on the water, or live feeders on land. */
  dropFood(units: number, x?: number): void {
    if (this.encl?.land) {
      this.dropFeeders(clamp(Math.round(units * 6), 3, 30), units);
      return;
    }
    const n = clamp(Math.round(units * 7), 4, 70);
    const pool = this.encl?.pool;
    const cx = x ?? (pool ? (pool.left + pool.right) / 2 + vr.range(-30, 30) * RES : (VIEW.left + VIEW.right) / 2 + vr.range(-80, 80) * RES);
    const spread = pool ? 26 : 40;
    for (let i = 0; i < n; i++) this.addPellet(clamp(cx + vr.range(-spread, spread) * RES, this.world.left + 4 * RES, VIEW.right - 4 * RES), (pool ? pool.y : VIEW.surface) - RES, units / n, false);
  }

  /**
   * Live feeders let loose on the land: crickets, fruit flies, or a dab of
   * gecko diet on a ledge. `units` is the food they carry (0 for a cosmetic
   * handful when the sim has already fed the animals).
   */
  dropFeeders(n: number, units = 0): void {
    if (!this.encl) return;
    this.feeder = enclosureFeeder(this.getState(), this.tank);
    const bug = this.feeder === 'crickets' ? 'cricket' : this.feeder === 'fruit_diet' ? 'fruit' : 'fly';
    const [l, r] = this.landRange();
    const cx = vr.range(l + 30 * RES, r - 30 * RES);
    for (let i = 0; i < n; i++) {
      const x = bug === 'fruit' ? cx + vr.range(-5, 5) * RES : vr.range(l, r);
      this.addPellet(x, this.baseYAt(1, x) - RES, units / n, true, bug);
    }
  }

  /** Canvas x range of dry land. */
  private landRange(): [number, number] {
    const pool = this.encl?.pool;
    return [VIEW.left + 14 * RES, pool ? pool.left - 12 * RES : VIEW.right - 14 * RES];
  }

  private addPellet(x: number, y: number, units: number, settled: boolean, bug?: Pellet['bug']): void {
    let obj: Phaser.GameObjects.Rectangle;
    if (bug === 'cricket') obj = this.scene.add.rectangle(Math.round(x), Math.round(y), 5, 2, vr.pick([0x6a4a24, 0x5a3c1c, 0x7a5a30])).setDepth(18);
    else if (bug === 'fly') obj = this.scene.add.rectangle(Math.round(x), Math.round(y), 2, 2, vr.pick([0x2a2418, 0x3a3020, 0x8a3a20])).setDepth(18);
    else if (bug === 'fruit') obj = this.scene.add.rectangle(Math.round(x), Math.round(y), 4, 3, vr.pick([0xe88a3a, 0xf0a048, 0xd8783a])).setDepth(18);
    else {
      const col = vr.pick([0xc8783a, 0xe0a050, 0xa85a2a, 0xd8c070, 0xb84a30]);
      obj = this.scene.add.rectangle(Math.round(x), Math.round(y), vr.pick([2, 3, 4]), vr.pick([2, 3]), col).setDepth(18);
      obj.rotation = vr.range(0, Math.PI);
    }
    this.world.pellets.push({ x, y, vy: 0, floatT: bug ? vr.range(0.3, 2.5) : settled ? 0 : vr.range(0.8, 3), units, settled, obj, bug });
  }

  /** Feeders on the move: crickets crawl and hop, fruit flies hover low, gecko diet stays put. */
  private moveFeeder(p: Pellet, dt: number): void {
    const [l, r] = this.landRange();
    if (p.bug === 'cricket') {
      p.floatT -= dt;
      p.x += Math.sin(this.time * 2 + p.units * 97 + p.vy) * 3 * RES * dt;
      if (p.floatT <= 0) {
        p.floatT = vr.range(0.6, 3);
        p.vy = vr.range(-16, 16) * RES;
      }
      if (Math.abs(p.vy) > 0.5) {
        const step = p.vy * dt * 3;
        p.x += step;
        p.vy *= 1 - dt * 3;
      }
      p.x = clamp(p.x, l, r);
      p.y = this.baseYAt(1, p.x) - RES - (Math.abs(p.vy) > 4 * RES ? 2 * RES : 0);
      p.obj.setScale(p.vy < 0 ? -1 : 1, 1);
    } else if (p.bug === 'fly') {
      const seed = p.floatT * 13;
      p.x = clamp(p.x + Math.sin(this.time * 4.3 + seed) * 22 * RES * dt, l, r);
      p.y = this.baseYAt(1, p.x) - (3 + Math.abs(Math.sin(this.time * 2.7 + seed)) * 14) * RES;
    }
    p.obj.setPosition(Math.round(p.x), Math.round(p.y));
  }

  private eat(agent: { fish: FishEntity }, pellet: Pellet): void {
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
      if (this.encl?.land) this.dropFeeders(1, Math.min(0.3, t.food - total));
      else this.addPellet(vr.range(this.world.left + 6 * RES, VIEW.right - 20 * RES), VIEW.floor - 3 * RES + vr.range(0, 2 * RES), Math.min(0.3, t.food - total), true);
    }
  }

  // -------------------------------------------------------------------------
  // Frame update

  /** 0..1 light at a canvas point: falls off with depth; shaded under plant canopies. */
  lightAt(x: number, y: number): number {
    return this.lightMap.at(x, y);
  }

  /** Shows a floating plant portion on the surface before buying/adding. */
  setFloatingPreview(id: string | null): void {
    this.floatPreview = id;
  }

  update(dt: number): void {
    beginFishFrame();
    this.time += dt;
    const t = this.tank;
    // Auto quality steps down after a sustained slow stretch (never up).
    const stepped = this.adaptive.sample(dt * 1000);
    if (stepped) {
      this.q = qualitySettings(stepped);
      this.applyOpticsMode();
    }
    this.calmT -= dt;
    if (this.calmT <= 0) {
      this.calmT = 1;
      this.calm = reducedMotion();
    }
    // Lights ramp over about a second, like a real LED unit.
    this.lightLevel = stepLightLevel(this.lightLevel, t.lightOn, dt);
    const lit = this.lightLevel;
    // Calm motion: slower water and light, smaller plant sway (fish behave the same).
    const mt = this.calm ? 0.35 : 1;
    if (this.signature() !== this.decorSignature) this.rebuildDecor();
    this.applyLook();
    this.rebuildEquipment();
    this.world.lightsOn = t.lightOn;
    this.world.flow = this.encl?.land
      ? 0.12 + terraOf(t).vent * 0.25
      : 0.3 + getFilter(t.filterId).aeration + (t.airStone ? 0.3 : 0) + (t.waterType === 'marine' ? tankFlow(t) * 0.8 : 0);
    this.syncFish();

    // Food flakes flutter at the surface then sink with a little spin.
    for (const p of this.world.pellets) {
      if (p.bug) {
        this.moveFeeder(p, dt);
        continue;
      }
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
      a.update(dt, this.world, this.time);
    }

    // Bottom feeders kick up little puffs of substrate while sifting.
    for (const a of this.agents.values()) {
      if (a.mode === 'sift' && a.fish.alive && a.y > VIEW.floor - 30 * RES && Math.random() < dt * 2.5) this.puff(a.x + a.heading * a.len * 0.3, this.baseYAt(1, a.x));
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.obj.y += p.vy * dt;
      p.obj.x += p.vx * dt;
      p.vy *= 1 - dt * 2;
      p.obj.setAlpha(Math.max(0, p.life) * 0.9);
      if (p.life <= 0) {
        p.obj.destroy();
        this.puffs.splice(i, 1);
      }
    }

    // Soft fish shadows on the substrate (stronger for fish near the bottom).
    this.shadowGfx.clear();
    if (lit > 0.05 && this.q.fishShadows) {
      const waterH = VIEW.floor - VIEW.surface;
      for (const a of this.agents.values()) {
        if (!a.fish.alive) continue;
        const above = clamp(((this.encl ? this.baseYAt(1, a.x) : VIEW.floor) - a.y) / waterH, 0, 1);
        const alpha = (0.22 * (1 - above) * (1 - above) + 0.03) * this.lightMap.at(a.x, VIEW.floor - 10 * RES) * lit;
        const w = a.len * (0.75 - above * 0.3);
        const sx = a.x + above * 12 * RES;
        this.shadowGfx.fillStyle(0x0a1418, alpha).fillEllipse(sx, this.baseYAt(1, sx) + RES, w, Math.max(2 * RES, w * 0.16));
      }
    }

    // Floating plants and the light map (shade from mats, canopies, wood, caves).
    this.frameNo++;
    const floatChanged = this.floating.sync(t, this.floatPreview, this.floatPreview ? portionCover(t) * 3 : 0);
    if (floatChanged) this.floating.markPreview(t, this.floatPreview);
    this.lightT -= dt;
    if (this.lightT <= 0 || floatChanged) {
      this.lightT = 0.5;
      this.lightMap.rebuild(t.lightOn, (x) => this.floating.shadeAt(x), this.lightBoxes);
      this.optics.uploadLightMap();
    }
    this.floating.draw(this.time * (this.calm ? 0.5 : 1), this.world.flow * mt, t.lightOn, this.q.rootDetail, this.floatPreview);

    // Plants: one bucket per frame, so each plant redraws every plantEvery
    // frames and the work is spread evenly (no alternate heavy frames).
    if (this.plantBuckets !== this.q.plantEvery) this.rebuildDecor();
    {
      const b = this.frameNo % this.plantBuckets;
      for (const layer of this.plantGfx) layer[b].clear();
      const light = (x: number, y: number) => this.lightMap.at(x, y);
      const opts = { time: this.time * (this.calm ? 0.5 : 1), flow: this.world.flow * mt, surfaceY: VIEW.surface, light, smooth: this.smoothPlants };
      let i = 0;
      for (const d of this.decorViews) {
        if (!d.plant) continue;
        if (i++ % this.plantBuckets === b) drawPlant(this.plantGfx[d.layer][b], d.plant, d.x, d.baseY, { ...opts, surfaceY: this.plantSurface(d.x), layer: d.layer });
      }
    }

    // Corals: polyps sway through their frames (faster in stronger flow), lit by the light map,
    // and fluoresce under actinic reef light, most visibly when the white channels are off.
    const actinic = t.waterType === 'marine' ? reefLight(t).actinic : 0;
    for (const d of this.decorViews) {
      if (!d.coral) continue;
      const rate = (1.2 + this.world.flow * 1.6) * (this.calm ? 0.4 : 1);
      const fr = Math.floor(this.time * rate + d.coral.phase) % CORAL_FRAMES;
      d.coral.sprite.setFrame(String(fr));
      d.coral.glow.setFrame(String(fr));
      const light = this.lightMap.at(d.x, d.baseY - d.coral.h * 0.5);
      const k = clamp(0.55 + 0.5 * light * lit + (1 - lit) * 0.05, 0.3, 1.05);
      const c = Math.round(255 * k);
      d.coral.sprite.setTint((c << 16) | (c << 8) | Math.round(255 * clamp(k + 0.08 * actinic, 0, 1)));
      d.coral.glow.setAlpha(actinic * (0.16 * lit + 0.42 * (1 - lit)) * (1 - (d.item.bleach ?? 0)) * Math.min(1, d.item.health + 0.2));
    }

    // Aquascape ghost preview.
    this.ghostGfx.clear();
    if (this.ghost) {
      const gx = decorX(this.ghost.x);
      const coralGhost = getDecor(this.ghost.defId).kind === 'coral';
      const gy = coralGhost ? this.coralSpot({ x: this.ghost.x, layer: this.ghost.layer, uid: '' }).y : this.baseYAt(this.ghost.layer, gx);
      const pulse = 0.55 + Math.sin(this.time * 5) * 0.15;
      if (this.ghostPlant) drawPlant(this.ghostGfx, this.ghostPlant, gx, gy, { time: this.time, flow: this.world.flow, alpha: pulse, surfaceY: VIEW.surface, smooth: this.smoothPlants });
      if (this.ghostImage) this.ghostImage.setPosition(gx, gy + 2 * RES).setAlpha(pulse).setTint(0xfff6c8);
      this.ghostGfx.fillStyle(0xfff27a, 0.9).fillRect(gx - RES, gy + 3 * RES, 2 * RES, 6 * RES);
    }

    // Bubbles: grow and wobble as they rise.
    this.bubbleTimer -= dt;
    const filter = getFilter(t.filterId);
    const pool = this.encl?.pool;
    if (this.encl) {
      // A paludarium's internal filter stirs the pool; land-only enclosures have no water.
      if (pool && this.bubbleTimer <= 0) {
        this.bubbleTimer = t.airStone ? 0.08 : 0.5;
        this.spawnBubble(VIEW.right - 17 * RES + vr.range(-2, 2) * RES, pool.y + 30 * RES);
        if (t.airStone) this.spawnBubble((pool.left + pool.right) / 2 + vr.range(-5, 5) * RES, VIEW.floor - 2 * RES);
      }
    } else if (this.bubbleTimer <= 0) {
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
      if (b.obj.y < (pool ? pool.y : VIEW.surface) + RES) {
        b.obj.destroy();
        this.bubbles.splice(i, 1);
      }
    }

    this.updatePearls(dt, t, lit);

    // Suspended particles with parallax drift. How many show depends on the
    // water: a clean, young tank is nearly clear; detritus and cloudiness add more.
    // In enclosures they are fine mist and dust motes in the air, more in humid air.
    const murk = this.encl ? clamp((terraOf(t).humidity - 45) / 80, 0.08, 0.5) : clamp(0.25 + t.water.detritus / 6 + t.water.cloudiness * 1.5, 0, 1);
    const visibleSpecks = Math.round(Math.min(this.specks.length, this.q.specks) * murk);
    for (const [i, p] of this.specks.entries()) {
      const o = p.obj;
      o.setVisible(i < visibleSpecks);
      o.y += (Math.sin(this.time * 0.5 + o.x * 0.01) * 2 - 0.4) * RES * dt * (0.5 + p.depth);
      o.x += Math.cos(this.time * 0.3 + o.y * 0.02) * 3 * RES * dt * this.world.flow * (0.5 + p.depth);
      if (o.y < VIEW.surface) o.y = VIEW.floor;
      if (o.y > VIEW.floor) o.y = VIEW.surface;
      if (o.x < VIEW.left) o.x = VIEW.right;
      if (o.x > VIEW.right) o.x = VIEW.left;
    }

    // Light: rays sway, caustics drift.
    const look = waterLook(t);
    const meanLight = this.lightMap.mean();
    this.rays.forEach((r, i) => {
      const shade = this.floating.shadeAt(r.x + 20 * RES);
      r.setTint(this.encl ? 0xfff0d0 : actinic > 0 ? 0xbcd4ff : look.light);
      const sway = this.calm ? 0 : Math.sin(this.time * 0.6 + i * 1.7) * 0.35;
      r.setAlpha((0.55 + sway) * (1 - shade * 0.9) * lit * (this.encl ? 0.45 : 1));
      if (!this.calm) r.x += Math.sin(this.time * 0.25 + i) * 0.08 * RES;
    });
    const cOn = (0.15 + 0.85 * lit) * (this.q.caustics && !this.encl?.land ? 1 : 0) * Math.min(1, meanLight * 1.2);
    const ct = this.time * (this.calm ? 0.25 : 1);
    for (const c of this.caustics) c.setTint(actinic > 0 ? 0xc8dcff : look.light);
    this.waterTint.setFillStyle(look.tint, this.encl?.land ? 0 : look.tintAlpha);
    this.reefWash.setFillStyle(0x2a4ab8, actinic * (0.14 * lit + 0.06));
    this.caustics[0].tilePositionX = ct * 7 * RES;
    this.caustics[0].tilePositionY = ct * 3 * RES;
    this.caustics[1].tilePositionX = -ct * 5 * RES;
    this.caustics[1].tilePositionY = ct * 4 * RES;
    this.caustics[2].tilePositionX = ct * 4 * RES;
    this.caustics[0].setAlpha(0.3 * cOn * (1 - t.water.cloudiness * 0.7));
    this.caustics[1].setAlpha(0.22 * cOn * (1 - t.water.cloudiness * 0.7));
    this.caustics[2].setAlpha(0.025 * cOn);

    if (this.optics.active) {
      const lc = this.encl ? 0xfff0d0 : actinic > 0 ? 0xbcd4ff : look.light;
      this.optics.update(this.opticsInput(t, lit, lc, actinic), this.time * (this.calm ? 0.3 : 1));
    }

    if (this.encl) {
      this.surfaceGfx.clear();
      if (this.encl.pool) this.drawSurface(t, lit, this.encl.pool);
      this.updateEnclosure(dt, t, lit);
    } else {
      this.drawSurface(t, lit);
      this.updateReflections(lit);
    }

    // Mulm settles on the bed with detritus; a gravel vac clears it.
    this.mulmImage?.setAlpha(mulmAlpha(t.water.detritus));
    // Hardscape: shade from the light map and a green-brown film as algae grows.
    this.hardscapeTintT -= dt;
    if (this.hardscapeTintT <= 0) {
      this.hardscapeTintT = 0.5;
      this.tintHardscape(t, lit);
    }

    if (this.heaterGlow) {
      const heating = !t.heaterBroken && t.water.temperature < t.heaterSetpoint - 0.1;
      this.heaterGlow.setFillStyle(t.heaterBroken ? 0x555555 : 0xff7a2a, heating ? 0.45 + Math.sin(this.time * 4) * 0.2 : 0.05);
    }

    // Cleanliness overlays.
    this.overlays.cloud.setFillStyle(0xdfe8e0, this.encl?.land ? 0 : clamp(t.water.cloudiness * 0.55, 0, 0.6));
    this.overlays.algae.setAlpha(this.encl?.land ? 0 : clamp(t.algae * 0.95, 0, 0.95));
    this.overlays.dirt.setAlpha(clamp(t.glassDirt * 0.9, 0, 0.9));
    // Reef tanks keep a dim blue moonlight at night, so corals still glow.
    this.overlays.night.setFillStyle(actinic > 0 ? 0x06124a : 0x0a1430, 0.45 * (1 - lit) * (actinic > 0 ? 0.85 : 1));

    // Selection marker.
    this.selectRing.clear();
    const sel = this.selectedId ? this.agents.get(this.selectedId) : null;
    if (sel) {
      // A soft glowing pointer that floats above the animal (smooth, sub-pixel).
      const bob = (this.calm ? 0.5 : 1) * Math.sin(this.time * 4) * 1.6 * RES;
      const x = sel.x;
      const y = sel.y - sel.height / 2 - 8 * RES + bob;
      const g = this.selectRing;
      g.fillStyle(0xfff27a, 0.18).fillCircle(x, y + 1.5 * RES, 6 * RES);
      g.fillStyle(0x14141c, 0.85).fillTriangle(x - 5.2 * RES, y - 1.2 * RES, x + 5.2 * RES, y - 1.2 * RES, x, y + 5.4 * RES);
      if (this.smoothPlants) g.fillGradientStyle(0xfffbd0, 0xfffbd0, 0xf2c640, 0xf2c640, 1);
      else g.fillStyle(0xfff27a, 1);
      g.fillTriangle(x - 4 * RES, y, x + 4 * RES, y, x, y + 4 * RES);
    } else if (this.selectedId && !this.getState().fish[this.selectedId]) {
      this.selectedId = null;
    }
  }

  /**
   * Enclosure state made visible: condensation on humid glass, mould fuzz, the
   * basking lamp's glow and warm spot, the UVB tube, the water dish, and mist
   * from the mister (or a recent hand misting) drifting down.
   */
  private updateEnclosure(dt: number, t: TankState, lit: number): void {
    const tr = terraOf(t);
    this.condense?.setAlpha(clamp((tr.humidity - 70) / 26, 0, 0.85));
    this.mould?.setAlpha(clamp(tr.mould * 1.1, 0, 0.95));
    this.poolWater?.setFillStyle(0x2e6e78, 0.2 + 0.1 * lit + t.water.cloudiness * 0.3);
    const flicker = this.calm ? 1 : 0.94 + Math.sin(this.time * 7) * 0.03 + Math.sin(this.time * 2.3) * 0.03;
    this.lampCone?.setAlpha(lit * flicker);
    this.baskGlow?.setFillStyle(0xffb060, 0.2 * lit * flicker);
    this.uvbGlow?.setFillStyle(0xd8d0ff, 0.55 * lit);
    if (this.dishGfx) {
      const x = VIEW.left + W * 0.8;
      const key = `${Math.round(tr.dish * 5)}|${Math.round(this.baseYAt(2, x))}`;
      if (key !== this.dishKey) {
        this.dishKey = key;
        this.drawDish(this.dishGfx, x, this.baseYAt(2, x) + RES, tr.dish);
      }
    }
    // Mist: the automatic mister sprays every so often while the lights are on;
    // a hand misting shows for a few game minutes.
    const recent = tr.lastMist !== undefined && this.getState().minute - tr.lastMist < 6;
    this.mistT -= dt;
    if (this.mistT <= 0 && (recent || (tr.mister && lit > 0.5))) {
      this.mistT = recent ? 0.05 : vr.range(9, 16);
      const bursts = recent ? 3 : 40;
      const x0 = recent ? vr.range(VIEW.left + 30 * RES, VIEW.right - 30 * RES) : VIEW.right - W * 0.18;
      for (let i = 0; i < bursts && this.mist.length < 160; i++) {
        const obj = this.scene.add.rectangle(x0 + vr.range(-4, 4) * RES, VIEW.frameTop + 6 * RES, vr.pick([1, 2]), vr.pick([1, 2]), 0xeef6ff, 0.7).setDepth(26);
        this.mist.push({ obj, vx: vr.range(-40, 40) * RES, vy: vr.range(10, 50) * RES, life: vr.range(1.5, 3.2) });
      }
    }
    for (let i = this.mist.length - 1; i >= 0; i--) {
      const m = this.mist[i];
      m.life -= dt;
      m.vx *= 1 - dt * 1.2;
      m.vy = Math.min(m.vy + 6 * RES * dt, 26 * RES);
      m.obj.x += m.vx * dt;
      m.obj.y += m.vy * dt;
      m.obj.setAlpha(Math.min(0.7, m.life * 0.4));
      if (m.life <= 0 || m.obj.y > VIEW.floor) {
        m.obj.destroy();
        this.mist.splice(i, 1);
      }
    }
  }

  /** A shallow stone water dish: clear when fresh, browner and lower as it fouls. */
  private drawDish(g: Phaser.GameObjects.Graphics, x: number, y: number, fresh: number): void {
    const R = RES;
    g.clear();
    g.fillStyle(0x0a0c10, 0.3).fillEllipse(x + 2 * R, y + R, 46 * R, 8 * R);
    g.fillStyle(0x5a5650).fillRect(x - 21 * R, y - 8 * R, 42 * R, 8 * R);
    g.fillStyle(0x6e6a62).fillEllipse(x, y - 8 * R, 44 * R, 8 * R);
    g.fillStyle(0x47443e).fillRect(x - 21 * R, y - 2 * R, 42 * R, 2 * R);
    g.fillStyle(0x7e7a70).fillRect(x - 21 * R, y - 8 * R, 42 * R, R);
    const water = fresh > 0.4 ? 0x6aa8c0 : fresh > 0.2 ? 0x7a8a6a : 0x6a5a3a;
    const level = 0.6 + Math.min(1, fresh) * 0.4;
    g.fillStyle(water, 0.85).fillEllipse(x, y - 8 * R, 38 * R * level, 5 * R * level);
    g.fillStyle(0xffffff, fresh > 0.4 ? 0.5 : 0.15).fillRect(x - 10 * R, y - 9 * R, 6 * R, R);
  }

  /** The water surface; `pool` limits it to a paludarium's pool (no air gap shading above). */
  private drawSurface(t: TankState, lit: number, pool?: { left: number; right: number; y: number }): void {
    const g = this.surfaceGfx;
    if (!pool) g.clear();
    const y0 = (pool ? pool.y : VIEW.surface) - 3 * RES;
    const x0 = pool ? pool.left : VIEW.left;
    const x1 = pool ? pool.right : VIEW.right;
    const mix = (on: number, off: number) => off + (on - off) * lit;
    // Air gap above the water.
    if (!pool) g.fillStyle(0x0e1420, 0.55).fillRect(VIEW.left, VIEW.frameTop, W, y0 - VIEW.frameTop);
    const step = 4 * RES;
    // Calmer water with reduced motion; choppier with more surface agitation.
    const amp = (this.calm ? 0.3 : 1) * (0.7 + Math.min(0.6, this.world.flow * 0.4));
    const tt = this.time * (this.calm ? 0.5 : 1);
    // Surface film: protein/oil scum builds up with detritus when little stirs the surface.
    const film = surfaceFilm(t.water.detritus, this.world.flow);
    for (let x = x0; x < x1; x += step) {
      const wave = (Math.sin(x * 0.012 + tt * 1.6) * 1.2 * RES + Math.sin(x * 0.005 - tt * 0.9) * RES) * amp;
      const yy = Math.round(y0 + wave);
      g.fillStyle(0xd8f4ff, mix(0.55, 0.2)).fillRect(x, yy, step, RES);
      g.fillStyle(0xffffff, mix(0.18, 0.06)).fillRect(x, yy + RES, step, 2 * RES);
      // Underside reflection band.
      g.fillStyle(0x9fd8ee, mix(0.1, 0.03)).fillRect(x, yy + 3 * RES, step, 5 * RES);
      if ((x / step + Math.floor(tt * 3)) % 9 === 0) g.fillStyle(0xffffff, mix(0.7, 0.2)).fillRect(x + RES, yy, 2 * RES, RES);
      if (film > 0.02) {
        // Patchy, slowly drifting, faintly iridescent.
        const n = Math.sin(x * 0.021 + tt * 0.15) + Math.sin(x * 0.047 - tt * 0.1);
        if (n > 0.4 - film) {
          const hue = [0xc8b8e8, 0xb8e0d0, 0xe8d8a8][Math.floor(x / step) % 3];
          g.fillStyle(hue, film * 0.35 * (0.4 + 0.6 * lit)).fillRect(x, yy + RES, step, RES);
          g.fillStyle(0xd8d0b0, film * 0.18).fillRect(x, yy + 2 * RES, step, RES);
        }
      }
    }
  }

  /**
   * Oxygen pearls: healthy plants under light photosynthesise hard enough to
   * release streams of tiny bubbles from their leaves. Only plants in good
   * health pearl, only while the lights are up, and less when the water has
   * almost no nitrate to feed them.
   */
  private updatePearls(dt: number, t: TankState, lit: number): void {
    const max = this.q.pearls;
    if (max > 0 && lit > 0.8 && this.pearls.length < max) {
      for (const d of this.decorViews) {
        if (!d.plant || this.pearls.length >= max) continue;
        if (d.item.health <= 0.6 || this.encl?.land || getDecor(d.item.defId).land) continue;
        const px = d.x + vr.range(-0.35, 0.35) * d.plant.width;
        const py = d.baseY - d.plant.height * vr.range(0.3, 0.95);
        const light = this.lightMap.at(px, py);
        const rate = pearlRate(d.item.health, t.water.nitrate, light, d.item.size ?? 1, lit);
        if (!vr.chance(rate * dt)) continue;
        const depth = d.layer === 0 ? 3.6 : d.layer === 1 ? 15.5 : 25.5;
        const obj = this.scene.add.image(px, py, 'bubble').setDepth(depth).setScale(vr.range(0.16, 0.28)).setAlpha(d.layer === 0 ? 0.6 : 0.85);
        this.pearls.push({ obj, vy: -vr.range(10, 18) * RES, wob: vr.range(0, 6) });
      }
    }
    for (let i = this.pearls.length - 1; i >= 0; i--) {
      const p = this.pearls[i];
      p.obj.y += p.vy * dt;
      p.obj.x += Math.sin(this.time * 5 + p.wob) * 3 * RES * dt;
      if (p.obj.y < (this.encl?.pool?.y ?? VIEW.surface) + RES || (lit < 0.3 && vr.chance(dt * 2))) {
        p.obj.destroy();
        this.pearls.splice(i, 1);
      }
    }
  }

  /**
   * Fish near the top mirror faintly on the underside of the surface (seen
   * from below, the surface reflects). High quality only; a small pool of
   * sprites follows the fish closest to the surface.
   */
  private updateReflections(lit: number): void {
    const n = this.q.reflections;
    while (this.reflections.length > n) this.reflections.pop()!.destroy();
    if (!n) return;
    const y0 = VIEW.surface - 3 * RES;
    const band = 30 * RES;
    const near = [...this.agents.values()].filter((a) => a.fish.alive && a.y - y0 < band && a.sprite.visible).sort((a, b) => a.y - b.y).slice(0, n);
    for (let i = 0; i < n; i++) {
      const a = near[i];
      let r = this.reflections[i];
      if (!a) {
        r?.setVisible(false);
        continue;
      }
      if (!r) {
        r = this.scene.add.sprite(0, 0, a.sprite.texture.key).setDepth(27.5).setFlipY(true);
        this.reflections[i] = r;
      }
      const d = Math.max(0, a.y - y0);
      if (r.texture.key !== a.sprite.texture.key) r.setTexture(a.sprite.texture.key);
      r.setFrame(a.sprite.frame.name);
      r.setOrigin(a.sprite.originX, a.sprite.originY);
      r.setFlipX(a.sprite.flipX);
      r.setScale(a.sprite.scaleX, a.sprite.scaleY * 0.45);
      r.setRotation(-a.sprite.rotation);
      r.setPosition(a.x, y0 + 2 * RES + d * 0.25);
      r.setTint(0xbfe6f0);
      r.setAlpha((1 - d / band) * 0.4 * (0.3 + 0.7 * lit));
      r.setVisible(true);
    }
  }

  /** Hardscape shade from the light map, plus a film of algae as the tank's algae grows. */
  private tintHardscape(t: TankState, lit: number): void {
    for (const d of this.decorViews) {
      if (!d.image) continue;
      const light = this.lightMap.at(d.x, d.baseY - d.image.displayHeight * 0.5);
      d.image.setTint(hardscapeTint(d.layer, light, t.algae, lit));
    }
  }

  private puff(x: number, y: number): void {
    if (this.puffs.length > 60) return;
    const col = Phaser.Display.Color.HexStringToColor(getSubstrateColour(this.preview.substrateId ?? this.tank.substrateId)).color;
    for (let k = 0; k < 3; k++) {
      const obj = this.scene.add.rectangle(x + vr.range(-3, 3) * RES, y - vr.range(0, 3) * RES, RES * vr.pick([1, 2]), RES, col, 0.9).setDepth(16);
      this.puffs.push({ obj, vx: vr.range(-8, 8) * RES, vy: -vr.range(6, 16) * RES, life: vr.range(0.5, 1.1) });
    }
  }

  private spawnBubble(x: number, y: number): void {
    if (this.bubbles.length > 90) return;
    const obj = this.scene.add.image(x, y, 'bubble').setDepth(26).setScale(vr.range(0.3, 0.6));
    this.bubbles.push({ obj, vy: -vr.range(28, 46) * RES, wob: vr.range(0, 6), grow: vr.range(0.05, 0.25) });
  }

  /**
   * Selects the animal nearest a tap, within `radius` canvas px. Small fish,
   * shrimp and frogs are hard to hit exactly with a finger, so a tap that
   * misses every sprite still picks the closest one in reach.
   */
  selectNearest(x: number, y: number, radius: number): boolean {
    let best: (FishAgent | CritterAgent) | null = null;
    let bd = radius;
    for (const a of this.agents.values()) {
      // Distance to the body centre, less a little of the body size, so long fish are easy to hit too.
      const d = Math.max(0, Math.hypot(a.x - x, a.y - (a instanceof CritterAgent ? a.height / 2 : 0) - y) - Math.min(a.len, 40 * RES) * 0.3);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (!best) return false;
    this.selectedId = best.fish.id;
    this.opts.onSelect?.(best.fish);
    return true;
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
    this.optics.destroy();
    for (const m of this.mist) m.obj.destroy();
    this.mist = [];
    for (const d of this.decorViews) {
      d.coral?.sprite.destroy();
      d.coral?.glow.destroy();
    }
    for (const a of this.agents.values()) a.destroy();
    this.agents.clear();
    this.floating.destroy();
    for (const p of this.puffs) p.obj.destroy();
    this.puffs = [];
    for (const p of this.pearls) p.obj.destroy();
    this.pearls = [];
    for (const r of this.reflections) r.destroy();
    this.reflections = [];
  }
}

/** Share of white light in a reef light (caustics need white light to read). */
function actinicWhite(actinic: number): number {
  return clamp(1 - actinic * 0.6, 0.3, 1);
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
    // An air bubble seen in water: nearly clear centre, a bright refracting rim
    // (brighter below, where it focuses light from above), a window glint.
    const B = 8 * RES * 3;
    const tex = makeTexture(s, 'bubble-hd', B, B, (ctx) => {
      const r = B / 2 - 1;
      const g = ctx.createRadialGradient(B / 2, B / 2, r * 0.2, B / 2, B / 2, r);
      g.addColorStop(0, 'rgba(225,245,255,0.06)');
      g.addColorStop(0.7, 'rgba(225,245,255,0.16)');
      g.addColorStop(0.92, 'rgba(235,250,255,0.85)');
      g.addColorStop(1, 'rgba(200,230,245,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(B / 2, B / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(B / 2, B / 2 + r * 0.55, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(B / 2 - r * 0.35, B / 2 - r * 0.38, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    // Same display size as before: a frame a third of the painted size.
    tex.add('__ds', 0, 0, 0, B, B);
    makeTexture(s, 'bubble', 8 * RES, 8 * RES, (ctx) => {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tex.getSourceImage() as HTMLCanvasElement, 0, 0, B, B, 0, 0, 8 * RES, 8 * RES);
    }).setFilter(Phaser.Textures.FilterMode.LINEAR);
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

function ensureBackground(s: Phaser.Scene, id: string, height = VIEW.subBottom - VIEW.surface + 6 * RES): string {
  const key = `tankbg4:${id}:${height}`;
  if (s.textures.exists(key)) return key;
  const waterH = height;
  const tex = s.textures.createCanvas(key, W, waterH)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, waterH);
  const d = img.data;
  const pal: Record<string, [string, string]> = {
    none: ['#5a8a94', '#1e3a44'],
    cork_wall: ['#5a4636', '#241a12'],
    desert_wall: ['#c8955a', '#5a3a22'],
    jungle_wall: ['#3a5a2a', '#101a0c'],
    black: ['#1a2a32', '#04070a'],
    blue: ['#3f8ccc', '#0f2e5e'],
    rocky: ['#3e5a60', '#141f24'],
  };
  const wall = paintLandWall(id, W, waterH, RES);
  if (wall) {
    ctx.putImageData(new ImageData(wall, W, waterH), 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return key;
  }
  const [top, bot] = pal[id] ?? pal.none;
  const tc = hexRgb(top);
  const bc = hexRgb(bot);
  const n2 = (x: number, y: number, seed: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const f = (a: number, b: number) => {
      let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + seed * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const u = x - xi;
    const v = y - yi;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = f(xi, yi), b = f(xi + 1, yi), c = f(xi, yi + 1), e = f(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + e) * su * sv;
  };
  for (let y = 0; y < waterH; y++) {
    const t = y / waterH;
    for (let x = 0; x < W; x++) {
      // Depth gradient with a soft pool of light under the lamp and darker corners.
      const cx = (x / W - 0.5) * 2;
      const pool = Math.max(0, 1 - Math.hypot(cx * 0.8, t * 1.6)) * 0.22;
      const r = tc[0] + (bc[0] - tc[0]) * t;
      const g = tc[1] + (bc[1] - tc[1]) * t;
      const b = tc[2] + (bc[2] - tc[2]) * t;
      let k = 1 + pool - Math.abs(cx) * 0.08;
      const wall = landWallPixel(id, x, y, t, W, RES);
      if (wall) {
        if ((x + y) % 2 === 0) k += 0.012;
        const i = (y * W + x) * 4;
        d[i] = Math.min(255, wall[0] * k);
        d[i + 1] = Math.min(255, wall[1] * k);
        d[i + 2] = Math.min(255, wall[2] * k);
        d[i + 3] = 255;
        continue;
      }
      if (id === 'rocky') {
        // Out-of-focus rock wall: jittered cells, each a rounded stone lit from above.
        const cw = 70 * RES;
        const ch = 46 * RES;
        const gx = x / cw;
        const gy = (y + n2(x / (50 * RES), 0, 2) * 30 * RES) / ch;
        let d1 = 9;
        let d2 = 9;
        let id1 = 0;
        let dyc = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cx2 = Math.floor(gx) + ox;
          const cy2 = Math.floor(gy) + oy;
          const px2 = cx2 + n2(cx2 * 3.1, cy2 * 1.7, 11);
          const py2 = cy2 + n2(cx2 * 1.3, cy2 * 2.9, 12);
          const dd = Math.hypot((gx - px2) * 1.2, gy - py2);
          if (dd < d1) {
            d2 = d1;
            d1 = dd;
            id1 = cx2 * 17 + cy2 * 31;
            dyc = gy - py2;
          } else if (dd < d2) d2 = dd;
        }
        const wallTop = 0.18 + n2(x / (120 * RES), 7, 13) * 0.25;
        if (t > wallTop) {
          const tone = 0.75 + n2(id1, 1, 14) * 0.3;
          const edge = Math.min(1, (d2 - d1) * 3);
          k *= tone * (0.7 + 0.3 * edge) * (1 - dyc * 0.25) * (1 - (t - wallTop) * 0.3);
        }
      } else if (id === 'none') {
        // The shop wall behind the clear glass: soft panels, out of focus.
        if (Math.floor((x / RES + 20) / 110) % 2 === 0) k *= 0.96;
        if (t < 0.08) k *= 1.08;
      } else if (id === 'blue') {
        k *= 0.94 + n2(x / (40 * RES), y / (40 * RES), 8) * 0.12;
      }
      // A whisper of grain so long gradients never band.
      k += (n2(x * 0.9, y * 0.9, 31) - 0.5) * 0.02;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r * k);
      d[i + 1] = Math.min(255, g * k);
      d[i + 2] = Math.min(255, b * k);
      d[i + 3] = 255;
    }
  }
  // Depth of field: the back wall sits well behind the focal plane, so it is soft.
  if (id === 'rocky' || id === 'none' || id === 'blue') boxBlur(d, W, waterH, id === 'rocky' ? 2 * RES : RES, 2);
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** In-place separable box blur of RGBA data (radius r px, `passes` times). */
function boxBlur(d: Uint8ClampedArray, w: number, h: number, r: number, passes: number): void {
  const tmp = new Float32Array(Math.max(w, h) * 4);
  for (let p = 0; p < passes; p++) {
    for (const horizontal of [true, false]) {
      const lines = horizontal ? h : w;
      const len = horizontal ? w : h;
      for (let l = 0; l < lines; l++) {
        const idx = (k: number) => (horizontal ? l * w + k : k * w + l) * 4;
        for (let k = 0; k < len; k++) {
          let rr = 0;
          let gg = 0;
          let bb = 0;
          let n = 0;
          for (let o = -r; o <= r; o++) {
            const kk = Math.min(len - 1, Math.max(0, k + o));
            const i = idx(kk);
            rr += d[i];
            gg += d[i + 1];
            bb += d[i + 2];
            n++;
          }
          tmp[k * 4] = rr / n;
          tmp[k * 4 + 1] = gg / n;
          tmp[k * 4 + 2] = bb / n;
        }
        for (let k = 0; k < len; k++) {
          const i = idx(k);
          d[i] = tmp[k * 4];
          d[i + 1] = tmp[k * 4 + 1];
          d[i + 2] = tmp[k * 4 + 2];
        }
      }
    }
  }
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
