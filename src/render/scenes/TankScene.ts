/**
 * Aquarium inspection view. Renders the persistent fish of one tank in
 * detail. Game time keeps running while viewing.
 */
import Phaser from 'phaser';
import { controller } from '../../game/GameController';
import { eat } from '../../sim/fish';
import { feedTank } from '../../sim/tank';
import { AMMONIA_PER_FOOD_EATEN } from '../../sim/water';
import { TankRenderer } from '../tankRenderer';
import { TankViewScreen } from '../../ui/screens/tankView';
import { AquascapeScreen } from '../../ui/screens/aquascape';

export class TankScene extends Phaser.Scene {
  tankRenderer!: TankRenderer;
  tankId = '';
  private overlay: TankViewScreen | null = null;

  constructor() {
    super('Tank');
  }

  init(data: { tankId: string; mode?: 'view' | 'aquascape' }): void {
    this.tankId = data.tankId;
    this.registry.set('tankMode', data.mode ?? 'view');
  }

  create(): void {
    const c = controller;
    const tank = c.state.tanks[this.tankId];
    tank.viewActive = true;
    this.tankRenderer = new TankRenderer(this, () => controller.state, this.tankId, {
      onEat: (fish, units) => {
        const t = controller.state.tanks[this.tankId];
        const took = eat(fish, units);
        t.food = Math.max(0, t.food - took);
        t.water.ammonia += (took * AMMONIA_PER_FOOD_EATEN) / t.litres;
        return took;
      },
      onSelect: () => this.overlay?.refreshFish(),
    });
    // Show any leftover food already in the water as settled pellets.
    this.overlay = new TankViewScreen(c, this);
    c.ui.push(this.overlay);
    c.hud.show(false);
    c.hud.setPrompt(null);
    // The overlay screen sits on the UI stack and receives all input.
    c.worldInput = null;
    if (this.registry.get('tankMode') === 'aquascape') this.openAquascape();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const t = controller.sim ? controller.state.tanks[this.tankId] : null;
      if (t) t.viewActive = false;
      if (controller.inGame) controller.hud.show(true);
      this.tankRenderer.destroy();
      if (this.overlay) controller.ui.remove(this.overlay);
      this.overlay = null;
    });
  }

  openAquascape(): void {
    controller.ui.push(new AquascapeScreen(controller, this));
  }

  feed(amount: 'light' | 'normal' | 'heavy'): void {
    const c = controller;
    const t = c.state.tanks[this.tankId];
    const before = t.food;
    const res = c.perform(feedTank(c.state, t, amount), true);
    if (res.ok) {
      this.tankRenderer.dropFood(Math.max(0, t.food - before));
      c.ui.toast(res.message, 'good', 2000);
    }
  }

  exit(): void {
    controller.closeTankView();
  }

  override update(_t: number, deltaMs: number): void {
    if (!controller.sim) return;
    this.tankRenderer.update(Math.min(0.1, deltaMs / 1000));
    this.overlay?.tick();
  }
}
