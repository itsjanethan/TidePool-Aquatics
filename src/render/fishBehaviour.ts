/**
 * FishBehaviourSystem (detailed view only). Steers the sprite of one
 * persistent FishEntity. Never stores gameplay state: it reads the entity and
 * reports eating back through the renderer.
 */
import Phaser from 'phaser';
import { clamp, lerp } from '../core/math';
import { visualRng as rng } from '../core/rng';
import { getSpecies } from '../data/species';
import type { SpeciesDef } from '../data/speciesTypes';
import { isMature } from '../sim/fish';
import type { FishEntity } from '../sim/types';
import { ensureFishTexture, FISH_FRAMES, quantiseLength } from './art/fishArt';

export type FishMode = 'cruise' | 'feed' | 'hide' | 'rest' | 'gulp' | 'chase' | 'flee' | 'court' | 'graze' | 'sift' | 'pause' | 'investigate' | 'dead';

export interface Pellet {
  x: number;
  y: number;
  vy: number;
  floatT: number;
  units: number;
  settled: boolean;
  obj: Phaser.GameObjects.Rectangle;
}

export interface HideSpot {
  x: number;
  y: number;
  r: number;
  cave: boolean;
}

export interface TankWorld {
  left: number;
  right: number;
  surface: number;
  floor: number;
  pxPerCm: number;
  lightsOn: boolean;
  pellets: Pellet[];
  hides: HideSpot[];
  agents: FishAgent[];
  flow: number;
  /** Pixels per logical game pixel (the tank view renders at 2x). */
  scale: number;
  onEat(agent: FishAgent, pellet: Pellet): void;
}

export class FishAgent {
  readonly sp: SpeciesDef;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  z: number;
  heading = 1;
  mode: FishMode = 'cruise';
  modeT = 0;
  tx = 0;
  ty = 0;
  len = 0;
  height = 0;
  wagT = rng.range(0, 10);
  phase = rng.range(0, 10);
  partner: FishAgent | null = null;
  gulpStage = 0;
  private turnHold = 0;
  /** Depth target: 0 back glass .. 1 front glass. */
  private zTarget = 0.5;
  /** Visual turn progress -1..1 (left..right), eased separately from heading. */
  private turn = 1;
  private texKey = '';

  constructor(private scene: Phaser.Scene, public fish: FishEntity, world: TankWorld) {
    this.sp = getSpecies(fish.speciesId);
    this.z = rng.next();
    this.zTarget = this.z;
    this.x = rng.range(world.left + 30 * world.scale, world.right - 30 * world.scale);
    const [d0, d1] = this.sp.behaviour.depth;
    this.y = lerp(world.surface, world.floor, rng.range(d0, d1));
    this.sprite = scene.add.sprite(this.x, this.y, '__DEFAULT');
    this.sprite.setInteractive({ useHandCursor: true });
    this.refreshTexture(world);
    this.heading = rng.chance(0.5) ? 1 : -1;
    this.turn = this.heading;
    this.pickTarget(world);
  }

  refreshTexture(world: TankWorld): void {
    // Fish are drawn a little larger than true scale so they read well on screen.
    const L = quantiseLength(this.fish.sizeCm * world.pxPerCm * 1.7);
    const info = ensureFishTexture(this.scene, this.fish.speciesId, this.fish.morphId, this.fish.sex, L);
    if (info.key !== this.texKey) {
      this.texKey = info.key;
      this.sprite.setTexture(info.key, '0');
      this.len = info.width;
      this.height = info.height;
    }
  }

  get bottomDweller(): boolean {
    return this.sp.swimLevel === 'bottom';
  }

  private depthY(world: TankWorld, t: number): number {
    return lerp(world.surface + this.height * 0.5 + 2, world.floor - this.height * 0.4, t);
  }

