/**
 * CritterAgent (detailed view only): shrimp, snails and hermit crabs. Like
 * FishAgent it steers the sprite of one persistent FishEntity and never
 * stores gameplay state. Critters live on surfaces: they walk the substrate
 * following its contour, clamber over rock tops, snails glide up the back
 * glass, shrimp pick at biofilm and make short swims, and everyone heads for
 * food that has settled. Movement speed and habits come from the species'
 * behaviour data.
 */
import Phaser from 'phaser';
import { clamp, lerp } from '../core/math';
import { visualRng as rng } from '../core/rng';
import { getSpecies } from '../data/species';
import type { SpeciesDef } from '../data/speciesTypes';
import { getMorph } from '../sim/fish';
import type { FishEntity } from '../sim/types';
import { CRITTER_FRAMES, critterColours, paintCritterSheet, type CritterKind } from './art/critterArt';
import type { Pellet, TankWorld } from './fishBehaviour';
import { useTexture } from './textureCache';

export interface CritterWorld extends TankWorld {
  /** Canvas y of the substrate surface at x. */
  groundAt(x: number): number;
  /** Enclosures: the whole enclosure for land animals (the fish bounds are only the pool). */
  full?: { left: number; right: number; top: number };
  /** Paludarium pool: x range and water surface y. */
  pool?: { left: number; right: number; y: number };
  /** No water at all (vivarium, terrarium). */
  land?: boolean;
}

type CritterMode = 'walk' | 'graze' | 'feed' | 'hide' | 'swim' | 'climb' | 'rest' | 'float' | 'dead';

const LAND_KINDS = new Set<CritterKind>(['frog', 'gecko', 'spider']);

/** Paints (or reuses) a critter sheet texture. */
function critterTexture(scene: Phaser.Scene, f: FishEntity, kind: CritterKind, length: number): { key: string; w: number; h: number } {
  const sp = getSpecies(f.speciesId);
  const L = Math.max(10, Math.round(length / 2) * 2);
  const key = `critter:${sp.id}:${f.morphId}:${L}:${f.alive ? 1 : 0}`;
  if (!scene.textures.exists(key)) {
    const feat = sp.body.features ?? [];
    const sheet = paintCritterSheet(kind, critterColours(getMorph(sp, f.morphId)), L, !f.alive, { crest: feat.includes('crest'), fatTail: feat.includes('fat_tail'), toePads: feat.includes('toe_pads') });
    const tex = scene.textures.createCanvas(key, sheet.width * CRITTER_FRAMES, sheet.height)!;
    const ctx = tex.getContext();
    sheet.frames.forEach((d, i) => ctx.putImageData(new ImageData(d, sheet.width, sheet.height), i * sheet.width, 0));
    tex.refresh();
    for (let i = 0; i < CRITTER_FRAMES; i++) tex.add(String(i), 0, i * sheet.width, 0, sheet.width, sheet.height);
  }
  useTexture(scene, 'critter', key, 60);
  const t = scene.textures.get(key).get('0');
  return { key, w: t.width, h: t.height };
}

export class CritterAgent {
  readonly sp: SpeciesDef;
  readonly kind: CritterKind;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  z: number;
  heading = 1;
  mode: CritterMode = 'walk';
  len = 0;
  height = 0;
  private modeT = 0;
  private tx = 0;
  private ty = 0;
  private onGlass = false;
  private texKey = '';
  private frameT = rng.range(0, 4);
  private texT = 0;
  /** Swim hop: vertical offset above the surface it left. */
  private lift = 0;
  private liftV = 0;
  /** Frogs: a leap in progress (from, to, progress 0..1) and the pause before the next. */
  private leap: { x0: number; y0: number; x1: number; y1: number; p: number; dur: number } | null = null;
  private crouch = 0;
  /** A live feeder being stalked (its position is followed). */
  private prey: Pellet | null = null;

  constructor(private scene: Phaser.Scene, public fish: FishEntity, world: CritterWorld) {
    this.sp = getSpecies(fish.speciesId);
    this.kind = this.sp.body.shape as CritterKind;
    this.z = rng.range(0.25, 1);
    const b = this.bounds(world);
    this.x = rng.range(b.left + 40 * world.scale, b.right - 40 * world.scale);
    this.y = world.groundAt(this.x);
    this.sprite = scene.add.sprite(this.x, this.y, '__DEFAULT').setOrigin(0.5, 1);
    this.sprite.setInteractive({ useHandCursor: true });
    this.refreshTexture(world);
    this.heading = rng.chance(0.5) ? 1 : -1;
    this.pick(world);
  }

