// Tank view screenshots for visual review (headless Chromium, SwiftShader).
// Needs a developer build served somewhere (npm run build:sandbox, then serve
// dist-sandbox/), because it opens tanks through the developer-only hook.
//
// node scripts/tank-shots.mjs <url> <outdir> <prefix> [tanks] [viewports] [quality]
//   tanks:     comma list of tank ids (default M6,V1)
//   viewports: comma list of desktop,large,phone,phoneland (default desktop,phone)
//   quality:   low | standard | high | auto (default auto)
// Each shot waits for textures to paint and fish to settle, hides the tank
// view UI after the first shot (a second "-clean" shot), and a night shot is
// available with tank id suffix ":night".
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:4175/', outDir = 'shots', prefix = 'shot', tankList = 'M6,V1', vpList = 'desktop,phone', quality = 'auto'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const VIEWPORTS = {
  desktop: { width: 960, height: 640, dpr: 1, mobile: false },
  large: { width: 1440, height: 900, dpr: 1, mobile: false },
  phone: { width: 390, height: 844, dpr: 2, mobile: true },
  phoneland: { width: 844, height: 390, dpr: 2, mobile: true },
};
for (const vpName of vpList.split(',')) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
  await ctx.addInitScript((q) => {
    try {
      localStorage.setItem('tidepool:quality', q);
    } catch {
      /* ignore */
    }
  }, quality);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}?sandbox`);
  await page.waitForFunction(() => window.__tidepool?.sim && window.__tidepool.game.scene.isActive('Shop'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  for (const spec of tankList.split(',')) {
    const [id, mode] = spec.split(':');
    await page.evaluate(
      ({ id, mode }) => {
        const c = window.__tidepool;
        c.ui.clear();
        c.state.settings.speed = 1;
        const t = c.state.tanks[id];
        t.lightOn = mode !== 'night';
        c.openTankView(id);
      },
      { id, mode },
    );
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      const c = window.__tidepool;
      while (c.ui.top() && !c.ui.top().el.classList.contains('tank-view-ui')) c.ui.remove(c.ui.top());
    });
    const name = `${outDir}/${prefix}-${vpName}-${id}${mode ? '-' + mode : ''}`;
    await page.screenshot({ path: `${name}.png` });
    // Optional close-up (CLOSEUP=zoom): the camera zooms on the first animal of a species.
    if (process.env.CLOSEUP) {
      await page.evaluate(
        ({ z, sp }) => {
          const c = window.__tidepool;
          const scene = c.game.scene.getScene('Tank');
          const r = scene.tankRenderer;
          const a = [...r.agents.values()].find((g) => !sp || g.fish.speciesId === sp) ?? [...r.agents.values()][0];
          scene.fit = () => undefined;
          const cam = scene.cameras.main;
          cam.setZoom(cam.zoom * z);
          window.__closeup = setInterval(() => cam.centerOn(a.x, a.y), 16);
        },
        { z: Number(process.env.CLOSEUP), sp: process.env.SPECIES ?? '' },
      );
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const el = document.getElementById('ui');
        if (el) el.style.visibility = 'hidden';
      });
      await page.screenshot({ path: `${name}-closeup.png` });
      await page.evaluate(() => clearInterval(window.__closeup));
    }
    // Canvas only (no HTML overlay) for side-by-side comparisons.
    await page.evaluate(() => {
      const el = document.getElementById('ui');
      if (el) el.style.visibility = 'hidden';
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${name}-clean.png` });
    await page.evaluate(() => {
      const el = document.getElementById('ui');
      if (el) el.style.visibility = '';
      window.__tidepool.closeTankView();
    });
    await page.waitForTimeout(800);
    console.log(`${name}.png${errors.length ? ' ERR ' + errors.join(' | ') : ''}`);
    errors.length = 0;
  }
  await ctx.close();
}
await browser.close();
