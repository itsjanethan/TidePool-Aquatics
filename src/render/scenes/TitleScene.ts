/** Title screen: a live demo aquarium behind the HTML title menu. */
import Phaser from 'phaser';
import { controller } from '../../game/GameController';
import { newGame } from '../../sim/newGame';
import type { GameState } from '../../sim/types';
import { TankRenderer } from '../tankRenderer';
import { showTitle } from '../../ui/screens/title';

export class TitleScene extends Phaser.Scene {
  private tankRenderer: TankRenderer | null = null;
  private demo!: GameState;

  constructor() {
    super('Title');
  }

  create(): void {
    this.demo = newGame({ seed: 20240611 });
    const t = this.demo.tanks.B1;
    t.algae = 0;
    t.glassDirt = 0;
    t.decor.push(
      { uid: 'demo1', defId: 'vallisneria', x: 0.05, layer: 0, flip: false, health: 1, size: 1.2 },
      { uid: 'demo2', defId: 'vallisneria', x: 0.95, layer: 0, flip: false, health: 1, size: 1.1 },
      { uid: 'demo3', defId: 'hornwort', x: 0.55, layer: 0, flip: false, health: 1, size: 1 },
      { uid: 'demo4', defId: 'river_stone', x: 0.5, layer: 2, flip: false, health: 1, size: 1 },
    );
    // A colourful mix of the starter fish for the title tank.
    for (const f of Object.values(this.demo.fish)) {
      if (['A1', 'A4', 'A5'].includes(f.tankId ?? '')) {
        f.tankId = 'B1';
        f.sizeCm = Math.max(f.sizeCm, f.adultSizeCm * 0.85);
      }
      f.hunger = 0;
      f.stress = 0;
    }
    this.tankRenderer = new TankRenderer(this, () => this.demo, 'B1');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tankRenderer?.destroy();
      this.tankRenderer = null;
    });
    controller.worldInput = null;
    void controller.ready.then(() => {
      if (!this.sys.isActive()) return;
      void showTitle(controller);
      if (__DEV_TOOLS__) {
        // Developer builds only: #gallery[=species] opens the morph gallery, ?sandbox starts the sandbox.
        const m = /#gallery(?:=(\w+))?/.exec(location.hash);
        if (m) void import('../../dev/gallery').then((g) => setTimeout(() => g.openGallery(controller, m[1]), 400));
        else if (/[?&]sandbox\b/.test(location.search)) void import('../../dev/sandboxScreen').then((sb) => sb.startSandbox(controller));
      }
    });
  }

  override update(_t: number, deltaMs: number): void {
    this.tankRenderer?.update(Math.min(0.1, deltaMs / 1000));
  }
}