  private pickTarget(world: TankWorld): void {
    const b = this.sp.behaviour;
    const [d0, d1] = b.depth;
    this.tx = rng.range(world.left + this.len, world.right - this.len);
    this.ty = this.depthY(world, rng.range(d0, d1));
  }

  private nearestHide(world: TankWorld): HideSpot | null {
    let best: HideSpot | null = null;
    let bd = Infinity;
    for (const h of world.hides) {
      const d = Math.abs(h.x - this.x) + (h.cave && this.bottomDweller ? -60 : 0);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  private chooseMode(world: TankWorld): void {
    const f = this.fish;
    const b = this.sp.behaviour;
    this.partner = null;
    if (!f.alive) {
      this.mode = 'dead';
      return;
    }
    const night = !world.lightsOn;
    const restChance = night ? (b.nocturnal ? 0.05 : 0.65) : b.nocturnal ? 0.55 : 0.04;
    const hungry = f.hunger > 12;
    if (hungry && world.pellets.length) {
      this.mode = 'feed';
      this.modeT = 4;
      return;
    }
    this.modeT = rng.range(2.5, 7) / (0.5 + b.restlessness);
    // Drift to a new depth layer now and then (fish move behind and in front of decor).
    if (rng.chance(0.35)) this.zTarget = clamp(this.zTarget + rng.range(-0.45, 0.45), 0, 1);
    const r = rng.next();
    const fry = f.sizeCm / f.adultSizeCm < 0.32;
    if (f.stress > 60 || (r < b.shyness * 0.35 && world.hides.length) || (fry && world.hides.length && rng.chance(0.55))) {
      this.mode = world.hides.length ? 'hide' : 'rest';
      const hs = this.nearestHide(world);
      if (hs) {
        this.tx = hs.x + rng.range(-hs.r, hs.r) * 0.6;
        this.ty = clamp(hs.y + rng.range(-hs.r, hs.r) * 0.4, world.surface + 10 * world.scale, world.floor - this.height * 0.4);
      }
      return;
    }
    if (rng.chance(restChance)) {
      this.mode = 'rest';
      const hs = this.nearestHide(world);
      this.tx = hs && rng.chance(0.6) ? hs.x : this.x + rng.range(-30, 30) * world.scale;
      this.ty = this.bottomDweller ? world.floor - this.height * 0.4 : this.depthY(world, Math.min(1, b.depth[1] + 0.15));
      return;
    }
    if (b.airGulper && rng.chance(0.08)) {
      this.mode = 'gulp';
      this.gulpStage = 0;
      this.tx = this.x + rng.range(-20, 20) * world.scale;
      this.ty = world.surface + 3;
      this.modeT = 6;
      return;
    }
    if (b.chaseTendency > 0 && rng.chance(b.chaseTendency * 0.6)) {
      const others = world.agents.filter((a) => a !== this && a.fish.alive && Math.abs(a.x - this.x) < 120 * world.scale);
      if (others.length) {
        this.partner = rng.pick(others);
        this.mode = 'chase';
        this.modeT = rng.range(1, 2.2);
        this.partner.flee(this, world);
        return;
      }
    }
    if (this.sp.tags.includes('livebearer') && f.sex === 'male' && isMature(f) && rng.chance(0.3)) {
      const females = world.agents.filter((a) => a.fish.speciesId === f.speciesId && a.fish.sex === 'female' && a.fish.alive);
      if (females.length) {
        this.partner = rng.pick(females);
        this.mode = 'court';
        this.modeT = rng.range(2, 4);
        return;
      }
    }
    if (b.grazer && rng.chance(0.55)) {
      this.mode = 'graze';
      const hs = world.hides.length && rng.chance(0.6) ? rng.pick(world.hides) : null;
      this.tx = hs ? hs.x + rng.range(-hs.r, hs.r) * 0.5 : rng.range(world.left + 20 * world.scale, world.right - 20 * world.scale);
      this.ty = hs ? hs.y : this.depthY(world, rng.range(0.55, 1));
      this.modeT *= 1.6;
      return;
    }
    if (b.sifter && rng.chance(0.65)) {
      this.mode = 'sift';
      this.tx = clamp(this.x + rng.range(-70, 70) * world.scale, world.left + 20 * world.scale, world.right - 20 * world.scale);
      this.ty = world.floor - this.height * 0.35;
      return;
    }
    // Idle behaviours: hang in the water for a moment, or nose around decor.
    if (rng.chance(0.14 + (1 - b.restlessness) * 0.12)) {
      this.mode = 'pause';
      this.tx = this.x;
      this.ty = this.y;
      this.modeT = rng.range(1.2, 3.5);
      return;
    }
    if (world.hides.length && rng.chance(0.14)) {
      const hs = rng.pick(world.hides);
      this.mode = 'investigate';
      this.tx = hs.x + rng.range(-1, 1) * hs.r;
      this.ty = clamp(hs.y + rng.range(-0.6, 0.3) * hs.r, world.surface + 12 * world.scale, world.floor - this.height * 0.5);
      this.modeT = rng.range(3, 6);
      return;
    }
    this.mode = 'cruise';
    this.pickTarget(world);
  }

  flee(from: FishAgent, world: TankWorld): void {
    if (!this.fish.alive) return;
    this.mode = 'flee';
    this.modeT = 1.2;
    this.tx = clamp(this.x + Math.sign(this.x - from.x || 1) * 90 * world.scale, world.left + 10, world.right - 10);
    this.ty = clamp(this.y + rng.range(-30, 30) * world.scale, world.surface + 8 * world.scale, world.floor - 8 * world.scale);
  }

  update(dt: number, world: TankWorld, time: number): void {
    const f = this.fish;
    const b = this.sp.behaviour;
    this.modeT -= dt;
    if (!f.alive && this.mode !== 'dead') this.mode = 'dead';
    if (this.mode !== 'dead' && (this.modeT <= 0 || (this.mode !== 'feed' && f.hunger > 12 && world.pellets.length && rng.chance(dt * 2)))) {
      this.chooseMode(world);
    }

    const hf = clamp(f.health / 100, 0.3, 1);
    const night = !world.lightsOn;
    const activity = night ? (b.nocturnal ? 1.1 : 0.45) : b.nocturnal ? 0.55 : 1;
    // Burst-and-coast swimming: short thrust pulses followed by gliding.
    const pulse = Math.pow(Math.max(0, Math.sin(time * (0.7 + b.restlessness) + this.phase)), 3);
    const burst = 0.62 + 0.6 * pulse;
    let maxSpeed = b.speed * this.len * hf * activity * burst;
    // Fish slow down while turning around.
    if (Math.abs(this.turn) < 0.85) maxSpeed *= 0.6;
    let arrive = 24 * world.scale;

    switch (this.mode) {
      case 'dead': {
        this.vx = lerp(this.vx, Math.sin(time * 0.3 + this.phase) * 3 * world.scale, dt);
        this.vy = lerp(this.vy, this.y > world.surface + 6 * world.scale ? -6 * world.scale : 0, dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.sprite.setFlipY(true);
        this.sprite.setTint(0x9a9a92);
        this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
        this.sprite.setDepth(19);
        return;
      }
      case 'feed': {
        let best: Pellet | null = null;
        let bd = Infinity;
        for (const p of world.pellets) {
          // Bottom feeders mostly wait for sinking food; top feeders prefer floating food.
          const depthT = (p.y - world.surface) / (world.floor - world.surface);
          const pref = this.bottomDweller ? (depthT > 0.6 ? 0 : 400) : b.depth[0] < 0.2 ? depthT * 80 : 0;
          const d = Math.hypot(p.x - this.x, p.y - this.y) + pref;
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        if (!best || f.hunger <= 4) {
          this.modeT = 0;
          break;
        }
        this.tx = best.x;
        this.ty = best.y;
        maxSpeed *= 1.6;
        arrive = 4 * world.scale;
        if (Math.hypot(best.x - this.x - this.heading * this.len * 0.35, best.y - this.y) < Math.max(6 * world.scale, this.len * 0.4)) world.onEat(this, best);
        break;
      }
      case 'hide':
      case 'rest':
        maxSpeed *= this.mode === 'rest' ? 0.3 : 0.5;
        arrive = 30 * world.scale;
        break;
      case 'gulp':
        maxSpeed *= 2;
        arrive = 6 * world.scale;
        if (this.gulpStage === 0 && this.y < world.surface + 8 * world.scale) {
          this.gulpStage = 1;
          this.ty = world.floor - this.height * 0.4;
        }
        break;
      case 'chase':
        if (this.partner) {
          this.tx = this.partner.x;
          this.ty = this.partner.y;
        }
        maxSpeed *= 2;
        arrive = 2 * world.scale;
        break;
      case 'flee':
        maxSpeed *= 2.2;
        break;
      case 'court':
        if (this.partner?.fish.alive) {
          this.tx = this.partner.x - this.partner.heading * this.partner.len * 0.6;
          this.ty = this.partner.y + Math.sin(time * 6 + this.phase) * 3 * world.scale;
          maxSpeed *= 1.3;
          arrive = 10 * world.scale;
        }
        break;
      case 'graze':
        maxSpeed *= 0.35;
        arrive = 12 * world.scale;
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 8 * world.scale) {
          this.tx += Math.sin(time + this.phase) * 4 * world.scale * dt;
        }
        break;
      case 'pause':
        maxSpeed *= 0.12;
        arrive = 20 * world.scale;
        this.ty += Math.sin(time * 1.3 + this.phase) * 1.5 * world.scale * dt;
        break;
      case 'investigate':
        maxSpeed *= 0.45;
        arrive = 18 * world.scale;
        break;
      case 'sift':
        maxSpeed *= 0.7;
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 8 * world.scale) {
          this.tx = clamp(this.x + rng.range(-35, 35) * world.scale, world.left + 15, world.right - 15);
          if (rng.chance(0.3)) this.modeT = Math.min(this.modeT, 0.8);
        }
        break;
      default:
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 14 * world.scale) this.pickTarget(world);
    }

    // Steering toward target with arrival.
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = maxSpeed * Math.min(1, dist / arrive);
    let dvx = (dx / dist) * sp;
    let dvy = (dy / dist) * sp * 0.7;

    // Schooling and separation.
    let cx = 0, cy = 0, ax = 0, ay = 0, n = 0, sx = 0, sy = 0;
    for (const o of world.agents) {
      if (o === this || !o.fish.alive) continue;
      const ox = o.x - this.x;
      const oy = o.y - this.y;
      const d = Math.abs(ox) + Math.abs(oy);
      const sepR = (this.len + o.len) * 0.45;
      if (d < sepR && d > 0.01) {
        sx -= ox / d;
        sy -= oy / d;
      }
      if (b.schooling > 0 && o.fish.speciesId === f.speciesId && d < 90 * world.scale && this.mode === 'cruise') {
        cx += o.x;
        cy += o.y;
        ax += o.vx;
        ay += o.vy;
        n++;
      }
    }
    if (n > 0) {
      const w = b.schooling;
      dvx += ((cx / n - this.x) * 0.6 + (ax / n - this.vx) * 0.8) * w;
      dvy += ((cy / n - this.y) * 0.6 + (ay / n - this.vy) * 0.6) * w;
    }
    dvx += sx * this.len * 1.5;
    dvy += sy * this.len * 1.0;

    const steer = this.mode === 'chase' || this.mode === 'flee' ? 6 : 2.4;
    this.vx = lerp(this.vx, dvx, Math.min(1, dt * steer));
    this.vy = lerp(this.vy, dvy, Math.min(1, dt * steer));
    const spd = Math.hypot(this.vx, this.vy);
    const cap = maxSpeed * 1.4 + 1;
    if (spd > cap) {
      this.vx = (this.vx / spd) * cap;
      this.vy = (this.vy / spd) * cap;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bounds.
    const halfL = this.len / 2;
    const top = world.surface + this.height * 0.35;
    const bottom = world.floor - this.height * (this.bottomDweller || this.mode === 'feed' ? 0.3 : 0.45);
    if (this.x < world.left + halfL) { this.x = world.left + halfL; this.vx = Math.abs(this.vx) * 0.5; }
    if (this.x > world.right - halfL) { this.x = world.right - halfL; this.vx = -Math.abs(this.vx) * 0.5; }
    if (this.y < top) { this.y = top; this.vy = Math.abs(this.vy) * 0.3; }
    if (this.y > bottom) { this.y = bottom; this.vy = -Math.abs(this.vy) * 0.3; }

    // Heading and smooth turn (squash through scaleX).
    // Hysteresis so fish do not flicker between headings.
    const want = this.vx > 4 * world.scale ? 1 : this.vx < -4 * world.scale ? -1 : this.heading;
    if (want !== this.heading) {
      this.turnHold += dt;
      if (this.turnHold > 0.18 || Math.abs(this.vx) > this.len * 1.5) {
        this.heading = want;
        this.turnHold = 0;
      }
    } else this.turnHold = 0;
    if (this.mode === 'court' && this.partner) this.heading = this.partner.heading;
    // Eased turn: the body narrows through the turn (seen end-on) then widens.
    this.turn += Math.sign(this.heading - this.turn) * Math.min(Math.abs(this.heading - this.turn), dt * 5.5);
    const turnShape = Math.sign(this.turn || this.heading) * Math.max(0.18, Math.sin((Math.abs(this.turn) * Math.PI) / 2));

    // Depth: drift toward the target layer; nearer fish are slightly larger and clearer.
    this.z = lerp(this.z, this.zTarget, Math.min(1, dt * 0.25));
    const depthScale = 0.84 + 0.16 * this.z;
    this.sprite.scaleX = turnShape * depthScale;
    this.sprite.scaleY = depthScale;

    // Tail beat follows thrust: fast during bursts, slow while coasting.
    const beatHz = 0.8 + pulse * 2.4 + (spd / Math.max(1, this.len)) * 1.6 + (this.mode === 'feed' || this.mode === 'chase' || this.mode === 'flee' ? 1.5 : 0);
    this.wagT += dt * beatHz * FISH_FRAMES;
    this.sprite.setFrame(String(Math.floor(this.wagT) % FISH_FRAMES));

    // Pitch.
    const flat = this.bottomDweller && (this.y > bottom - 2 || this.mode === 'graze');
    const pitch = flat ? 0 : clamp(this.vy / (spd + 4), -0.5, 0.5) * 0.45;
    const sickTilt = f.health < 35 ? Math.sin(time * 1.5 + this.phase) * 0.25 : 0;
    this.sprite.rotation = lerp(this.sprite.rotation, pitch * this.heading + sickTilt, Math.min(1, dt * 5));

    // Stress / illness tint and night dimming.
    const pale = clamp(f.stress / 160 + (100 - f.health) / 220, 0, 0.6);
    const depthDim = 0.12 * (1 - this.z);
    const nightDim = night ? 0.25 : 0;
    const k = 1 - Math.max(pale * 0.4, 0) - depthDim - nightDim;
    const r = Math.round(255 * clamp(k + pale * 0.3, 0, 1));
    const g = Math.round(255 * clamp(k + pale * 0.32, 0, 1));
    const bl = Math.round(255 * clamp(k + pale * 0.4 + depthDim * 0.6, 0, 1));
    this.sprite.setTint((r << 16) | (g << 8) | bl);
    this.sprite.setFlipY(false);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(10 + this.z * 9);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
