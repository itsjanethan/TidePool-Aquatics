// Rapid-tap check in Chromium phone emulation (NOT a real device).
// node scripts/tap-zoom-check.mjs <url> [WxH ...]
//
// Sends real touch sequences through the DevTools protocol (touchStart /
// touchEnd, 90 ms apart) at the on-screen buttons, the d-pad, the gaps
// between buttons, the game area, the HUD Map button and a menu row. For each
// it reports how many game actions fired, how many clicks arrived, and
// whether each touchend that came within 500 ms of the previous one was
// cancelled (a cancelled touchend cannot start a double-tap zoom). Taps are
// sent as fast as the emulator allows; the real gaps are printed.
// Headless Chromium does not perform double-tap zoom itself, so the page
// scale cannot be observed here; this checks the mechanism and duplicates.
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5173/?sandbox', ...sizes] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
let failures = 0;
for (const size of sizes.length ? sizes : ['390x844', '844x390']) {
  const [w, h] = size.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(3500);
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => {
    const c = window.__tidepool;
    c.ui.clear();
    // Staff walk up with proposals in the sandbox; their dialogues would steal taps mid-test.
    c.state.staff.length = 0;
    window.__log = { presses: 0, clicks: 0, ends: [] };
    c.input.events.on('press', () => window.__log.presses++);
    document.addEventListener('click', () => window.__log.clicks++, true);
    // Bubble listener on window runs after the game's handlers.
    window.addEventListener('touchend', (e) => window.__log.ends.push([e.defaultPrevented, performance.now()]));
  });
  const tapN = async (pt, n) => {
    for (let i = 0; i < n; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(250);
  };
  const center = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const run = async (label, pt, n, expect) => {
    await page.evaluate(() => { const c = window.__tidepool; while (c.ui.top()) c.ui.remove(c.ui.top()); window.__log.presses = 0; window.__log.clicks = 0; window.__log.ends = []; });
    if (expect.prep) await page.evaluate(expect.prep);
    if (expect.target) {
      await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), expect.target);
      await page.waitForTimeout(150);
      pt = await center(expect.target);
    }
    await page.evaluate(() => { window.__log.presses = 0; window.__log.clicks = 0; window.__log.ends = []; });
    await tapN(pt, n);
    const log = await page.evaluate(() => window.__log);
    // A touchend left to the browser within 500 ms of the previous one could start a double-tap zoom.
    const zoomable = log.ends.filter(([p], i) => !p).length;
    const risky = log.ends.filter(([p, t], i) => i > 0 && !p && t - log.ends[i - 1][1] < 500).length;
    const gaps = log.ends.slice(1).map(([, t], i) => Math.round(t - log.ends[i][1]));
    const ok = (expect.presses === undefined || log.presses === expect.presses) && (expect.clicks === undefined || log.clicks === expect.clicks) && zoomable <= expect.maxZoomable && risky === 0;
    if (!ok) failures++;
    rows.push(`${ok ? 'PASS' : 'FAIL'}  ${size} ${label.padEnd(26)} ${n} taps: presses ${log.presses}, clicks ${log.clicks}, touchends left to the browser ${zoomable}/${log.ends.length}, quick ones left ${risky} (gaps ${gaps.join('/')} ms)`);
  };
  await run('B button', await center('.ta-b'), 5, { presses: 5, clicks: 0, maxZoomable: 0 });
  await run('A button', await center('.ta-a'), 2, { presses: 2, clicks: 0, maxZoomable: 0 });
  await run('d-pad up', await center('.tp-up'), 6, { presses: 6, clicks: 0, maxZoomable: 0 });
  await run('menu button', await center('.ta-menu'), 1, { presses: 1, clicks: 0, maxZoomable: 0 });
  const gap = await page.evaluate(() => { const r = document.querySelector('.touch-actions').getBoundingClientRect(); return { x: r.left + 3, y: r.top + 3 }; });
  await run('gap between buttons', gap, 3, { maxZoomable: 3 });
  await run('game area', await center('#stage'), 3, { maxZoomable: 3 });
  await run('HUD Map button', null, 2, { target: '.hud-map', clicks: 2, maxZoomable: 2 });
  await run('pause menu row (speed >)', null, 3, {
    prep: async () => {
      const c = window.__tidepool;
      for (let i = 0; i < 5 && !document.querySelector('.menu-item .mini-btn'); i++) {
        while (c.ui.top()) c.ui.remove(c.ui.top());
        c.input.press('menu');
        await new Promise((r) => setTimeout(r, 200));
      }
    },
    target: '.menu-item .mini-btn:last-child',
    clicks: 3,
    maxZoomable: 3,
  });
  // Rotation while holding B and a direction releases both.
  const held = await page.evaluate(() => { const c = window.__tidepool; c.input.setVirtual('up', true); c.input.setVirtual('back', true); return c.input.runHeld(); });
  await page.setViewportSize({ width: h, height: w });
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ run: window.__tidepool.input.runHeld(), dir: window.__tidepool.input.heldDirection() }));
  const rotOk = held && !after.run && !after.dir;
  if (!rotOk) failures++;
  rows.push(`${rotOk ? 'PASS' : 'FAIL'}  ${size} rotate while holding B + up: released ${JSON.stringify(after)}`);
  await ctx.close();
}
await browser.close();
for (const r of rows) console.log(r);
process.exit(failures ? 1 : 0);
