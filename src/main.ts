import Phaser from 'phaser';
import '@fontsource/jersey-10/latin-400.css';
import '@fontsource/tiny5/latin-400.css';
import './ui/styles.css';
import { controller } from './game/GameController';
import { BootScene } from './render/scenes/BootScene';
import { TitleScene } from './render/scenes/TitleScene';
import { ShopScene } from './render/scenes/ShopScene';
import { TankScene } from './render/scenes/TankScene';
import { CANVAS_H, CANVAS_W } from './render/res';

export const GAME_W = 480;
export const GAME_H = 320;

const stage = document.getElementById('stage')!;
const uiRoot = document.getElementById('ui')!;

/** Fits the stage to the window keeping 3:2, exposing the scale as --px for the HTML UI. */
function layout(): void {
  const app = document.getElementById('app');
  const vw = app?.clientWidth || window.innerWidth;
  const vh = app?.clientHeight || window.innerHeight;
  let scale = Math.min(vw / GAME_W, vh / GAME_H);
  // Prefer crisp integer scaling when it costs little screen space.
  if (scale >= 2 && scale - Math.floor(scale) < 0.25) scale = Math.floor(scale);
  stage.style.width = `${Math.floor(GAME_W * scale)}px`;
  stage.style.height = `${Math.floor(GAME_H * scale)}px`;
  document.documentElement.style.setProperty('--px', `${scale}px`);
}
layout();
window.addEventListener('resize', layout);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_W,
  height: CANVAS_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1b1830',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
  scene: [BootScene, TitleScene, ShopScene, TankScene],
});

controller.setup(game, uiRoot);
window.addEventListener('resize', () => game.scale.refresh());

// PWA: offline support on the normal static build (not in the single-file build).
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && 'serviceWorker' in navigator) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}
