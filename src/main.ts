import Phaser from 'phaser';
import '@fontsource/jersey-10/latin-400.css';
import '@fontsource/tiny5/latin-400.css';
import './ui/styles.css';
import { controller } from './game/GameController';
import { BootScene } from './render/scenes/BootScene';
import { TitleScene } from './render/scenes/TitleScene';
import { ShopScene } from './render/scenes/ShopScene';
import { TankScene } from './render/scenes/TankScene';
import { LayoutManager } from './ui/layoutManager';
import { guardFastTaps } from './ui/tapGuard';
import { shouldInstallTouch } from './ui/touch';
import { view } from './render/view';

const stage = document.getElementById('stage')!;
const uiRoot = document.getElementById('ui')!;

// Lay the page out first so the canvas starts at its real size.
const layout = new LayoutManager(stage, null, shouldInstallTouch());
layout.apply();
const k = view.k || 1;
const g0 = layout.layout!.game;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: Math.max(1, Math.round(g0.w * k)),
  height: Math.max(1, Math.round(g0.h * k)),
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1b1830',
  // The canvas fills the game rectangle; scenes fit their own cameras.
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
  scene: [BootScene, TitleScene, ShopScene, TankScene],
});

controller.setup(game, uiRoot, layout);
// Quick repeated taps on the game must not zoom the page (see ui/tapGuard.ts).
guardFastTaps(document.body);
layout.setGame(game);

// PWA: offline support on the normal static build (not in the single-file build).
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && import.meta.env.MODE !== 'sandbox-single' && 'serviceWorker' in navigator) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => undefined);
  });
}