  private get land(): boolean {
    return LAND_KINDS.has(this.kind);
  }

  /** Where this critter can go: land animals use the whole enclosure, water critters the water. */
  private bounds(world: CritterWorld): { left: number; right: number; top: number } {
    if (this.land && world.full) return world.full;
    return { left: world.left, right: world.right, top: world.surface };
  }

  private refreshTexture(world: CritterWorld): void {
    // Drawn a little larger than true scale (like fish) so they read on screen.
    const k = { snail: 1.15, crab: 1.45, shrimp: 1.35, frog: 1.15, gecko: 0.85, spider: 1.0 }[this.kind];
    const tex = critterTexture(this.scene, this.fish, this.kind, this.fish.sizeCm * world.pxPerCm * k);
    if (tex.key !== this.texKey) {
      this.texKey = tex.key;
      this.sprite.setTexture(tex.key, '0');
      this.len = tex.w;
      this.height = tex.h;
    }
  }

  /** Somewhere to stand: the substrate, a rock top, or (snails) the back glass. */
  private surfacePoint(world: CritterWorld): { x: number; y: number; glass: boolean } {
    const S = world.scale;
    const b = this.sp.behaviour;
    const bd = this.bounds(world);
    if (this.kind === 'snail' && b.grazer && rng.chance(0.45)) {
      return { x: rng.range(world.left + 20 * S, world.right - 20 * S), y: rng.range(world.surface + 30 * S, world.floor - 30 * S), glass: true };
    }
    // Climbing frogs and geckos sit high on the glass and branches.
    if (this.land && this.sp.terra?.climber && rng.chance(0.5)) {
      return { x: rng.range(bd.left + 30 * S, bd.right - 30 * S), y: rng.range(bd.top + 30 * S, world.floor - 60 * S), glass: true };
    }
    if (this.land) {
      const x = clamp(this.x + rng.range(-120, 120) * S, bd.left + 20 * S, (world.pool && this.sp.lives !== 'amphibious' ? world.pool.left : bd.right) - 20 * S);
      return { x, y: world.groundAt(x), glass: false };
    }
    if (world.hides.length && rng.chance(this.kind === 'shrimp' ? 0.4 : 0.25)) {
      const h = rng.pick(world.hides);
      const x = clamp(h.x + rng.range(-0.6, 0.6) * h.r, world.left + 10 * S, world.right - 10 * S);
      return { x, y: Math.min(world.groundAt(x), h.y - h.r * 0.55), glass: false };
    }
    const x = clamp(this.x + rng.range(-90, 90) * S, world.left + 16 * S, world.right - 16 * S);
    return { x, y: world.groundAt(x), glass: false };
  }

