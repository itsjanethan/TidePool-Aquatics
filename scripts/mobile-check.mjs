// Emulated mobile checks (Chromium device emulation; not a real phone).
// node scripts/mobile-check.mjs <base url> <outdir>
// Checks: layout at 390x844 and 844x390, rotation, tap to move, camera follow,
// world labels tracking the camera, touch target sizes, minimum text size,
// text input with the layout held, interrupted touches, no page scroll.
import { chromium } from 'playwright-core';
const [base = 'http://localhost:5173/', out = '.'] = process.argv.slice(2);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(w, h, path = '?sandbox') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  await sleep(3500);
  await page.evaluate(() => window.__tidepool?.ui.clear());
  await sleep(500);
  return { ctx, page, errors };
}

/** Screen position (CSS px, page coords) of a world point in the store. */
const worldToScreen = (page, wx, wy) =>
  page.evaluate(([x, y]) => {
    const c = window.__tidepool;
    const cam = c.game.scene.getScene('Shop').cameras.main;
    const stage = document.getElementById('stage').getBoundingClientRect();
    const k = c.game.scale.width / stage.width;
    return { x: stage.left + ((x - cam.worldView.x) * cam.zoom) / k, y: stage.top + ((y - cam.worldView.y) * cam.zoom) / k };
  }, [wx, wy]);

