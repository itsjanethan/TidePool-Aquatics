import Phaser from 'phaser';
import { FLOOR1 } from '../../data/shopLayout';
import { makeCharacterTexture, PLAYER_PALETTE } from '../art/characters';
import { makeTexture, px } from '../art/pixel';
import { makeFloorTexture, makePropTextures } from '../art/shopArt';

/** Generates all static procedural textures, then shows the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeFloorTexture(this, FLOOR1);
    makePropTextures(this, FLOOR1);
    makeCharacterTexture(this, 'player', PLAYER_PALETTE, true);
    makeIcons(this);
    this.scene.start('Title');
  }
}

function bubble(ctx: CanvasRenderingContext2D, fill: string, draw: () => void): void {
  px(ctx, 1, 0, '#22202c', 7, 1);
  px(ctx, 0, 1, '#22202c', 9, 6);
  px(ctx, 1, 7, '#22202c', 7, 1);
  px(ctx, 3, 8, '#22202c', 3, 1);
  px(ctx, 4, 9, '#22202c', 1, 1);
  px(ctx, 1, 1, fill, 7, 6);
  draw();
}

function makeIcons(scene: Phaser.Scene): void {
  makeTexture(scene, 'icon-alert', 9, 10, (ctx) =>
    bubble(ctx, '#f04a3a', () => {
      px(ctx, 4, 2, '#ffffff', 1, 3);
      px(ctx, 4, 6, '#ffffff', 1, 1);
    }),
  );
  makeTexture(scene, 'icon-hungry', 9, 10, (ctx) =>
    bubble(ctx, '#f0c040', () => {
      px(ctx, 2, 4, '#5a3a1a', 1, 1);
      px(ctx, 4, 4, '#5a3a1a', 1, 1);
      px(ctx, 6, 4, '#5a3a1a', 1, 1);
    }),
  );
  makeTexture(scene, 'icon-dirty', 9, 10, (ctx) =>
    bubble(ctx, '#7ab04a', () => {
      px(ctx, 2, 2, '#3a6a2a', 2, 2);
      px(ctx, 5, 4, '#3a6a2a', 2, 2);
      px(ctx, 3, 5, '#3a6a2a', 1, 1);
    }),
  );
}
