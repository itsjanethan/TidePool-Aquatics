/**
 * Small animated aquarium shown in the shop overworld. Shows water clarity,
 * algae, tiny swimming fish and status icons.
 */
import { incomingCount } from '../sim/incoming';
import { tankAlert, type AlertIcon } from '../sim/tankDiagnostics';
import Phaser from 'phaser';
import { visualRng as vr } from '../core/rng';
import type { PropPlacement } from '../data/shopLayout';
import { TILE } from '../data/shopLayout';
import { fishInTank } from '../sim/fish';
import { getSpecies } from '../data/species';
import { getDecor, getSubstrate } from '../data/catalog';
import type { GameState, TankState } from '../sim/types';
import { isEnclosure, isLandAnimal, isPaludarium, terraOf } from '../sim/terrarium';
import { miniFishColour } from './art/fishArt';
import { hexToInt, mix } from './art/pixel';
import { propTextureKey, tankWaterRect } from './art/shopArt';

interface Dot {
  id: string;
  x: number;
  y: number;
  speed: number;
  dir: number;
  colour: number;
  phase: number;
  bottom: boolean;
  dead: boolean;
  /** Enclosures: lives on land (and climbs the glass if a climber). */
  land: boolean;
  climber: boolean;
  /** Land animals sit still between short moves. */
  pause: number;
}

/** Overworld status bubble; always the top issue from the shared tank diagnostics. */
export type TankAlert = AlertIcon | null;

const ICON_TEXTURE: Record<AlertIcon, string> = { dead: 'icon-dead', toxic: 'icon-alert', sick: 'icon-sick', hungry: 'icon-hungry', dirty: 'icon-dirty', attention: 'icon-attention' };

export class OverworldTank {
  image: Phaser.GameObjects.Image;
  gfx: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  /** Shown while livestock is on order for this tank (not yet arrived). */
  incoming: Phaser.GameObjects.Image;
  private dots: Dot[] = [];
  private t = 0;
  private resync = 0;
  alert: TankAlert = null;
  readonly rect: { x: number; y: number; w: number; h: number };

  constructor(scene: Phaser.Scene, public prop: PropPlacement, private getState: () => GameState) {
    const x = prop.x * TILE;
    const y = prop.y * TILE;
    this.image = scene.add.image(x, y, propTextureKey(prop)).setOrigin(0, 0).setDepth((prop.y + prop.h) * TILE - 1);
    const r = tankWaterRect(prop.w * TILE);
    this.rect = { x: x + r.x, y: y + r.y, w: r.w, h: r.h };
    this.gfx = scene.add.graphics().setDepth(this.image.depth + 0.1);
    this.icon = scene.add.image(x + (prop.w * TILE) / 2, y - 4, 'icon-alert').setDepth(5000).setVisible(false);
    this.incoming = scene.add.image(x + 1, y + 1, 'icon-incoming').setOrigin(0, 0).setDepth(5000).setVisible(false);
    this.sync();
  }

