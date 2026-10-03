// Memory and texture growth while visiting many tanks in one session
// (bounded caches check). Needs a developer build (see perf-tank.mjs).
// node scripts/perf-tour.mjs <url> [rounds]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4175/', rounds = '2'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await (await browser.newContext({ viewport: { width: 960, height: 640 } })).newPage();
await page.goto(`${url}?sandbox`);
await page.waitForFunction(() => window.__tidepool?.sim && window.__tidepool.game.scene.isActive('Shop'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
const rows = await page.evaluate(async (rounds) => {
  const c = window.__tidepool;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ids = c.state.tankOrder;
  const out = [];
  for (let round = 0; round < rounds; round++) {
    for (const id of ids) {
      c.ui.clear();
      c.openTankView(id);
      await wait(900);
      c.closeTankView();
      await wait(150);
    }
    globalThis.gc?.();
    await wait(300);
    const keys = Object.keys(c.game.textures.list);
    out.push({
      round: round + 1,
      tanksVisited: ids.length * (round + 1),
      heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      textures: keys.length,
      fishSheets: keys.filter((k) => k.startsWith('fish2:')).length,
      substrates: keys.filter((k) => k.startsWith('substrate3:')).length,
      mulm: keys.filter((k) => k.startsWith('mulm1:')).length,
    });
  }
  return out;
}, Number(rounds));
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
