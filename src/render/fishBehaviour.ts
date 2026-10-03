/**
 * FishBehaviourSystem (detailed view only). Steers the sprite of one
 * persistent FishEntity. Never stores gameplay state: it reads the entity and
 * reports eating back through the renderer.
 *
 * Movement is data-driven from SpeciesDef.behaviour and SpeciesDef.motion:
 * fish swim in bursts and glide (or paddle steadily), accelerate with
 * species inertia, turn through rendered yaw frames instead of flipping, keep
 * personal space, school around a shared moving point, hover with sculling
 * fins, sift nose-down, cling to glass, and drift between depth planes.
 * Each individual gets small stable variations in speed and rhythm.
 */
import Phaser from 'phaser';
import { clamp, lerp } from '../core/math';
import { visualRng as rng } from '../core/rng';
import { getSpecies } from '../data/species';
import type { SpeciesDef, SpeciesMotion } from '../data/speciesTypes';
import { isMature } from '../sim/fish';
import { hashString, phenotypeOf } from '../sim/phenotype';
import type { FishEntity } from '../sim/types';
import { fishTexture, SWIM_FRAMES, touchFishTexture, TURN_FRAMES } from './art/fishArt';

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

export interface SchoolPoint {
  x: number;
  y: number;
  t: number;
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
  /** Shared wandering target per schooling species. */
  schools: Map<string, SchoolPoint>;
  /** 0..1 light level at a point (canopy and floating-plant shade). */
  lightAt(x: number, y: number): number;
  onEat(agent: FishAgent, pellet: Pellet): void;
}

const DEFAULT_MOTION: Record<SpeciesDef['body']['shape'], SpeciesMotion> = {
  slender: { beatHz: 3.2, glide: 0.5, turnRate: 0.7, inertia: 0.3, hover: 0.3 },
  torpedo: { beatHz: 4.4, glide: 0.35, turnRate: 0.95, inertia: 0.12, hover: 0.05 },
  deep: { beatHz: 2.4, glide: 0.4, turnRate: 0.6, inertia: 0.4, hover: 0.45 },
  livebearer: { beatHz: 3, glide: 0.45, turnRate: 0.75, inertia: 0.28, hover: 0.35 },
  catfish: { beatHz: 3.4, glide: 0.2, turnRate: 0.7, inertia: 0.32, hover: 0.25 },
  pleco: { beatHz: 1.8, glide: 0.1, turnRate: 0.4, inertia: 0.6, hover: 0 },
  goldfish: { beatHz: 1.4, glide: 0.3, turnRate: 0.35, inertia: 0.75, hover: 0.55 },
};

export function motionFor(sp: SpeciesDef): SpeciesMotion {
  return sp.motion ?? DEFAULT_MOTION[sp.body.shape];
}

export class FishAgent {
  readonly sp: SpeciesDef;
  readonly motion: SpeciesMotion;
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
  partner: FishAgent | null = null;
  gulpStage = 0;
  private wag = rng.range(0, SWIM_FRAMES);
  private phase = rng.range(0, 10);
  private zTarget = 0.5;
  private texKey = '';
  private appearanceT = 0;
  // Stable per-individual variation.
  private readonly ind: { speed: number; beat: number; glide: number; ox: number; oy: number };
  // Burst-and-glide state.
  private bursting = true;
  private burstT = 0;
  private glideT = 0;
  // Turning: progress 0..1 through the yaw frames; -1 when not turning.
  private turnT = -1;
  private turnDur = 0.4;
  private turnFlipped = false;
  private wantHold = 0;
  private onGlass = false;
  private eatPause = 0;

