// Functional checks for the near-realistic tank view (headless Chromium).
// Needs a developer build served at <url> (npm run build:sandbox, serve dist-sandbox/).
//
// node scripts/realism-check.mjs <url> <outdir>
//
// Checks, each PASS/FAIL with a screenshot:
//   optics:   Standard attaches the optics pass to the tank camera; Low does not and
//             shows the older rays and caustics instead
//   canvas:   with WebGL disabled the game falls back to Canvas, tanks open without
//             errors and draw (no optics pass, flat plants)
//   motion:   reduced motion is honoured in the tank view (calm flag)
//   tap:      on a phone, tapping a fish selects it
//   ghost:    aquascape ghost previews draw for a plant, a rock and a coral
//   night:    tanks render with the lights off
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:4176/', out = 'realism-check'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const results = [];
const report = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

async function session(opts, fn) {
  const browser = await chromium.launch({ executablePath: exe, args: opts.args ?? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 960, height: 640 }, deviceScaleFactor: opts.dpr ?? 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, opts.storage ?? {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}?sandbox`);
  await page.waitForFunction(() => window.__tidepool?.sim && window.__tidepool.game.scene.isActive('Shop'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  try {
    await fn(page, errors);
  } catch (e) {
    report(`session error`, false, e.message);
  }
  await browser.close();
}

const open = (page, id, mode = 'view', light = true) =>
  page.evaluate(({ id, mode, light }) => {
    const c = window.__tidepool;
    c.ui.clear();
    c.state.tanks[id].lightOn = light;
    c.openTankView(id, mode);
  }, { id, mode, light });
const close = (page) => page.evaluate(() => window.__tidepool.closeTankView());
const clearUi = (page) => page.evaluate(() => {
  const c = window.__tidepool;
  while (c.ui.top() && !c.ui.top().el.classList.contains('tank-view-ui')) c.ui.remove(c.ui.top());
});

// Standard vs Low.
for (const q of ['standard', 'low']) {
  await session({ storage: { 'tidepool:quality': q } }, async (page, errors) => {
    await open(page, 'M6');
    await page.waitForTimeout(4000);
    await clearUi(page);
    const r = await page.evaluate(() => {
      const s = window.__tidepool.game.scene.getScene('Tank');
      const cam = s.cameras.main;
      const tr = s.tankRenderer;
      return { post: cam.postPipelines.map((p) => p.name), rays: tr.rays.some((x) => x.visible), round: cam.roundPixels, detail: tr.detail };
    });
    await page.screenshot({ path: `${out}/optics-${q}.png` });
    const ok = q === 'low' ? r.post.length === 0 && r.rays : r.post.includes('WaterOptics') && !r.rays;
    report(`optics ${q}`, ok && !r.round && errors.length === 0, JSON.stringify(r) + (errors.length ? ' errors: ' + errors.join(' | ') : ''));
  });
}

// Canvas fallback.
await session({ args: ['--disable-webgl', '--disable-3d-apis'] }, async (page, errors) => {
  const type = await page.evaluate(() => window.__tidepool.game.renderer.type);
  for (const id of ['M6', 'V1', 'R2']) {
    await open(page, id);
    await page.waitForTimeout(3500);
    await clearUi(page);
    const post = await page.evaluate(() => window.__tidepool.game.scene.getScene('Tank').cameras.main.postPipelines?.length ?? 0);
    await page.screenshot({ path: `${out}/canvas-${id}.png` });
    report(`canvas ${id}`, type === 1 && post === 0 && errors.length === 0, `renderer type ${type}${errors.length ? ' errors: ' + errors.join(' | ') : ''}`);
    await close(page);
    await page.waitForTimeout(500);
  }
});

// Reduced motion.
await session({ storage: { 'tidepool.display': JSON.stringify({ motion: 'reduced' }) } }, async (page, errors) => {
  await open(page, 'M6');
  await page.waitForTimeout(2500);
  const calm = await page.evaluate(() => window.__tidepool.game.scene.getScene('Tank').tankRenderer.calm);
  report('reduced motion', calm === true && errors.length === 0, `calm ${calm}`);
});

// Tap to select on a phone.
await session({ viewport: { width: 390, height: 844 }, dpr: 2, mobile: true }, async (page, errors) => {
  await open(page, 'M6');
  await page.waitForTimeout(5000);
  await clearUi(page);
  let ok = false;
  let detail = '';
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    const pos = await page.evaluate(() => {
      const s = window.__tidepool.game.scene.getScene('Tank');
      const tr = s.tankRenderer;
      tr.selectedId = null;
      const a = [...tr.agents.values()].find((g) => g.sprite.visible && g.fish.alive && g.len > 20);
      const cam = s.cameras.main;
      const k = window.devicePixelRatio;
      const rect = s.game.canvas.getBoundingClientRect();
      return { x: rect.left + ((a.x - cam.worldView.x) * cam.zoom) / k, y: rect.top + ((a.y - cam.worldView.y) * cam.zoom) / k, id: a.fish.id };
    });
    await page.touchscreen.tap(pos.x, pos.y);
    await page.waitForTimeout(400);
    const sel = await page.evaluate(() => window.__tidepool.game.scene.getScene('Tank').tankRenderer.selectedId);
    ok = !!sel;
    detail = `tapped ${pos.id} at ${pos.x.toFixed(0)},${pos.y.toFixed(0)} selected ${sel}`;
  }
  await page.screenshot({ path: `${out}/tap-select-phone.png` });
  report('tap to select (phone)', ok && errors.length === 0, detail);
});

// Aquascape ghosts and night.
await session({}, async (page, errors) => {
  for (const [id, defId] of [['M6', 'amazon_sword'], ['M6', 'slate_stack'], ['R2', process.env.CORAL ?? 'zoanthids']]) {
    await open(page, id);
    await page.waitForTimeout(3000);
    await clearUi(page);
    const ok = await page.evaluate((defId) => {
      const tr = window.__tidepool.game.scene.getScene('Tank').tankRenderer;
      try {
        tr.setGhost({ defId, x: 0.5, layer: 1, size: 1 });
        return true;
      } catch (e) {
        return String(e);
      }
    }, defId);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/ghost-${defId}.png` });
    report(`ghost ${defId}`, ok === true && errors.length === 0, ok === true ? '' : ok);
    await close(page);
    await page.waitForTimeout(400);
  }
  for (const id of ['M6', 'V1', 'R2']) {
    await open(page, id, 'view', false);
    await page.waitForTimeout(3500);
    await clearUi(page);
    await page.screenshot({ path: `${out}/night-${id}.png` });
    report(`night ${id}`, errors.length === 0, errors.join(' | '));
    await close(page);
    await page.waitForTimeout(400);
  }
});

const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