for (const [w, h] of [[390, 844], [844, 390]]) {
  const tag = `${w}x${h}`;
  const { ctx, page, errors } = await open(w, h);
  // Layout: game rect inside the viewport, controls outside it, no overlap.
  const lay = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const stage = r(document.getElementById('stage'));
    const pad = r(document.querySelector('.touch-pad'));
    const btns = [...document.querySelectorAll('.touch-actions .touch-btn')].map(r);
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const targets = [...document.querySelectorAll('.touch-btn:not(.touch-pad .touch-btn), .hud-map, .hud-help')]
      .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .map((e) => { const b = r(e); return Math.min(b.width, b.height); });
    const padCell = r(document.querySelector('.tp-up'));
    return {
      stage: { x: stage.left, y: stage.top, w: stage.width, h: stage.height },
      inView: stage.left >= 0 && stage.top >= 0 && stage.right <= innerWidth + 0.5 && stage.bottom <= innerHeight + 0.5,
      controlsOverlapGame: overlap(stage, pad) || btns.some((b) => overlap(stage, b)),
      minTarget: Math.min(...targets, padCell.width, padCell.height),
      scroll: document.scrollingElement.scrollHeight > innerHeight || document.scrollingElement.scrollWidth > innerWidth,
      px: getComputedStyle(document.documentElement).getPropertyValue('--px'),
    };
  });
  ok(`${tag} game rect inside viewport`, lay.inView, JSON.stringify(lay.stage));
  ok(`${tag} controls beside/below the game, not over it`, !lay.controlsOverlapGame);
  ok(`${tag} touch targets >= 44 px`, lay.minTarget >= 44, `min ${lay.minTarget.toFixed(1)} px`);
  ok(`${tag} page does not scroll`, !lay.scroll);

  // Smallest rendered text in the HUD and an open menu.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { window.__tidepool.ui.clear(); window.__tidepool.input.press('menu'); });
    await sleep(400);
    if (await page.evaluate(() => !!document.querySelector('.panel .menu-list') && !document.querySelector('.dialogue'))) break;
  }
  const minText = await page.evaluate(() => {
    let min = Infinity; let where = '';
    for (const el of document.querySelectorAll('#ui *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || getComputedStyle(el).visibility === 'hidden' || el.closest('[style*="display: none"]')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < min) { min = fs; where = el.className || el.tagName; }
    }
    return { min, where };
  });
  ok(`${tag} smallest UI text >= 16 px`, minText.min >= 16, `${minText.min} px (${minText.where})`);
  // Menus scroll inside, the page does not.
  const scrolls = await page.evaluate(() => {
    const list = document.querySelector('.panel .menu-list');
    return { ta: getComputedStyle(list).touchAction, page: document.scrollingElement.scrollTop };
  });
  ok(`${tag} menu list pans vertically`, scrolls.ta.includes('pan-y') && scrolls.page === 0, scrolls.ta);
  await page.screenshot({ path: `${out}/check-menu-${tag}.png` });
  await page.evaluate(() => window.__tidepool.ui.clear());
  await sleep(300);

  // Tap to move: tap a tank on screen, the player walks to its front and faces it.
  const target = await page.evaluate(() => {
    const c = window.__tidepool;
    const sc = c.game.scene.getScene('Shop');
    const cam = sc.cameras.main;
    const v = cam.worldView;
    const stage = document.getElementById('stage').getBoundingClientRect();
    const k = c.game.scale.width / stage.width;
    // Only targets the finger can reach: the canvas is the top element there (not the HUD).
    const onCanvas = (wx, wy) => document.elementFromPoint(stage.left + ((wx - v.x) * cam.zoom) / k, stage.top + ((wy - v.y) * cam.zoom) / k)?.tagName === 'CANVAS';
    const tanks = sc.layout.props.filter((p) => p.kind === 'tank' && c.state.tanks[p.id] && p.interact?.length);
    // A tank fully on screen, not the one in front of the player.
    const vis = tanks.filter((p) => p.x * 16 >= v.x && (p.x + p.w) * 16 <= v.right && p.y * 16 >= v.y && (p.y + p.h) * 16 <= v.bottom && onCanvas((p.x + p.w / 2) * 16, (p.y + p.h / 2) * 16));
    const p = vis[vis.length - 1];
    const start = { x: c.state.player.x, y: c.state.player.y };
    if (p) return { id: p.id, wx: (p.x + p.w / 2) * 16, wy: (p.y + p.h / 2) * 16, spots: p.interact, start, kind: 'tank' };
    // No whole tank on screen: walk to the visible floor tile furthest from the player.
    let best = null;
    for (let y = Math.ceil(v.y / 16); y < Math.floor(v.bottom / 16); y++)
      for (let x = Math.ceil(v.x / 16); x < Math.floor(v.right / 16); x++)
        if (sc.grid[y]?.[x] && (!best || Math.abs(x - start.x) + Math.abs(y - start.y) > best.d) && onCanvas(x * 16 + 8, y * 16 + 8)) best = { x, y, d: Math.abs(x - start.x) + Math.abs(y - start.y) };
    return { id: `floor ${best.x},${best.y}`, wx: best.x * 16 + 8, wy: best.y * 16 + 8, spots: [{ x: best.x, y: best.y }], start, kind: 'floor' };
  });
  // Staff walk up with proposals in the sandbox (a blocking dialogue stops the walk); dismiss and tap again.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => window.__tidepool.ui.clear());
    await sleep(150);
    const pt = await worldToScreen(page, target.wx, target.wy);
    await page.touchscreen.tap(pt.x, pt.y);
    await sleep(5000);
    const done = await page.evaluate((spots) => {
      const c = window.__tidepool;
      return spots.some((s) => s.x === c.state.player.x && s.y === c.state.player.y);
    }, target.spots);
    if (done) break;
  }
  await page.evaluate(() => window.__tidepool.ui.clear());
  await sleep(300);
  const arrived = await page.evaluate(() => {
    const c = window.__tidepool;
    return { x: c.state.player.x, y: c.state.player.y, facing: c.state.player.facing, a: document.querySelector('.ta-a .tb-sub')?.textContent };
  });
  const atSpot = target.spots.some((s) => s.x === arrived.x && s.y === arrived.y);
  ok(`${tag} tap to move reaches ${target.id}`, atSpot && (target.kind === 'floor' || arrived.a === 'Tank'), `from ${JSON.stringify(target.start)} to ${arrived.x},${arrived.y} facing ${arrived.facing}, A=${arrived.a}`);
  // Camera follows the player: player within the middle of the view or the view is at a world edge.
  const cam = await page.evaluate(() => {
    const c = window.__tidepool;
    const sc = c.game.scene.getScene('Shop');
    const v = sc.cameras.main.worldView;
    const px = c.state.player.x * 16 + 8; const py = c.state.player.y * 16 + 8;
    return { inside: px >= v.x && px <= v.right && py >= v.y && py <= v.bottom, zoomCss: sc.cameras.main.zoom / (c.game.scale.width / document.getElementById('stage').getBoundingClientRect().width), view: [v.x, v.y, v.width, v.height].map(Math.round) };
  });
  ok(`${tag} camera keeps the player in view, closer than whole floor`, cam.inside && cam.view[2] < 480, JSON.stringify(cam));
  // A world label tracks the camera: a staff name tag sits under its sprite.
  const label = await page.evaluate(() => {
    const c = window.__tidepool;
    const sc = c.game.scene.getScene('Shop');
    for (const [id, v] of sc.staffViews) {
      if (v.name.style.display === 'none') continue;
      const cam = sc.cameras.main;
      const stage = document.getElementById('stage').getBoundingClientRect();
      const k = c.game.scale.width / stage.width;
      const sx = ((v.sprite.x - cam.worldView.x) * cam.zoom) / k;
      const lb = v.name.getBoundingClientRect();
      return { id, dx: Math.abs(lb.left + lb.width / 2 - stage.left - sx) };
    }
    return null;
  });
  ok(`${tag} world labels track the camera`, !label || label.dx < 3, JSON.stringify(label));
  await page.screenshot({ path: `${out}/check-store-${tag}.png` });

  // Interrupted touch: hold B and a direction, then the page is hidden; nothing stays held.
  const held = await page.evaluate(async () => {
    const c = window.__tidepool;
    const pad = document.querySelector('.touch-pad').getBoundingClientRect();
    const b = document.querySelector('.ta-b');
    const ev = (t, id, x, y, el) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', 11, pad.left + pad.width / 2, pad.top + 4, document.querySelector('.touch-pad'));
    ev('pointerdown', 12, 0, 0, b);
    const before = { dir: c.input.heldDirection(), run: c.input.runHeld() };
    window.dispatchEvent(new Event('blur'));
    return { before, after: { dir: c.input.heldDirection(), run: c.input.runHeld(), down: document.querySelectorAll('.touch-btn.down').length } };
  });
  ok(`${tag} interrupted touch clears held input`, held.before.run && held.before.dir && !held.after.run && !held.after.dir && held.after.down === 0, JSON.stringify(held));

  // Map view: whole floor fits.
  await page.evaluate(() => window.__tidepool.toggleMap());
  await sleep(400);
  const map = await page.evaluate(() => { const v = window.__tidepool.game.scene.getScene('Shop').cameras.main.worldView; return [v.width, v.height].map(Math.round); });
  ok(`${tag} map view shows the whole floor`, map[0] >= 480 && map[1] >= 320, JSON.stringify(map));
  await page.screenshot({ path: `${out}/check-map-${tag}.png` });
  await page.evaluate(() => window.__tidepool.toggleMap());
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Rotation: portrait to landscape and back keeps the layout consistent.
{
  const { ctx, page, errors } = await open(390, 844);
  const sizes = [];
  for (const [w, h] of [[844, 390], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(700);
    sizes.push(await page.evaluate(() => {
      const s = document.getElementById('stage').getBoundingClientRect();
      const c = window.__tidepool;
      return { stage: [Math.round(s.width), Math.round(s.height)], canvas: [c.game.scale.width, c.game.scale.height], landscape: document.body.classList.contains('landscape') };
    }));
  }
  const [l, p] = sizes;
  ok('rotation: landscape then portrait relayout', l.landscape && !p.landscape && l.stage[0] > l.stage[1] && p.stage[1] > p.stage[0] && Math.abs(l.canvas[0] / l.stage[0] - l.canvas[1] / l.stage[1]) < 0.02, JSON.stringify(sizes));
  ok('rotation: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Text input: the new game form on a phone. Typing works and the layout holds while the keyboard is up.
{
  const { ctx, page, errors } = await open(390, 844, '');
  await page.evaluate(() => {
    const c = window.__tidepool;
    import('/src/ui/screens/title.ts').then(() => undefined);
    c.ui.clear();
  });
  await page.goto(base);
  await sleep(3000);
  // Select "New Game" from the title menu by tapping it.
  const item = page.locator('.menu-item', { hasText: 'New Game' });
  await item.tap();
  await sleep(500);
  const input = page.locator('.new-game input').first();
  await input.tap();
  const before = await page.evaluate(() => document.getElementById('stage').getBoundingClientRect().height);
  await page.keyboard.type('Robin');
  // Simulate the on-screen keyboard shrinking the viewport while typing.
  await page.setViewportSize({ width: 390, height: 500 });
  await sleep(500);
  const during = await page.evaluate(() => ({ h: document.getElementById('stage').getBoundingClientRect().height, v: document.querySelector('.new-game input').value, fs: parseFloat(getComputedStyle(document.querySelector('.new-game input')).fontSize) }));
  await page.screenshot({ path: `${out}/check-input-390x844.png` });
  ok('text input: typing works, font >= 16 px (no iOS zoom), layout held while keyboard is up', during.v === 'Robin' && during.fs >= 16 && Math.abs(during.h - before) < 1, JSON.stringify({ before, during }));
  ok('text input: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