  constructor(private scene: Phaser.Scene, public fish: FishEntity, world: TankWorld) {
    this.sp = getSpecies(fish.speciesId);
    this.motion = motionFor(this.sp);
    const h = hashString(fish.id);
    const u = (k: number) => ((h >>> (k * 4)) % 1000) / 1000;
    this.ind = { speed: 0.88 + u(0) * 0.24, beat: 0.9 + u(1) * 0.2, glide: 0.8 + u(2) * 0.4, ox: (u(3) - 0.5) * 2, oy: (u(4) - 0.5) * 2 };
    this.z = rng.next();
    this.zTarget = this.z;
    this.x = rng.range(world.left + 30 * world.scale, world.right - 30 * world.scale);
    const [d0, d1] = this.sp.behaviour.depth;
    this.y = lerp(world.surface, world.floor, rng.range(d0, d1));
    this.sprite = scene.add.sprite(this.x, this.y, '__DEFAULT');
    this.sprite.setInteractive({ useHandCursor: true });
    // Painting is budgeted per frame; the fish appears once its sheet is ready.
    this.sprite.setVisible(false);
    this.refreshTexture(world);
    this.heading = rng.chance(0.5) ? 1 : -1;
    this.pickTarget(world);
  }

  /** Repaints when the fish's look changes (growth, maturity, pregnancy, health). */
  refreshTexture(world: TankWorld, force = false): void {
    const p = phenotypeOf(this.fish);
    // Fish are drawn a little larger than true scale so they read well on screen.
    const tex = fishTexture(this.scene, p, this.fish.sizeCm * world.pxPerCm * 1.7, force);
    if (!tex) {
      if (!this.texKey) this.appearanceT = 0; // keep asking every frame until painted
      return;
    }
    this.sprite.setVisible(true);
    if (tex.key !== this.texKey) {
      const frame = this.sprite.frame?.name ?? '0';
      this.texKey = tex.key;
      this.sprite.setTexture(tex.key, frame === '__BASE' ? '0' : frame);
      this.len = tex.width;
      this.height = tex.height;
    }
  }

  get bottomDweller(): boolean {
    return this.sp.swimLevel === 'bottom';
  }

  private depthY(world: TankWorld, t: number): number {
    return lerp(world.surface + this.height * 0.4 + 2, world.floor - this.height * 0.35, t);
  }

