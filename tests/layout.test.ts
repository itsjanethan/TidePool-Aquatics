// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { backingScale, computeLayout, MAX_BACKING_PIXELS, uiUnit } from '../src/ui/viewport';
import { getPrefs, resetPrefsCache, sanitizePrefs, setPrefs } from '../src/ui/displayPrefs';
import { clampCentre, containZoom, setLabelPos, setLabelTransform, shopZoom } from '../src/render/view';
import { faceToward, planTapPath } from '../src/render/tapPath';
import { FLOORS } from '../src/data/floors';
import { buildWalkGrid, TILE } from '../src/data/shopLayout';

const none = { top: 0, right: 0, bottom: 0, left: 0 };
const inside = (r: { x: number; y: number; w: number; h: number }, vw: number, vh: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Responsive layout', () => {
  it('portrait phone: game on top, controls below, nothing overlaps', () => {
    const l = computeLayout(390, 844, none, 'full');
    expect(l.orientation).toBe('portrait');
    expect(l.placement).toBe('below');
    expect(l.game.w).toBe(390);
    expect(l.game.h).toBeGreaterThan(550);
    expect(inside(l.pad!, 390, 844) && inside(l.buttons!, 390, 844)).toBe(true);
    expect(overlap(l.game, l.pad!) || overlap(l.game, l.buttons!)).toBe(false);
    expect(l.compact).toBe(true);
  });

  it('landscape phone: controls either side of the game', () => {
    const l = computeLayout(844, 390, none, 'full');
    expect(l.placement).toBe('sides');
    expect(l.game.h).toBe(390);
    expect(l.pad!.x + l.pad!.w).toBeLessThanOrEqual(l.game.x);
    expect(l.buttons!.x).toBeGreaterThanOrEqual(l.game.x + l.game.w);
  });

  it('respects safe areas (notch and home indicator)', () => {
    const safe = { top: 47, right: 0, bottom: 34, left: 0 };
    const p = computeLayout(390, 844, safe, 'full');
    expect(p.game.y).toBe(47);
    expect(p.pad!.y + p.pad!.h).toBeLessThanOrEqual(844 - 34);
    const l = computeLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 }, 'full');
    expect(l.pad!.x).toBe(47);
    expect(l.buttons!.x + l.buttons!.w).toBeLessThanOrEqual(844 - 47);
    expect(l.game.y + l.game.h).toBeLessThanOrEqual(390 - 21);
  });

  it('immersive (minimal) and desktop (none) use the whole safe screen', () => {
    for (const mode of ['minimal', 'none'] as const) {
      const l = computeLayout(844, 390, none, mode);
      expect(l.game).toEqual({ x: 0, y: 0, w: 844, h: 390 });
    }
    expect(computeLayout(1280, 800, none, 'none').compact).toBe(false);
  });

  it('tiny screens fall back to controls over the game rather than an unusable game area', () => {
    const l = computeLayout(320, 380, none, 'full');
    expect(l.placement).toBe('overlay');
    expect(l.game.h).toBe(380);
  });

  it('UI unit keeps body text at 18 px or more and follows the text size setting', () => {
    const phone = computeLayout(390, 844, none, 'full');
    expect(uiUnit(phone.game, phone.compact, { textSize: 'normal' }) * 9).toBeGreaterThanOrEqual(18);
    expect(uiUnit(phone.game, phone.compact, { textSize: 'larger' })).toBeGreaterThan(uiUnit(phone.game, phone.compact, { textSize: 'normal' }));
    // The desktop window the game was designed at keeps its old scale.
    expect(uiUnit({ x: 0, y: 0, w: 960, h: 640 }, false, { textSize: 'normal' })).toBe(2);
  });

  it('canvas backing scale is capped by DPR 2 and a pixel budget', () => {
    expect(backingScale(390, 600, 3)).toBe(2);
    expect(backingScale(390, 600, 1)).toBe(1);
    const k = backingScale(2560, 1440, 2);
    expect(2560 * 1440 * k * k).toBeLessThanOrEqual(MAX_BACKING_PIXELS * 1.01);
  });
});

