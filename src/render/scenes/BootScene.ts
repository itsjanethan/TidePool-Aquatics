import Phaser from 'phaser';
import { FLOORS } from '../../data/floors';
import { makeCharacterTexture, PLAYER_PALETTE } from '../art/characters';
import { makeTexture, px } from '../art/pixel';
import { makeFloorTexture, makePropTextures } from '../art/shopArt';

/** Generates all static procedural textures, then shows the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    for (const f of FLOORS) {
      makeFloorTexture(this, f.layout);
      makePropTextures(this, f.layout);
    }
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
  // Dead fish: dark bubble with a cross.
  makeTexture(scene, 'icon-dead', 9, 10, (ctx) =>
    bubble(ctx, '#4a4658', () => {
      px(ctx, 4, 1, '#ffffff', 1, 5);
      px(ctx, 2, 2, '#ffffff', 5, 1);
    }),
  );
  // Sick fish: pink bubble with a medical plus.
  makeTexture(scene, 'icon-sick', 9, 10, (ctx) =>
    bubble(ctx, '#e070a8', () => {
      px(ctx, 4, 2, '#ffffff', 1, 4);
      px(ctx, 3, 3, '#ffffff', 3, 2);
    }),
  );
  // General attention (habitat, stocking, equipment): orange "!".
  makeTexture(scene, 'icon-attention', 9, 10, (ctx) =>
    bubble(ctx, '#f09030', () => {
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
  // Livestock on order: a small parcel tag (not a bubble, so it never reads as an alert).
  makeTexture(scene, 'icon-incoming', 9, 8, (ctx) => {
    px(ctx, 0, 1, '#22202c', 9, 7);
    px(ctx, 1, 2, '#c8955a', 7, 5);
    px(ctx, 1, 2, '#dcae74', 7, 1);
    px(ctx, 4, 2, '#f4ead0', 1, 5);
    px(ctx, 2, 0, '#22202c', 5, 1);
    px(ctx, 3, 1, '#7ad0ff', 3, 1);
  });
  makeTexture(scene, 'icon-dirty', 9, 10, (ctx) =>
    bubble(ctx, '#7ab04a', () => {
      px(ctx, 2, 2, '#3a6a2a', 2, 2);
      px(ctx, 5, 4, '#3a6a2a', 2, 2);
      px(ctx, 3, 5, '#3a6a2a', 1, 1);
    }),
  );
}