  private pickTarget(world: TankWorld): void {
    const [d0, d1] = this.sp.behaviour.depth;
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
    this.onGlass = false;
    if (!f.alive) {
      this.mode = 'dead';
      return;
    }
    const night = !world.lightsOn;
    const restChance = night ? (b.nocturnal ? 0.05 : 0.65) : b.nocturnal ? 0.55 : 0.04;
    if (f.hunger > 12 && world.pellets.length) {
      this.mode = 'feed';
      this.modeT = 4;
      return;
    }
    this.modeT = rng.range(2.5, 7) / (0.5 + b.restlessness);
    // Drift to a new depth plane now and then (in front of or behind decor).
    if (rng.chance(0.35)) this.zTarget = clamp(this.zTarget + rng.range(-0.45, 0.45), 0, 1);
    const fry = f.sizeCm / f.adultSizeCm < 0.32;
    if (f.stress > 60 || (rng.next() < b.shyness * 0.35 && world.hides.length) || (fry && world.hides.length && rng.chance(0.55))) {
      this.mode = world.hides.length ? 'hide' : 'rest';
      const hs = this.nearestHide(world);
      if (hs) {
        this.tx = hs.x + rng.range(-hs.r, hs.r) * 0.6;
        this.ty = clamp(hs.y + rng.range(-hs.r, hs.r) * 0.4, world.surface + 10 * world.scale, world.floor - this.height * 0.4);
        this.zTarget = rng.chance(0.6) ? rng.range(0, 0.35) : this.zTarget; // tuck in behind
      }
      return;
    }
    if (rng.chance(restChance)) {
      this.mode = 'rest';
      const hs = this.nearestHide(world);
      this.tx = hs && rng.chance(0.6) ? hs.x : this.x + rng.range(-30, 30) * world.scale;
      this.ty = this.bottomDweller ? world.floor - this.height * 0.3 : this.depthY(world, Math.min(1, b.depth[1] + 0.15));
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
    if (this.sp.breeding.method === 'livebearer' && f.sex === 'male' && isMature(f) && rng.chance(0.3)) {
      const females = world.agents.filter((a) => a.fish.speciesId === f.speciesId && a.fish.sex === 'female' && a.fish.alive);
      if (females.length) {
        this.partner = rng.pick(females);
        this.mode = 'court';
        this.modeT = rng.range(2, 4);
        return;
      }
    }
    if (b.grazer && rng.chance(0.6)) {
      this.mode = 'graze';
      // Plecos rasp algae off the back glass (body turned upright) or off decor.
      if (rng.chance(0.45)) {
        this.onGlass = true;
        this.tx = rng.range(world.left + 30 * world.scale, world.right - 30 * world.scale);
        this.ty = this.depthY(world, rng.range(0.2, 0.85));
        this.zTarget = 0;
      } else {
        const hs = world.hides.length ? rng.pick(world.hides) : null;
        this.tx = hs ? hs.x + rng.range(-hs.r, hs.r) * 0.5 : rng.range(world.left + 20 * world.scale, world.right - 20 * world.scale);
        this.ty = hs ? Math.max(hs.y, world.floor - 40 * world.scale) : world.floor - this.height * 0.3;
      }
      this.modeT *= 2;
      return;
    }
    if (b.sifter && rng.chance(0.65)) {
      this.mode = 'sift';
      this.tx = clamp(this.x + rng.range(-70, 70) * world.scale, world.left + 20 * world.scale, world.right - 20 * world.scale);
      this.ty = world.floor - this.height * 0.3;
      return;
    }
    if (rng.chance(0.12 + this.motion.hover * 0.2)) {
      this.mode = 'pause';
      this.tx = this.x;
      this.ty = this.y;
      this.modeT = rng.range(1.2, 3.5) * (0.6 + this.motion.hover);
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
    this.bursting = true;
    this.burstT = 0.8;
    this.tx = clamp(this.x + Math.sign(this.x - from.x || 1) * 90 * world.scale, world.left + 10, world.right - 10);
    this.ty = clamp(this.y + rng.range(-30, 30) * world.scale, world.surface + 8 * world.scale, world.floor - 8 * world.scale);
  }

  /** Shared moving point a school orbits; members keep stable offsets around it. */
  private schoolTarget(world: TankWorld, time: number): { x: number; y: number } {
    let sp = world.schools.get(this.sp.id);
    const [d0, d1] = this.sp.behaviour.depth;
    if (!sp || time > sp.t || Math.hypot(sp.x - this.x, sp.y - this.y) < 20 * world.scale) {
      sp = { x: rng.range(world.left + 60 * world.scale, world.right - 60 * world.scale), y: this.depthY(world, rng.range(d0, d1)), t: time + rng.range(4, 9) };
      world.schools.set(this.sp.id, sp);
    }
    const spread = (1.25 - this.sp.behaviour.schooling) * this.len * 2.2;
    return { x: sp.x + this.ind.ox * spread, y: sp.y + this.ind.oy * spread * 0.45 };
  }

  update(dt: number, world: TankWorld, time: number): void {
    const f = this.fish;
    const b = this.sp.behaviour;
    const m = this.motion;
    const S = world.scale;
    this.modeT -= dt;
    this.appearanceT -= dt;
    if (this.appearanceT <= 0) {
      this.appearanceT = rng.range(1.5, 3);
      this.refreshTexture(world);
      touchFishTexture(this.texKey);
    }
    if (!this.texKey) return;
    if (!f.alive && this.mode !== 'dead') this.mode = 'dead';
    if (this.mode !== 'dead' && (this.modeT <= 0 || (this.mode !== 'feed' && f.hunger > 12 && world.pellets.length && rng.chance(dt * 2)))) {
      this.chooseMode(world);
    }

    if (this.mode === 'dead') {
      this.vx = lerp(this.vx, Math.sin(time * 0.3 + this.phase) * 3 * S, dt);
      this.vy = lerp(this.vy, this.y > world.surface + 6 * S ? -6 * S : 0, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.sprite.setFlipY(true);
      this.sprite.setTint(0x9a9a92);
      this.sprite.setFrame('0');
      this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
      this.sprite.setDepth(19);
      return;
    }

    const hf = clamp(f.health / 100, 0.3, 1);
    const night = !world.lightsOn;
    const activity = night ? (b.nocturnal ? 1.1 : 0.45) : b.nocturnal ? 0.55 : 1;
    let maxSpeed = b.speed * Math.max(this.len * 0.7, 10 * S) * hf * activity * this.ind.speed;
    let arrive = 24 * S;
    let urgent = false;
    let hovering = false;
    let pitchBias = 0;

    switch (this.mode) {
      case 'feed': {
        let best: Pellet | null = null;
        let bd = Infinity;
        for (const p of world.pellets) {
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
        this.tx = best.x - this.heading * this.len * 0.3;
        this.ty = best.y;
        maxSpeed *= 1.5;
        arrive = 4 * S;
        urgent = true;
        if (this.eatPause > 0) {
          this.eatPause -= dt;
          hovering = true;
        } else if (Math.hypot(best.x - this.x - this.heading * this.len * 0.35, best.y - this.y) < Math.max(6 * S, this.len * 0.4)) {
          world.onEat(this, best);
          this.eatPause = rng.range(0.25, 0.7); // a moment to swallow before the next lunge
        }
        if (this.bottomDweller && best.settled) pitchBias = 0.35;
        break;
      }
      case 'hide':
      case 'rest':
        maxSpeed *= this.mode === 'rest' ? 0.3 : 0.5;
        arrive = 30 * S;
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 14 * S) hovering = true;
        break;
      case 'gulp':
        maxSpeed *= 2;
        arrive = 6 * S;
        urgent = true;
        if (this.gulpStage === 0 && this.y < world.surface + 8 * S) {
          this.gulpStage = 1;
          this.ty = world.floor - this.height * 0.3;
        }
        break;
      case 'chase':
        if (this.partner) {
          this.tx = this.partner.x;
          this.ty = this.partner.y;
        }
        maxSpeed *= 2;
        arrive = 2 * S;
        urgent = true;
        break;
      case 'flee':
        maxSpeed *= 2.2;
        urgent = true;
        break;
      case 'court':
        if (this.partner?.fish.alive) {
          // Males display alongside the female, quivering.
          this.tx = this.partner.x - this.partner.heading * this.partner.len * 0.5;
          this.ty = this.partner.y + Math.sin(time * 7 + this.phase) * 3 * S;
          maxSpeed *= 1.3;
          arrive = 10 * S;
        }
        break;
      case 'graze':
        maxSpeed *= 0.3;
        arrive = 12 * S;
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 8 * S) {
          hovering = true;
          this.tx += Math.sin(time * 0.7 + this.phase) * 6 * S * dt;
          this.ty += Math.cos(time * 0.5 + this.phase) * 4 * S * dt;
        }
        break;
      case 'pause':
        hovering = true;
        maxSpeed *= 0.12;
        arrive = 20 * S;
        this.ty += Math.sin(time * 1.3 + this.phase) * 1.5 * S * dt;
        break;
      case 'investigate':
        maxSpeed *= 0.45;
        arrive = 18 * S;
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 16 * S) hovering = true;
        break;
      case 'sift':
        maxSpeed *= 0.7;
        pitchBias = 0.38; // nose down into the substrate
        if (Math.hypot(this.tx - this.x, this.ty - this.y) < 8 * S) {
          hovering = true;
          if (rng.chance(dt * 1.2)) this.tx = clamp(this.x + rng.range(-35, 35) * S, world.left + 15, world.right - 15);
          if (rng.chance(dt * 0.3)) this.modeT = Math.min(this.modeT, 0.8);
        }
        break;
      default: {
        if (b.schooling >= 0.5) {
          const st = this.schoolTarget(world, time);
          this.tx = st.x;
          this.ty = st.y;
          arrive = 30 * S;
        } else if (Math.hypot(this.tx - this.x, this.ty - this.y) < 14 * S) this.pickTarget(world);
      }
    }

    // Desired velocity toward target, with arrival.
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = maxSpeed * Math.min(1, dist / arrive);
    let dvx = (dx / dist) * sp;
    let dvy = (dy / dist) * sp * 0.65;

    // Personal space and loose schooling for social species.
    let cx = 0, cy = 0, ax = 0, ay = 0, n = 0, sx = 0, sy = 0;
    for (const o of world.agents) {
      if (o === this || !o.fish.alive) continue;
      const ox = o.x - this.x;
      const oy = o.y - this.y;
      const d = Math.abs(ox) + Math.abs(oy) * 1.4;
      const sepR = (this.len + o.len) * 0.42;
      if (d < sepR && d > 0.01 && Math.abs(o.z - this.z) < 0.45) {
        const k = 1 - d / sepR;
        sx -= (ox / d) * k;
        sy -= (oy / d) * k;
      }
      if (b.schooling > 0 && o.fish.speciesId === f.speciesId && d < 110 * S && this.mode === 'cruise') {
        cx += o.x;
        cy += o.y;
        ax += o.vx;
        ay += o.vy;
        n++;
      }
    }
    if (n > 0) {
      const w = b.schooling;
      dvx += ((cx / n - this.x) * 0.35 + (ax / n - this.vx) * 0.9) * w;
      dvy += ((cy / n - this.y) * 0.35 + (ay / n - this.vy) * 0.7) * w;
    }
    dvx += sx * maxSpeed * 1.4;
    dvy += sy * maxSpeed * 0.9;

    // Burst-and-glide: thrust phases separated by coasting (species glide).
    if (urgent) this.bursting = true;
    else if (this.bursting) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.bursting = false;
        this.glideT = m.glide * this.ind.glide * rng.range(0.4, 1.6);
      }
    } else {
      this.glideT -= dt;
      if (this.glideT <= 0) {
        this.bursting = true;
        this.burstT = rng.range(0.35, 1.1) * (1.2 - m.glide);
      }
    }
    const gain = this.bursting ? (urgent ? 7 : 1.2 + 3 * (1 - m.inertia)) : 0.35;
    this.vx = lerp(this.vx, dvx, Math.min(1, dt * gain));
    this.vy = lerp(this.vy, dvy, Math.min(1, dt * gain * 0.9));
    if (!this.bursting) {
      // Coasting: water drag bleeds off speed.
      const drag = 1 - dt * (0.35 + 0.5 * (1 - m.inertia));
      this.vx *= drag;
      this.vy *= drag;
    }
    if (this.turnT >= 0) {
      // Fish slow and bank while turning around.
      this.vx *= 1 - dt * 3;
      this.vy += Math.sin(this.turnT * Math.PI) * maxSpeed * 0.15 * dt * (this.ind.oy > 0 ? 1 : -1);
    }
    const spd = Math.hypot(this.vx, this.vy);
    const cap = maxSpeed * 1.35 + 1;
    if (spd > cap) {
      this.vx = (this.vx / spd) * cap;
      this.vy = (this.vy / spd) * cap;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bounds.
    const halfL = this.len / 2;
    const top = world.surface + this.height * 0.3;
    const bottom = world.floor - this.height * (this.bottomDweller || this.mode === 'feed' ? 0.25 : 0.4);
    if (this.x < world.left + halfL) { this.x = world.left + halfL; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > world.right - halfL) { this.x = world.right - halfL; this.vx = -Math.abs(this.vx) * 0.3; }
    if (this.y < top) { this.y = top; this.vy = Math.abs(this.vy) * 0.3; }
    if (this.y > bottom) { this.y = bottom; this.vy = -Math.abs(this.vy) * 0.3; }

    // Heading changes start a turn through the yaw frames (no instant flip).
    const want = dvx > 3 * S ? 1 : dvx < -3 * S ? -1 : this.heading;
    const courting = this.mode === 'court' && this.partner ? this.partner.heading : 0;
    const desired = courting || want;
    if (this.turnT < 0 && desired !== this.heading) {
      this.wantHold += dt;
      if (this.wantHold > 0.12 || urgent) {
        this.turnT = 0;
        this.turnFlipped = false;
        this.turnDur = clamp((0.22 + 0.55 * (1 - m.turnRate)) * Math.sqrt(Math.max(0.5, this.len / (60 * S))), 0.18, 0.95) * (urgent ? 0.6 : 1);
        this.wantHold = 0;
      }
    } else if (this.turnT < 0) this.wantHold = 0;

    // Animation frame: swim cycle, or a yaw frame mid-turn.
    let frame: number;
    if (this.turnT >= 0) {
      this.turnT += dt / this.turnDur;
      const p = this.turnT;
      if (p >= 0.5 && !this.turnFlipped) {
        this.heading = -this.heading;
        this.turnFlipped = true;
      }
      const k = p < 0.5 ? Math.min(TURN_FRAMES - 1, Math.floor((p / 0.5) * TURN_FRAMES)) : Math.min(TURN_FRAMES - 1, Math.floor(((1 - p) / 0.5) * TURN_FRAMES));
      frame = SWIM_FRAMES + Math.max(0, k);
      if (this.turnT >= 1) this.turnT = -1;
    } else {
      const speedFrac = spd / Math.max(1, maxSpeed);
      const beat = m.beatHz * this.ind.beat * (this.bursting ? 0.7 + 0.8 * speedFrac + (urgent ? 0.6 : 0) : hovering ? 0.35 : 0.12);
      this.wag += dt * beat * SWIM_FRAMES;
      frame = Math.floor(this.wag) % SWIM_FRAMES;
    }
    this.sprite.setFrame(String(frame));

    // Depth plane: drift toward the target layer; nearer fish are larger and clearer.
    if (this.onGlass) this.zTarget = 0;
    this.z = lerp(this.z, this.zTarget, Math.min(1, dt * 0.3));
    const depthScale = 0.8 + 0.2 * this.z;
    this.sprite.scaleX = this.heading * depthScale;
    this.sprite.scaleY = depthScale;

    // Pitch: follow the swim direction; nose-down sifting; plecos stand up on the glass.
    let rot: number;
    if (this.onGlass && this.mode === 'graze' && Math.hypot(this.tx - this.x, this.ty - this.y) < 14 * S) rot = -Math.PI / 2 * this.heading * 0.92;
    else {
      const flat = this.bottomDweller && this.y > bottom - 2 && pitchBias === 0;
      const pitch = flat ? 0 : clamp(this.vy / (spd + 4 * S), -0.55, 0.55) * 0.5 + pitchBias;
      rot = pitch * this.heading;
    }
    const sickTilt = f.health < 35 ? Math.sin(time * 1.5 + this.phase) * 0.25 : 0;
    this.sprite.rotation = lerp(this.sprite.rotation, rot + sickTilt, Math.min(1, dt * (this.onGlass ? 2 : 5)));

    // Light: shade from plants and floating cover, water depth, distance, stress pallor, night.
    const light = world.lightAt(this.x, this.y);
    const pale = clamp(f.stress / 160 + (100 - f.health) / 220, 0, 0.6);
    const depthDim = 0.14 * (1 - this.z);
    const k = clamp(0.5 + 0.5 * light - depthDim - (night ? 0.2 : 0), 0.25, 1.05) * (1 - pale * 0.25);
    const r = Math.round(255 * clamp(k + pale * 0.25, 0, 1));
    const g = Math.round(255 * clamp(k + pale * 0.27 + depthDim * 0.15, 0, 1));
    const bl = Math.round(255 * clamp(k + pale * 0.35 + depthDim * 0.5, 0, 1));
    this.sprite.setTint((r << 16) | (g << 8) | bl);
    this.sprite.setFlipY(false);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(10 + this.z * 9);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