  private pick(world: CritterWorld): void {
    const f = this.fish;
    const b = this.sp.behaviour;
    if (!f.alive) {
      this.mode = 'dead';
      return;
    }
    // Land animals hunt live feeders; water critters pick at sunken food.
    const settled = world.pellets.filter((p) => (this.land ? !!p.bug : !p.bug && (p.settled || p.y > world.floor - 60 * world.scale)));
    if (f.hunger > 10 && settled.length) {
      const p = settled.reduce((a, c) => (Math.abs(c.x - this.x) < Math.abs(a.x - this.x) ? c : a));
      this.mode = 'feed';
      this.onGlass = false;
      this.tx = p.x;
      this.ty = world.groundAt(p.x);
      this.prey = p.bug ? p : null;
      this.modeT = 8;
      return;
    }
    const night = !world.lightsOn;
    if ((night && !b.nocturnal && rng.chance(0.35)) || (f.stress > 55 && world.hides.length)) {
      const h = world.hides.length ? rng.pick(world.hides) : null;
      this.mode = h ? 'hide' : 'rest';
      this.onGlass = false;
      this.tx = h ? h.x + rng.range(-0.4, 0.4) * h.r : this.x;
      this.ty = world.groundAt(this.tx);
      this.modeT = rng.range(6, 14);
      return;
    }
    // Amphibians in a paludarium spend a lot of time sitting in the pool.
    if (this.land && this.sp.lives === 'amphibious' && world.pool && rng.chance(0.4)) {
      this.mode = 'float';
      this.onGlass = false;
      this.tx = rng.range(world.pool.left + 20 * world.scale, world.pool.right - 20 * world.scale);
      this.ty = world.pool.y + this.height * 0.45;
      this.modeT = rng.range(8, 20);
      return;
    }
    if (this.land && rng.chance(this.kind === 'spider' ? 0.6 : 0.3)) {
      this.mode = 'rest';
      this.modeT = rng.range(3, this.kind === 'spider' ? 18 : 8);
      return;
    }
    if (this.kind === 'shrimp' && !world.land && rng.chance(0.12)) {
      this.mode = 'swim';
      this.liftV = -rng.range(30, 60) * world.scale;
      this.modeT = rng.range(1.2, 2.4);
      this.tx = clamp(this.x + this.heading * rng.range(30, 80) * world.scale, world.left + 16 * world.scale, world.right - 16 * world.scale);
      return;
    }
    if (rng.chance(0.4)) {
      this.mode = 'graze';
      this.modeT = rng.range(2, 6);
      return;
    }
    const pt = this.surfacePoint(world);
    this.mode = pt.glass ? 'climb' : 'walk';
    this.onGlass = pt.glass;
    this.tx = pt.x;
    this.ty = pt.y;
    this.modeT = rng.range(6, 16) / (0.4 + b.restlessness);
  }

  update(dt: number, world: CritterWorld, _time: number): void {
    const f = this.fish;
    const S = world.scale;
    this.texT -= dt;
    if (this.texT <= 0) {
      this.texT = rng.range(2, 4);
      this.refreshTexture(world);
    }
    if (!f.alive && this.mode !== 'dead') this.mode = 'dead';
    this.modeT -= dt;
    if (this.mode !== 'dead' && (this.modeT <= 0 || (this.mode !== 'feed' && f.hunger > 25 && world.pellets.some((p) => (this.land ? !!p.bug : p.settled && !p.bug)) && rng.chance(dt * 0.6)))) this.pick(world);

    if (this.mode === 'dead') {
      this.onGlass = false;
      this.y = lerp(this.y, world.groundAt(this.x), Math.min(1, dt * 2));
      this.sprite.setFrame('0').setTint(0x9a9a92).setRotation(0).setFlipY(this.kind === 'shrimp' || this.kind === 'frog' || this.kind === 'spider');
      this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
      this.sprite.setDepth(19);
      return;
    }

    // Stalking: follow a live feeder until it is caught or gone.
    if (this.mode === 'feed' && this.prey) {
      if (!world.pellets.includes(this.prey)) {
        this.prey = null;
        this.modeT = Math.min(this.modeT, 0.3);
      } else {
        this.tx = this.prey.x;
        this.ty = world.groundAt(this.prey.x);
      }
    }
    // Walking speed from species behaviour (body lengths per second).
    const speed = this.sp.behaviour.speed * Math.max(14 * S, this.len * 0.55) * (world.lightsOn || this.sp.behaviour.nocturnal ? 1 : 0.5);
    let moving = false;
    let frameOverride: number | null = null;
    if (this.kind === 'frog' && (this.mode === 'walk' || this.mode === 'feed' || this.mode === 'hide' || this.mode === 'float' || (this.mode === 'climb' && !this.onGlass))) {
      // Frogs travel in leaps: crouch, spring in an arc, land, pause.
      if (this.leap) {
        const lp = this.leap;
        lp.p = Math.min(1, lp.p + dt / lp.dur);
        this.x = lerp(lp.x0, lp.x1, lp.p);
        this.y = lerp(lp.y0, lp.y1, lp.p) - Math.sin(lp.p * Math.PI) * Math.min(40 * S, Math.abs(lp.x1 - lp.x0) * 0.6 + 8 * S);
        frameOverride = 3;
        if (lp.p >= 1) {
          this.leap = null;
          this.crouch = rng.range(0.4, 1.4);
        }
      } else {
        const d = Math.hypot(this.tx - this.x, this.ty - this.y);
        if (d > 4 * S && this.crouch <= 0) {
          const step = Math.min(d, rng.range(30, 70) * S);
          const x1 = this.x + ((this.tx - this.x) / d) * step;
          const y1 = this.mode === 'float' && world.pool && x1 > world.pool.left ? world.pool.y + this.height * 0.45 : world.groundAt(x1);
          this.heading = this.tx > this.x ? 1 : -1;
          this.leap = { x0: this.x, y0: this.y, x1, y1, p: 0, dur: 0.45 };
        } else if (d <= 4 * S && this.mode === 'feed') {
          const p = world.pellets.find((q) => Math.abs(q.x - this.x) < 14 * S && Math.abs(q.y - this.y) < 20 * S);
          if (p) world.onEat(this, p);
          else this.modeT = Math.min(this.modeT, 0.3);
        }
        this.crouch -= dt;
        frameOverride = this.crouch > 0 && this.crouch < 0.25 && d > 4 * S ? 2 : null;
      }
      moving = false;
    } else if (this.mode === 'float' && world.pool) {
      // Wading or swimming at the pool surface.
      const dx = this.tx - this.x;
      this.x += clamp(dx, -1, 1) * 18 * S * dt;
      this.y = world.pool.y + this.height * 0.45 + Math.sin(_time * 1.5 + this.z * 9) * S;
      moving = Math.abs(dx) > 2 * S;
    } else if (this.mode === 'walk' || this.mode === 'feed' || this.mode === 'hide' || this.mode === 'climb') {
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 2 * S) {
        const step = Math.min(d, speed * dt);
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        moving = true;
        if (Math.abs(dx) > 1) this.heading = dx > 0 ? 1 : -1;
      } else if (this.mode === 'feed') {
        const p = world.pellets.find((q) => Math.abs(q.x - this.x) < 10 * S && Math.abs(q.y - this.y) < 16 * S);
        if (p) world.onEat(this, p);
        else this.modeT = Math.min(this.modeT, 0.3);
      } else this.modeT = Math.min(this.modeT, this.mode === 'climb' ? rng.range(2, 5) : 1.5);
      // On the ground, keep feet on the substrate unless climbing over rock.
      if (!this.onGlass && this.mode !== 'climb') {
        const g = world.groundAt(this.x);
        if (this.y > g) this.y = g;
      }
    } else if (this.mode === 'swim') {
      this.liftV += 60 * S * dt;
      this.lift = Math.min(0, this.lift + this.liftV * dt);
      const dx = this.tx - this.x;
      this.x += clamp(dx, -1, 1) * 40 * S * dt;
      if (this.lift >= 0 && this.liftV > 0) {
        this.lift = 0;
        this.modeT = 0;
      }
      moving = true;
    }

