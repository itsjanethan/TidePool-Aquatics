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
import type { TankWorld } from './fishBehaviour';
import { useTexture } from './textureCache';

export interface CritterWorld extends TankWorld {
  /** Canvas y of the substrate surface at x. */
  groundAt(x: number): number;
}

type CritterMode = 'walk' | 'graze' | 'feed' | 'hide' | 'swim' | 'climb' | 'rest' | 'dead';

/** Paints (or reuses) a critter sheet texture. */
function critterTexture(scene: Phaser.Scene, f: FishEntity, kind: CritterKind, length: number): { key: string; w: number; h: number } {
  const sp = getSpecies(f.speciesId);
  const L = Math.max(10, Math.round(length / 2) * 2);
  const key = `critter:${sp.id}:${f.morphId}:${L}:${f.alive ? 1 : 0}`;
  if (!scene.textures.exists(key)) {
    const sheet = paintCritterSheet(kind, critterColours(getMorph(sp, f.morphId)), L, !f.alive);
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

  constructor(private scene: Phaser.Scene, public fish: FishEntity, world: CritterWorld) {
    this.sp = getSpecies(fish.speciesId);
    this.kind = this.sp.body.shape as CritterKind;
    this.z = rng.range(0.25, 1);
    this.x = rng.range(world.left + 40 * world.scale, world.right - 40 * world.scale);
    this.y = world.groundAt(this.x);
    this.sprite = scene.add.sprite(this.x, this.y, '__DEFAULT').setOrigin(0.5, 1);
    this.sprite.setInteractive({ useHandCursor: true });
    this.refreshTexture(world);
    this.heading = rng.chance(0.5) ? 1 : -1;
    this.pick(world);
  }

  private refreshTexture(world: CritterWorld): void {
    // Drawn a little larger than true scale (like fish) so they read on screen.
    const tex = critterTexture(this.scene, this.fish, this.kind, this.fish.sizeCm * world.pxPerCm * (this.kind === 'snail' ? 1.15 : this.kind === 'crab' ? 1.45 : 1.35));
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
    if (this.kind === 'snail' && b.grazer && rng.chance(0.45)) {
      return { x: rng.range(world.left + 20 * S, world.right - 20 * S), y: rng.range(world.surface + 30 * S, world.floor - 30 * S), glass: true };
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
    const settled = world.pellets.filter((p) => p.settled || p.y > world.floor - 60 * world.scale);
    if (f.hunger > 10 && settled.length) {
      const p = settled.reduce((a, c) => (Math.abs(c.x - this.x) < Math.abs(a.x - this.x) ? c : a));
      this.mode = 'feed';
      this.onGlass = false;
      this.tx = p.x;
      this.ty = world.groundAt(p.x);
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
    if (this.kind === 'shrimp' && rng.chance(0.12)) {
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
    if (this.mode !== 'dead' && (this.modeT <= 0 || (this.mode !== 'feed' && f.hunger > 25 && world.pellets.some((p) => p.settled) && rng.chance(dt * 0.6)))) this.pick(world);

    if (this.mode === 'dead') {
      this.onGlass = false;
      this.y = lerp(this.y, world.groundAt(this.x), Math.min(1, dt * 2));
      this.sprite.setFrame('0').setTint(0x9a9a92).setRotation(0).setFlipY(this.kind === 'shrimp');
      this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
      this.sprite.setDepth(19);
      return;
    }

    // Walking speed from species behaviour (body lengths per second).
    const speed = this.sp.behaviour.speed * Math.max(14 * S, this.len * 0.55) * (world.lightsOn || this.sp.behaviour.nocturnal ? 1 : 0.5);
    let moving = false;
    if (this.mode === 'walk' || this.mode === 'feed' || this.mode === 'hide' || this.mode === 'climb') {
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

    // Walk cycle (faster when moving; slow picking while grazing).
    this.frameT += dt * (moving ? 6 : this.mode === 'graze' ? 3 : 0.6);
    this.sprite.setFrame(String(Math.floor(this.frameT) % CRITTER_FRAMES));

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
    // Glass climbers are behind everything; ground critters among the decor layers.
    this.sprite.setDepth(glass ? 4.8 : 10 + this.z * 9);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