  private sync(): void {
    const s = this.getState();
    const fish = fishInTank(s, this.prop.id, true).slice(0, 14);
    const known = new Map(this.dots.map((d) => [d.id, d]));
    this.dots = fish.map((f) => {
      const k = known.get(f.id);
      const sp = getSpecies(f.speciesId);
      const bottom = sp.swimLevel === 'bottom';
      const crawler = sp.tags.includes('invertebrate');
      const land = isLandAnimal(sp);
      if (k) {
        k.dead = !f.alive;
        return k;
      }
      return {
        id: f.id,
        x: vr.range(1, this.rect.w - 3),
        y: land ? -1 : bottom ? this.rect.h - 3 : vr.range(2, this.rect.h - 5),
        speed: crawler ? vr.range(0.4, 1.6) : vr.range(3, 9),
        dir: vr.chance(0.5) ? 1 : -1,
        colour: hexToInt(miniFishColour(f.speciesId, f.morphId)),
        phase: vr.range(0, 6),
        bottom,
        dead: !f.alive,
        land,
        climber: !!sp.terra?.climber,
        pause: vr.range(0, 3),
      };
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.resync -= dt;
    if (this.resync <= 0) {
      this.resync = 0.5;
      this.sync();
      this.updateAlert();
      this.incoming.setVisible(incomingCount(this.getState(), this.prop.id) > 0);
    }
    const tank = this.getState().tanks[this.prop.id];
    const g = this.gfx;
    const { x, y, w, h } = this.rect;
    g.clear();
    if (isEnclosure(tank)) {
      this.drawEnclosure(dt, tank);
      this.showIcon();
      return;
    }
    const reefLit = tank.waterType === 'marine' && (tank.reef?.light ?? 'standard') !== 'standard';
    let water = mix(reefLit ? '#3a7ae0' : '#58b4d8', '#6aa86a', Math.min(1, tank.algae * 0.8));
    water = mix(water, '#d8e0d0', Math.min(0.8, tank.water.cloudiness * 0.9));
    if (!tank.lightOn) water = mix(water, '#0c1830', 0.55);
    g.fillStyle(hexToInt(water), 1).fillRect(x, y, w, h);
    g.fillStyle(0xffffff, tank.lightOn ? 0.25 : 0.08).fillRect(x, y, w, 1);
    // Substrate strip.
    g.fillStyle(tank.substrateId === 'sand' ? 0xd8c69a : tank.substrateId === 'black_gravel' ? 0x2a2a30 : 0x8a7a62, 1).fillRect(x, y + h - 2, w, 2);
    // Plants as little strokes.
    for (const d of tank.decor) {
      const def = getDecor(d.defId);
      if (def.kind === 'coral') continue;
      if (def.kind !== 'plant') {
        // Marine live rock reads as lumpy pale rock; other hardscape as a small block.
        if (def.id === 'live_rock') {
          const rx = x + Math.round(d.x * (w - 6));
          g.fillStyle(0xb8a890, 1).fillRect(rx, y + h - 5, 6, 3);
          g.fillStyle(0xc45a9a, 1).fillRect(rx + 1, y + h - 6, 3, 1);
        } else g.fillStyle(0x7a6a5a, 1).fillRect(x + Math.round(d.x * (w - 4)), y + h - 4, 4, 2);
        continue;
      }
      const px = x + 1 + Math.round(d.x * (w - 3));
      const tall = Math.max(3, Math.min(9, Math.round(def.height / 12)));
      const sway = Math.round(Math.sin(this.t * 1.5 + d.x * 10) * 0.6);
      g.fillStyle(0x3f9a45, 1).fillRect(px + sway, y + h - 2 - tall, 1, tall);
      g.fillStyle(0x5cbf5a, 1).fillRect(px + 1, y + h - 1 - tall + 2, 1, tall - 2);
    }
    // Corals: coloured clumps on the rock (higher placements sit higher), polyps twinkling.
    for (const d of tank.decor) {
      const def = getDecor(d.defId);
      if (def.kind !== 'coral' || !def.coral) continue;
      const cx = x + Math.round(d.x * (w - 4));
      const cy = y + h - (d.layer === 0 ? 8 : d.layer === 1 ? 6 : 3);
      const col = hexToInt(mix(def.coral.colours.tip, '#f4f2ee', (d.bleach ?? 0) * 0.85));
      const big = d.size > 1.1 ? 1 : 0;
      g.fillStyle(hexToInt(mix(def.coral.colours.base, '#f4f2ee', (d.bleach ?? 0) * 0.85)), 1).fillRect(cx, cy, 3 + big, 2);
      g.fillStyle(col, 1).fillRect(cx + (Math.sin(this.t * 2 + d.x * 20) > 0 ? 1 : 0), cy - 1, 2, 1);
    }
    // Fish dots.
    for (const d of this.dots) {
      if (d.dead) {
        g.fillStyle(0xb0b0a8, 1).fillRect(x + Math.round(d.x), y + 1, 3, 1);
        continue;
      }
      d.x += d.dir * d.speed * dt * (tank.lightOn ? 1 : 0.3);
      if (d.x < 0) { d.x = 0; d.dir = 1; }
      if (d.x > w - 3) { d.x = w - 3; d.dir = -1; }
      if (vr.chance(dt * 0.3)) d.dir *= -1;
      const yy = d.bottom ? h - 3 : Math.max(1, Math.min(h - 4, d.y + Math.sin(this.t * 2 + d.phase) * 1.2));
      g.fillStyle(d.colour, 1).fillRect(x + Math.round(d.x), y + Math.round(yy), 3, 1);
      g.fillRect(x + Math.round(d.x) + (d.dir > 0 ? -1 : 3), y + Math.round(yy), 1, 1);
    }
    // Glass dirt tint.
    if (tank.glassDirt > 0.3) g.fillStyle(0x8a7a50, Math.min(0.45, (tank.glassDirt - 0.3) * 0.7)).fillRect(x, y, w, h);
    // Bubbles.
    if (tank.airStone || tank.filterId === 'sponge') {
      const bx = tank.airStone ? x + w / 2 : x + w - 3;
      const by = y + h - 3 - ((this.t * 8) % (h - 3));
      g.fillStyle(0xe8f8ff, 0.8).fillRect(Math.round(bx), Math.round(by), 1, 1);
    }
    this.showIcon();
  }

  private showIcon(): void {
    this.icon.setVisible(!!this.alert);
    if (this.alert) {
      this.icon.setTexture(ICON_TEXTURE[this.alert]);
      this.icon.y = this.prop.y * TILE - 5 + Math.round(Math.sin(this.t * 4) * 1.5);
    }
  }

  /**
   * A vivarium, terrarium or paludarium in miniature: the back wall, a deep
   * substrate (a soil bank and a pool in a paludarium), plants and hides,
   * the lamp's warm spot, mist on humid glass, and animals that sit, hop and
   * climb rather than swim.
   */
  private drawEnclosure(dt: number, tank: TankState): void {
    const g = this.gfx;
    const { x, y, w, h } = this.rect;
    const tr = terraOf(tank);
    const night = !tank.lightOn;
    const wallCol: Record<string, string> = { cork_wall: '#4e3a2a', desert_wall: '#b4875a', jungle_wall: '#2e4a26' };
    let wall = wallCol[tank.backgroundId] ?? '#3a4048';
    if (night) wall = mix(wall, '#0a0c18', 0.6);
    g.fillStyle(hexToInt(wall), 1).fillRect(x, y, w, h);
    if (tank.backgroundId === 'jungle_wall') for (let i = 0; i < w; i += 3) g.fillStyle(hexToInt(mix('#4a7a34', wall, night ? 0.6 : 0)), 1).fillRect(x + i, y + ((i * 7) % 5), 2, 2);
    const sub = getSubstrate(tank.substrateId);
    const soil = hexToInt(mix(sub.colourB, '#000000', night ? 0.5 : 0));
    const pal = isPaludarium(tank);
    const poolX = pal ? Math.round(w * 0.55) : w;
    const poolY = Math.round(h * 0.45);
    if (pal) {
      // Soil bank on the left, the pool on the right.
      g.fillStyle(soil, 1).fillRect(x, y + poolY, poolX, h - poolY);
      g.fillStyle(hexToInt(mix('#4a8a3a', '#000000', night ? 0.5 : 0)), 1).fillRect(x, y + poolY, poolX, 1);
      g.fillStyle(soil, 1).fillRect(x + poolX, y + poolY + 2, 2, h - poolY - 2);
      let water = mix('#4aa0b8', '#6aa86a', Math.min(1, tank.algae * 0.8));
      water = mix(water, '#d8e0d0', Math.min(0.8, tank.water.cloudiness * 0.9));
      if (night) water = mix(water, '#0c1830', 0.55);
      g.fillStyle(hexToInt(water), 1).fillRect(x + poolX, y + poolY + 1, w - poolX, h - poolY - 1);
      g.fillStyle(0xffffff, night ? 0.08 : 0.3).fillRect(x + poolX, y + poolY + 1, w - poolX, 1);
    } else g.fillStyle(soil, 1).fillRect(x, y + h - 3, w, 3);
    const groundY = (fx: number) => (pal && fx < poolX ? poolY : h - 3);
    // Hides, branches, litter, then plants.
    for (const d of tank.decor) {
      const def = getDecor(d.defId);
      const px = Math.round(d.x * (w - 4));
      const gy = groundY(px);
      if (def.kind === 'plant') {
        const tall = Math.max(3, Math.min(8, Math.round(def.height / 12)));
        const leaf = hexToInt(mix(def.land ? '#3f8a3a' : '#3f9a45', '#000000', night ? 0.5 : 0));
        const sway = Math.round(Math.sin(this.t * 1.2 + d.x * 10) * 0.5);
        if (def.land) {
          g.fillStyle(leaf, 1).fillRect(x + px - 1, y + gy - tall + 2, 3, tall - 2);
          g.fillStyle(leaf, 1).fillRect(x + px + sway - 2, y + gy - tall, 5, 2);
          if (def.id === 'bromeliad') g.fillStyle(0xc83a3a, 1).fillRect(x + px, y + gy - 3, 1, 1);
        } else {
          g.fillStyle(leaf, 1).fillRect(x + px + sway, y + gy - tall, 1, tall);
        }
        continue;
      }
      if (def.provides.includes('climbing')) {
        for (let k = 0; k < 7; k++) g.fillStyle(0x8a6a44, 1).fillRect(x + px - 3 + k, y + gy - 1 - k, 1, 1);
        continue;
      }
      if (def.provides.includes('litter')) {
        g.fillStyle(0x8a5a2e, 1).fillRect(x + px, y + gy - 1, 4, 1);
        continue;
      }
      g.fillStyle(def.art === 'slate' ? 0x5a5a60 : 0x6a5038, 1).fillRect(x + px, y + gy - 3, 4, 3);
      g.fillStyle(0x1a120c, 1).fillRect(x + px + 1, y + gy - 1, 2, 1);
    }
    // Basking lamp: a warm spot under the lid.
    if (tr.heatLamp !== null && !night) {
      g.fillStyle(0xffb050, 0.25).fillRect(x + 2, y, Math.round(w * 0.4), h - 3);
      g.fillStyle(0xffd080, 1).fillRect(x + Math.round(w * 0.2), y, 2, 1);
    }
    // Animals.
    for (const d of this.dots) {
      const fx = Math.round(d.x);
      if (d.dead) {
        g.fillStyle(0xb0b0a8, 1).fillRect(x + fx, y + groundY(fx) - 1, 2, 1);
        continue;
      }
      if (!d.land) {
        // Pool fish and shrimp stay in the water.
        d.x += d.dir * d.speed * dt * (night ? 0.3 : 1);
        if (d.x < poolX + 1) { d.x = poolX + 1; d.dir = 1; }
        if (d.x > w - 3) { d.x = w - 3; d.dir = -1; }
        const yy = d.bottom ? h - 2 : Math.max(poolY + 2, Math.min(h - 3, poolY + 3 + (d.y % Math.max(1, h - poolY - 5)) + Math.sin(this.t * 2 + d.phase)));
        g.fillStyle(d.colour, 1).fillRect(x + Math.round(d.x), y + Math.round(yy), 2, 1);
        continue;
      }
      d.pause -= dt * (night ? 0.4 : 1);
      if (d.pause <= 0) {
        d.pause = vr.range(1.5, 5);
        d.dir = vr.chance(0.5) ? 1 : -1;
        d.x = Math.max(1, Math.min((pal && !d.climber ? poolX : w) - 3, d.x + d.dir * vr.range(2, 6)));
        d.y = d.climber && vr.chance(0.5) ? vr.range(2, h - 8) : -1;
      }
      const gy = d.y >= 0 ? d.y : groundY(fx) - 2;
      const hop = d.pause > 0 && d.pause < 0.2 ? -1 : 0;
      g.fillStyle(d.colour, 1).fillRect(x + fx, y + Math.round(gy) + hop, 3, 2);
      g.fillStyle(0x101010, 1).fillRect(x + fx + (d.dir > 0 ? 2 : 0), y + Math.round(gy) + hop, 1, 1);
    }
    // Condensation on humid glass, and smears.
    if (tr.humidity > 78) g.fillStyle(0xe8f0f4, Math.min(0.3, (tr.humidity - 78) / 50)).fillRect(x, y, w, h);
    if (tank.glassDirt > 0.3) g.fillStyle(0x8a7a50, Math.min(0.45, (tank.glassDirt - 0.3) * 0.7)).fillRect(x, y, w, h);
    // Mesh lid.
    g.fillStyle(0x50566a, 1).fillRect(x, y, w, 1);
  }

  private updateAlert(): void {
    const s = this.getState();
    this.alert = tankAlert(s, s.tanks[this.prop.id]);
  }

  destroy(): void {
    this.image.destroy();
    this.gfx.destroy();
    this.icon.destroy();
    this.incoming.destroy();
  }
}
