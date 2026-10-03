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
import { CANVAS_H, CANVAS_W } from '../res';
import { view } from '../view';

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
        // Idle Mode: hunger and water are frozen; fish only mime eating.
        if (controller.idle) return 0;
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
    // Immersive on touch devices: the tank view has its own buttons, so the
    // d-pad and action buttons step aside and the tank gets the whole screen.
    c.layout?.setControls('minimal');
    this.fit();
    c.hud.show(false);
    c.hud.setPrompt(null);
    // The overlay screen sits on the UI stack and receives all input.
    c.worldInput = null;
    if (this.registry.get('tankMode') === 'aquascape') this.openAquascape();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const t = controller.sim ? controller.state.tanks[this.tankId] : null;
      if (t) t.viewActive = false;
      if (controller.inGame) controller.hud.show(true);
      controller.layout?.setControls('full');
      this.lastFit = '';
      this.tankRenderer.destroy();
      if (this.overlay) controller.ui.remove(this.overlay);
      this.overlay = null;
    });
  }

  openAquascape(): void {
    const blocked = controller.lockReason('aquascape');
    if (blocked) {
      controller.ui.toast(blocked, 'warn');
      return;
    }
    controller.ui.push(new AquascapeScreen(controller, this));
  }

  feed(amount: 'light' | 'normal' | 'heavy'): void {
    const c = controller;
    const blocked = c.lockReason('maintenance');
    if (blocked) {
      c.ui.toast(blocked, 'warn');
      return;
    }
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

  private lastFit = '';

  /**
   * Fits the tank to the canvas. Landscape: as large as fits, centred.
   * Portrait: full width under the top bar, so the fish card and buttons sit
   * below the tank instead of over it. Publishes --tank-top / --tank-bottom
   * (CSS px) for the overlay layout.
   */
  fit(): void {
    const cam = this.cameras.main;
    const cw = this.scale.width;
    const ch = this.scale.height;
    const k = view.k;
    const ui = document.querySelector('.tank-view-ui');
    const topPx = ((ui?.querySelector('.tv-top') as HTMLElement | null)?.offsetHeight ?? 0) * k;
    const barCss = (ui?.querySelector('.tv-bar') as HTMLElement | null)?.offsetHeight ?? 0;
    const portrait = ch > cw * 1.05;
    const key = `${cw}x${ch}|${k}|${topPx}|${barCss}|${portrait}`;
    if (key === this.lastFit) return;
    this.lastFit = key;
    if (cam.width !== cw || cam.height !== ch) cam.setSize(cw, ch);
    let z: number;
    let top: number;
    if (portrait) {
      z = Math.min(cw / CANVAS_W, (ch - topPx) / CANVAS_H);
      top = -topPx / z;
    } else {
      z = Math.min(cw / CANVAS_W, ch / CANVAS_H);
      top = CANVAS_H / 2 - ch / (2 * z);
    }
    cam.setZoom(z);
    cam.centerOn(CANVAS_W / 2, top + ch / (2 * z));
    const root = document.documentElement.style;
    root.setProperty('--tank-top', `${Math.round((-top * z) / k)}px`);
    root.setProperty('--tank-bottom', `${Math.round(((CANVAS_H - top) * z) / k)}px`);
    root.setProperty('--tv-bar-h', `${barCss}px`);
  }

  override update(_t: number, deltaMs: number): void {
    if (!controller.sim) return;
    this.fit();
    this.tankRenderer.update(Math.min(0.1, deltaMs / 1000));
    this.overlay?.tick(Math.min(0.1, deltaMs / 1000));
  }
}
