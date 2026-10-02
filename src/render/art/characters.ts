/**
 * 16x16 four-directional character sprites built from row templates and
 * palettes, so every customer can get unique colours from one template.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import { drawRows, makeTexture } from './pixel';

const HEAD_DOWN = [
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '...ohssssssho...',
  '...ossessesso...',
  '....osssssso....',
];
const HEAD_UP = [
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '....ohhhhhho....',
];
const BODY_FRONT = [
  '....occcccco....',
  '...occcccccco...',
  '..osccccccccso..',
  '..osccccccccso..',
  '...oppppppppo...',
];
const LEGS_FRONT = [
  ['...opppoopppo...', '...offo..offo...'],
  ['...opppo.oppo...', '...offo...oo....'],
  ['...oppo.opppo...', '....oo...offo...'],
];
const HEAD_SIDE = [
  '................',
  '......ooooo.....',
  '.....ohhhhho....',
  '....ohhhhhhho...',
  '....ohhhhhhho...',
  '....ohhhsssso...',
  '....ohhsssesoo..',
  '.....ohsssso....',
];
const BODY_SIDE = [
  '......occco.....',
  '.....occccco....',
  '.....occscco....',
  '.....occscco....',
  '.....oppppo.....',
];
const LEGS_SIDE = [
  ['.....oppppo.....', '.....offffo.....'],
  ['....oppo.ppo....', '....ofo..ofo....'],
  ['.....opppo......', '......offo......'],
];

export type Dir = 'down' | 'up' | 'left' | 'right';
export const DIRS: Dir[] = ['down', 'up', 'left', 'right'];

export interface CharPalette {
  o: string;
  h: string;
  s: string;
  e: string;
  c: string;
  p: string;
  f: string;
}

function frameRows(dir: Dir, frame: number): { rows: string[]; mirror: boolean; bob: number } {
  const f = frame % 3;
  const bob = f === 0 ? 0 : 1;
  if (dir === 'down' || dir === 'up') {
    const head = dir === 'down' ? HEAD_DOWN : HEAD_UP;
    return { rows: [...head, ...BODY_FRONT, ...LEGS_FRONT[f], '................'], mirror: false, bob };
  }
  return { rows: [...HEAD_SIDE, ...BODY_SIDE, ...LEGS_SIDE[f], '................'], mirror: dir === 'left', bob };
}

/**
 * Builds a 12-frame sheet: 4 directions x 3 frames (idle, stepA, stepB).
 * Frame names: `${dir}${n}`.
 */
export function makeCharacterTexture(scene: Phaser.Scene, key: string, pal: CharPalette, apron = false): void {
  const tex = makeTexture(scene, key, 16 * 12, 17, (ctx) => {
    DIRS.forEach((dir, di) => {
      for (let f = 0; f < 3; f++) {
        const { rows, mirror, bob } = frameRows(dir, f);
        const palette: Record<string, string> = { ...pal };
        drawRows(ctx, rows, palette, (di * 3 + f) * 16, 1 - bob, mirror);
        if (apron && dir !== 'up') {
          ctx.fillStyle = '#f2f2ea';
          const ox = (di * 3 + f) * 16;
          if (dir === 'down') ctx.fillRect(ox + 6, 10 - bob, 4, 3);
          else ctx.fillRect(ox + (dir === 'right' ? 8 : 6), 10 - bob, 2, 3);
        }
      }
    });
  });
  DIRS.forEach((dir, di) => {
    for (let f = 0; f < 3; f++) tex.add(`${dir}${f}`, 0, (di * 3 + f) * 16, 0, 16, 17);
  });
}

const HAIR = ['#2a1d16', '#5a3a22', '#8a5a2a', '#c89a4a', '#e0c070', '#1e1e24', '#a03a20', '#cfcfd8', '#6a4a8a'];
const SKIN = ['#f6d4b4', '#ecbc94', '#cf9a70', '#a87250', '#7a5034', '#5a3a26'];
const SHIRT = ['#d04a4a', '#4a7ad0', '#e0a030', '#5aa05a', '#9a5ac0', '#e07ab0', '#3ab0b0', '#f0e0c0', '#606878', '#c0603a'];
const PANTS = ['#3a4a6a', '#2a2a30', '#5a4a3a', '#6a6a72', '#3a5a3a', '#7a6a50'];

export function customerPalette(seed: number): CharPalette {
  const r = new Rng(seed);
  return { o: '#2a2030', h: r.pick(HAIR), s: r.pick(SKIN), e: '#1a1420', c: r.pick(SHIRT), p: r.pick(PANTS), f: '#2a2226' };
}

export const PLAYER_PALETTE: CharPalette = {
  o: '#22202c', h: '#3a2418', s: '#f0c8a0', e: '#1a1420', c: '#2e9c8a', p: '#34405a', f: '#2a2226',
};