    // Walk cycle (faster when moving; slow picking while grazing). Resting frogs breathe (frames 0-1).
    this.frameT += dt * (moving ? 6 : this.mode === 'graze' ? 3 : 0.6);
    const frame = frameOverride ?? (this.kind === 'frog' ? Math.floor(this.frameT * 1.5) % 2 : Math.floor(this.frameT) % CRITTER_FRAMES);
    this.sprite.setFrame(String(frame));

    const glass = this.onGlass && this.mode === 'climb';
    const zT = glass ? 0 : this.z;
    const depthScale = 0.8 + 0.2 * zT;
    this.sprite.scaleX = this.heading * depthScale;
    this.sprite.scaleY = depthScale;
    // Snails on the glass turn to face the way they glide (up or down).
    const climbing = glass && Math.abs(this.ty - this.y) > 4 * S;
    const rot = climbing ? (this.ty < this.y ? -Math.PI / 2 : Math.PI / 2) * this.heading * 0.9 : 0;
    this.sprite.rotation = lerp(this.sprite.rotation, rot, Math.min(1, dt * 3));
    const light = world.lightAt(this.x, this.y - this.height * 0.5);
    const k = clamp(0.5 + 0.5 * light - 0.14 * (1 - zT) - (world.lightsOn ? 0 : 0.2), 0.25, 1.05);
    const c = Math.round(255 * k);
    this.sprite.setTint((c << 16) | (c << 8) | Math.round(255 * clamp(k + 0.06 * (1 - zT), 0, 1)));
    this.sprite.setFlipY(false);
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y + this.lift));
    // Glass climbers are behind everything (climbing land animals sit on the back wall in
    // front of the background); ground critters among the decor layers.
    this.sprite.setDepth(glass ? (this.land ? 6 : 4.8) : this.mode === 'float' ? 20 : 10 + this.z * 9);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