describe('Cameras', () => {
  it('store camera is closer than the whole floor on phones, whole floor on the design-size desktop', () => {
    const near = shopZoom('near', 480, 320, 780, 1232, 2, 2.25);
    expect(near / 2).toBeGreaterThanOrEqual(2.25); // CSS px per world px
    expect(780 / near).toBeLessThan(480); // shows less than the full width: follows the player
    expect(shopZoom('near', 480, 320, 960, 640, 1, 2)).toBe(2);
    const over = shopZoom('overview', 480, 320, 780, 1232, 2, 2.25);
    expect(780 / over).toBeGreaterThanOrEqual(480 - 0.01);
  });

  it('camera follows inside the world and centres a world smaller than the view', () => {
    expect(clampCentre(10, 480, 156)).toBe(78);
    expect(clampCentre(470, 480, 156)).toBe(402);
    expect(clampCentre(200, 480, 156)).toBe(200);
    expect(clampCentre(30, 320, 400)).toBe(160);
    expect(containZoom(960, 640, 1920, 1280)).toBe(2);
  });

  it('world labels follow the camera transform', () => {
    const el = document.createElement('div');
    setLabelTransform(2.5, -100, -40);
    setLabelPos(el, 100, 50);
    expect(el.style.left).toBe('150px');
    expect(el.style.top).toBe('85px');
  });
});

describe('Tap to move', () => {
  const ground = FLOORS[0].layout;
  const grid = buildWalkGrid(ground);

  it('walks around obstacles one tile at a time, never diagonally', () => {
    // The walkable tile furthest (by straight distance) from the start.
    let goal = ground.playerStart;
    grid.forEach((row, y) => row.forEach((w, x) => {
      if (w && Math.hypot(x - ground.playerStart.x, y - ground.playerStart.y) > Math.hypot(goal.x - ground.playerStart.x, goal.y - ground.playerStart.y)) goal = { x, y };
    }));
    const plan = planTapPath(grid, ground.playerStart, goal)!;
    expect(plan).not.toBeNull();
    let cur = ground.playerStart;
    for (const t of plan.path) {
      expect(Math.abs(t.x - cur.x) + Math.abs(t.y - cur.y)).toBe(1);
      expect(grid[t.y][t.x]).toBe(true);
      cur = t;
    }
    expect(cur).toEqual(goal);
    expect(plan.face).toBeNull();
  });

  it('a tapped tank leads to its interaction tile, facing it', () => {
    const tank = ground.props.find((p) => p.kind === 'tank' && p.interact?.length)!;
    const approach = tank.interact!.map((t) => ({ ...t, face: faceToward(t, tank.x, tank.y, tank.w, tank.h) }));
    const plan = planTapPath(grid, ground.playerStart, { x: tank.x, y: tank.y }, approach)!;
    const end = plan.path[plan.path.length - 1];
    expect(tank.interact!.some((t) => t.x === end.x && t.y === end.y)).toBe(true);
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[plan.face!];
    const faced = { x: end.x + dx, y: end.y + dy };
    expect(faced.x >= tank.x && faced.x < tank.x + tank.w && faced.y >= tank.y && faced.y < tank.y + tank.h).toBe(true);
  });

  it('every floor: every interactable prop can be reached by tapping it', () => {
    for (const f of FLOORS) {
      const g = buildWalkGrid(f.layout);
      for (const p of f.layout.props.filter((q) => q.interact?.length)) {
        const approach = p.interact!.map((t) => ({ ...t, face: faceToward(t, p.x, p.y, p.w, p.h) }));
        expect(planTapPath(g, f.layout.playerStart, { x: p.x, y: p.y }, approach), `${f.id} ${p.id}`).not.toBeNull();
      }
    }
  });

  it('outside the floor or walled-off targets give no path', () => {
    expect(planTapPath(grid, ground.playerStart, { x: -1, y: 4 })).toBeNull();
    expect(planTapPath(grid, ground.playerStart, { x: ground.width + 2, y: 4 })).toBeNull();
    expect(TILE).toBe(16);
  });
});

describe('Display preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });

  it('defaults, persistence and bad data', () => {
    expect(getPrefs()).toEqual({ textSize: 'normal', font: 'pixel', camera: 'near', tapToMove: true, motion: 'system' });
    setPrefs({ textSize: 'large', font: 'readable' });
    resetPrefsCache();
    expect(getPrefs().textSize).toBe('large');
    expect(getPrefs().font).toBe('readable');
    expect(sanitizePrefs({ textSize: 'huge', font: 3, camera: 'x', tapToMove: 'yes' })).toEqual({ textSize: 'normal', font: 'pixel', camera: 'near', tapToMove: true, motion: 'system' });
    localStorage.setItem('tidepool.display', '{broken');
    resetPrefsCache();
    expect(getPrefs().textSize).toBe('normal');
  });
});
