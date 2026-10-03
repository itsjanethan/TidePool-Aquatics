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
import { getDecor } from '../data/catalog';
import type { GameState } from '../sim/types';
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
      const bottom = getSpecies(f.speciesId).swimLevel === 'bottom';
      if (k) {
        k.dead = !f.alive;
        return k;
      }
      return {
        id: f.id,
        x: vr.range(1, this.rect.w - 3),
        y: bottom ? this.rect.h - 3 : vr.range(2, this.rect.h - 5),
        speed: vr.range(3, 9),
        dir: vr.chance(0.5) ? 1 : -1,
        colour: hexToInt(miniFishColour(f.speciesId, f.morphId)),
        phase: vr.range(0, 6),
        bottom,
        dead: !f.alive,
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
    let water = mix('#58b4d8', '#6aa86a', Math.min(1, tank.algae * 0.8));
    water = mix(water, '#d8e0d0', Math.min(0.8, tank.water.cloudiness * 0.9));
    if (!tank.lightOn) water = mix(water, '#0c1830', 0.55);
    g.fillStyle(hexToInt(water), 1).fillRect(x, y, w, h);
    g.fillStyle(0xffffff, tank.lightOn ? 0.25 : 0.08).fillRect(x, y, w, 1);
    // Substrate strip.
    g.fillStyle(tank.substrateId === 'sand' ? 0xd8c69a : tank.substrateId === 'black_gravel' ? 0x2a2a30 : 0x8a7a62, 1).fillRect(x, y + h - 2, w, 2);
    // Plants as little strokes.
    for (const d of tank.decor) {
      const def = getDecor(d.defId);
      if (def.kind !== 'plant') {
        g.fillStyle(0x7a6a5a, 1).fillRect(x + Math.round(d.x * (w - 4)), y + h - 4, 4, 2);
        continue;
      }
      const px = x + 1 + Math.round(d.x * (w - 3));
      const tall = Math.max(3, Math.min(9, Math.round(def.height / 12)));
      const sway = Math.round(Math.sin(this.t * 1.5 + d.x * 10) * 0.6);
      g.fillStyle(0x3f9a45, 1).fillRect(px + sway, y + h - 2 - tall, 1, tall);
      g.fillStyle(0x5cbf5a, 1).fillRect(px + 1, y + h - 1 - tall + 2, 1, tall - 2);
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
    this.icon.setVisible(!!this.alert);
    if (this.alert) {
      this.icon.setTexture(ICON_TEXTURE[this.alert]);
      this.icon.y = this.prop.y * TILE - 5 + Math.round(Math.sin(this.t * 4) * 1.5);
    }
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
